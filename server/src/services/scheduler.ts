import cron from 'node-cron';
import webpush from 'web-push';
import db from '../db';
import { sendTaskReminder } from './mail';
import { resetOverdueStreaks } from './gamification';
import { getVapidFromDb } from '../webpush-config';
import { BASE_URL } from '../config';

interface TaskRow {
  id: string;
  title: string;
  due_date: number;
  created_by: string;
  notify_email: number;
  notify_7day: number;
  notify_1day: number;
  notify_onday: number;
  notify_popup_7day: number;
  notify_popup_1day: number;
  notify_popup_onday: number;
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

/**
 * Send web push notifications for a specific task reminder to all subscribed browsers for a user.
 * Returns `true` if at least one push notification was successfully delivered — the caller uses
 * this to decide whether to write the deduplication record in `task_reminders_sent`.
 */
async function sendPushNotificationsForUser(userId: string, taskId: string, taskTitle: string, windowLabel: string): Promise<boolean> {
  const { publicKey, privateKey } = getVapidFromDb();
  if (!publicKey || !privateKey) return false;

  const subscriptions = db.prepare(
    'SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = ?'
  ).all(userId) as PushSubscriptionRow[];

  if (subscriptions.length === 0) return false;

  const appUrl = BASE_URL || '';
  const payload = JSON.stringify({
    title: 'TaskIt! Reminder',
    body: `"${taskTitle}" is due in ${windowLabel}.`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    url: `${appUrl}/?task=${taskId}`,
  });

  // Send to all subscriptions in parallel; handle 410/404 by removing stale rows.
  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
        payload
      ).catch((err: unknown) => {
        const httpStatus = (err as { statusCode?: number }).statusCode;
        if (httpStatus === 410 || httpStatus === 404) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        } else {
          console.error(`[scheduler] Failed to send push notification to subscription ${sub.id}:`, err);
        }
        throw err; // re-throw so allSettled records it as rejected
      })
    )
  );

  return results.some(r => r.status === 'fulfilled');
}

async function sendReminders(): Promise<void> {
  const now = Date.now();

  for (const window of REMINDER_WINDOWS) {
    const minDue = now + window.minMs;
    const maxDue = now + window.maxMs;

    const tasks = db.prepare(`
      SELECT t.id, t.title, t.due_date, t.created_by,
             t.notify_email, t.notify_7day, t.notify_1day, t.notify_onday,
             t.notify_popup_7day, t.notify_popup_1day, t.notify_popup_onday
      FROM tasks t
      WHERE t.due_date IS NOT NULL
        AND t.due_date > ?
        AND t.due_date <= ?
        AND t.status != 'complete'
        AND t.archived = 0
        AND (
          t.notify_email = 1
          OR t.notify_popup_7day = 1
          OR t.notify_popup_1day = 1
          OR t.notify_popup_onday = 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM task_reminders_sent trs
          WHERE trs.task_id = t.id AND trs.reminder_type = ?
        )
    `).all(minDue, maxDue, window.type) as TaskRow[];

    for (const task of tasks) {
      // Determine which delivery channels are applicable for this window
      const emailApplicable = task.notify_email === 1 && (
        (window.type === '7_day'  && task.notify_7day === 1) ||
        (window.type === '1_day'  && task.notify_1day === 1) ||
        (window.type === 'on_day' && task.notify_onday === 1)
      );
      const pushApplicable =
        (window.type === '7_day'  && task.notify_popup_7day === 1) ||
        (window.type === '1_day'  && task.notify_popup_1day === 1) ||
        (window.type === 'on_day' && task.notify_popup_onday === 1);

      if (!emailApplicable && !pushApplicable) continue;

      const recipientIds = new Set<string>();
      recipientIds.add(task.created_by);

      const assignees = db.prepare(
        'SELECT user_id FROM task_assignees WHERE task_id = ?'
      ).all(task.id) as Array<{ user_id: string }>;

      for (const a of assignees) {
        recipientIds.add(a.user_id);
      }

      let anyDelivered = false;
      for (const userId of recipientIds) {
        const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as UserRow | undefined;
        if (!user) continue;
        if (emailApplicable) {
          try {
            await sendTaskReminder(user.email, { title: task.title, due_date: task.due_date }, window.label);
            anyDelivered = true;
          } catch (err) {
            console.error(`[scheduler] Failed to send reminder to ${user.email}:`, err);
          }
        }
        // Send web push only when the popup flag is set for this window; counts toward dedup
        // so a push-only success also prevents re-running the reminder indefinitely when
        // SMTP is temporarily broken.
        if (pushApplicable) {
          const pushed = await sendPushNotificationsForUser(userId, task.id, task.title, window.label);
          if (pushed) anyDelivered = true;
        }
      }

      if (anyDelivered) {
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
