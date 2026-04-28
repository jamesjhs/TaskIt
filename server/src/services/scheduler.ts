import cron from 'node-cron';
import webpush from 'web-push';
import db from '../db';
import { sendTaskReminder } from './mail';
import { resetOverdueStreaks } from './gamification';
import { VAPID, BASE_URL } from '../config';

interface TaskRow {
  id: string;
  title: string;
  due_date: number;
  created_by: string;
  notify_email: number;
  notify_7day: number;
  notify_1day: number;
  notify_onday: number;
}

interface UserRow {
  id: string;
  email: string;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
}

// Reminder thresholds: type name → milliseconds before deadline.
// Windows overlap slightly so that tasks are never missed due to the scheduler
// running a few minutes late; task_reminders_sent deduplicates actual sends.
const REMINDER_WINDOWS: Array<{ type: string; minMs: number; maxMs: number; label: string }> = [
  { type: '7_day',  minMs: 6 * 24 * 60 * 60 * 1000, maxMs: 8 * 24 * 60 * 60 * 1000, label: '7 days'  },
  { type: '1_day',  minMs: 22 * 60 * 60 * 1000,      maxMs: 50 * 60 * 60 * 1000,     label: '1 day'   },
  { type: 'on_day', minMs: 0,                         maxMs: 25 * 60 * 60 * 1000,     label: 'today'   },
];

async function sendPushNotificationsForUser(userId: string, taskId: string, taskTitle: string, windowLabel: string): Promise<void> {
  if (!VAPID.publicKey || !VAPID.privateKey) return;

  const subscriptions = db.prepare(
    'SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = ?'
  ).all(userId) as PushSubscriptionRow[];

  const appUrl = BASE_URL || '';
  const payload = JSON.stringify({
    title: 'TaskIt! Reminder',
    body: `"${taskTitle}" is due in ${windowLabel}.`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    url: `${appUrl}/?task=${taskId}`,
  });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
        payload
      );
    } catch (err: unknown) {
      const httpStatus = (err as { statusCode?: number }).statusCode;
      if (httpStatus === 410 || httpStatus === 404) {
        // Subscription expired or unregistered — remove it.
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      } else {
        console.error(`[scheduler] Failed to send push notification to subscription ${sub.id}:`, err);
      }
    }
  }
}

async function sendReminders(): Promise<void> {
  const now = Date.now();

  for (const window of REMINDER_WINDOWS) {
    const minDue = now + window.minMs;
    const maxDue = now + window.maxMs;

    const tasks = db.prepare(`
      SELECT t.id, t.title, t.due_date, t.created_by,
             t.notify_email, t.notify_7day, t.notify_1day, t.notify_onday
      FROM tasks t
      WHERE t.due_date IS NOT NULL
        AND t.due_date > ?
        AND t.due_date <= ?
        AND t.status != 'complete'
        AND t.archived = 0
        AND t.notify_email = 1
        AND NOT EXISTS (
          SELECT 1 FROM task_reminders_sent trs
          WHERE trs.task_id = t.id AND trs.reminder_type = ?
        )
    `).all(minDue, maxDue, window.type) as TaskRow[];

    for (const task of tasks) {
      // Respect per-reminder-type flags
      if (window.type === '7_day'  && !task.notify_7day)  continue;
      if (window.type === '1_day'  && !task.notify_1day)  continue;
      if (window.type === 'on_day' && !task.notify_onday) continue;

      const recipientIds = new Set<string>();
      recipientIds.add(task.created_by);

      const assignees = db.prepare(
        'SELECT user_id FROM task_assignees WHERE task_id = ?'
      ).all(task.id) as Array<{ user_id: string }>;

      for (const a of assignees) {
        recipientIds.add(a.user_id);
      }

      let anySent = false;
      for (const userId of recipientIds) {
        const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as UserRow | undefined;
        if (!user) continue;
        try {
          await sendTaskReminder(user.email, { title: task.title, due_date: task.due_date }, window.label);
          anySent = true;
        } catch (err) {
          console.error(`[scheduler] Failed to send reminder to ${user.email}:`, err);
        }
        // Send web push in parallel with email — failures are handled inside
        await sendPushNotificationsForUser(userId, task.id, task.title, window.label);
      }

      if (anySent) {
        db.prepare(
          'INSERT OR IGNORE INTO task_reminders_sent (task_id, reminder_type, sent_at) VALUES (?, ?, ?)'
        ).run(task.id, window.type, now);
      }
    }
  }
}

export function startScheduler(): void {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    sendReminders().catch(err => console.error('[scheduler] Error in reminder job:', err));
    // resetOverdueStreaks uses synchronous better-sqlite3 calls — no async needed.
    // The try/catch guards against unexpected runtime errors (e.g. schema migration lag).
    try {
      resetOverdueStreaks();
    } catch (err) {
      console.error('[scheduler] Error resetting overdue streaks:', err);
    }
  });
  console.log('[scheduler] Task reminder scheduler started (up to 3 reminders per task)');
}
