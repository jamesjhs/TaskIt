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
  push_reminder_time: string | null;
  push_time_zone: string | null;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
}

interface ReminderWindow {
  type: '7_day' | '1_day' | 'on_day';
  label: string;
  offsetDays: number;
  minDueOffsetMs: number;
  maxDueOffsetMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PUSH_LOOKBACK_MS = 70 * 60 * 1000;
const DEFAULT_PUSH_REMINDER_TIME = '09:00';
const DEFAULT_PUSH_TIME_ZONE = 'UTC';

// Query ranges are intentionally wider than the exact send window so per-user
// local-time push reminders can be evaluated without missing the correct hour.
// In particular, the 1-day push window starts at 0h because due dates are
// stored at local midnight; a user choosing an afternoon/evening reminder time
// still needs the task to be considered on the previous day, even though the
// raw `due_date - now` difference is already < 24h. Exact send timing is still
// enforced later by isPushReminderDueNow()/isEmailReminderDueNow().
const REMINDER_WINDOWS: ReminderWindow[] = [
  { type: '7_day', label: '7 days', offsetDays: 7, minDueOffsetMs: 6 * DAY_MS, maxDueOffsetMs: 8 * DAY_MS },
  { type: '1_day', label: '1 day', offsetDays: 1, minDueOffsetMs: 0, maxDueOffsetMs: 2 * DAY_MS },
  { type: 'on_day', label: 'today', offsetDays: 0, minDueOffsetMs: -1 * DAY_MS, maxDueOffsetMs: 0 },
];

/**
 * Send web push notifications for a specific task reminder to all subscribed browsers for a user.
 * Returns `true` if at least one push notification was successfully delivered.
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

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
        payload
      ).catch((err: unknown) => {
        const httpStatus = (err as { statusCode?: number }).statusCode;
        if (httpStatus === 410 || httpStatus === 404 || httpStatus === 401 || httpStatus === 403) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
          if (httpStatus === 401 || httpStatus === 403) {
            console.warn(`[scheduler] Removed push subscription ${sub.id} due to VAPID key mismatch (HTTP ${httpStatus}). User will resubscribe on next page load.`);
          }
        } else {
          console.error(`[scheduler] Failed to send push notification to subscription ${sub.id}:`, err);
        }
        throw err;
      })
    )
  );

  return results.some(r => r.status === 'fulfilled');
}

function isValidPushReminderTime(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function getSafePushReminderTime(value: string | null | undefined): string {
  return isValidPushReminderTime(value) ? value : DEFAULT_PUSH_REMINDER_TIME;
}

function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function getSafeTimeZone(value: string | null | undefined): string {
  return isValidTimeZone(value) ? value : DEFAULT_PUSH_TIME_ZONE;
}

function parseReminderTime(value: string): { hours: number; minutes: number } {
  const [hours, minutes] = getSafePushReminderTime(value).split(':').map(part => parseInt(part, 10));
  return { hours, minutes };
}

function getZonedDateParts(timestamp: number, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(new Date(timestamp));
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find(part => part.type === type)?.value;
    return value ? parseInt(value, 10) : 0;
  };

  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

function getTimeZoneOffsetMs(timestamp: number, timeZone: string): number {
  const parts = getZonedDateParts(timestamp, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - timestamp;
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hours: number, minutes: number, timeZone: string): number {
  const naiveUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const firstOffset = getTimeZoneOffsetMs(naiveUtc, timeZone);
  let resolvedUtc = naiveUtc - firstOffset;
  // Re-check after applying the first offset so DST boundary cases (where the
  // same local clock time maps to different UTC instants) settle on the actual
  // offset for the resolved timestamp.
  const secondOffset = getTimeZoneOffsetMs(resolvedUtc, timeZone);
  if (secondOffset !== firstOffset) {
    resolvedUtc = naiveUtc - secondOffset;
  }
  return resolvedUtc;
}

function shiftCalendarDate(year: number, month: number, day: number, dayDelta: number): { year: number; month: number; day: number } {
  // Treat the input as a pure calendar date rather than elapsed milliseconds so
  // DST changes never skew the resulting local day we later convert back into
  // the user's timezone.
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + dayDelta);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function getScheduledPushTimestamp(taskDueDate: number, window: ReminderWindow, user: UserRow): number {
  const timeZone = getSafeTimeZone(user.push_time_zone);
  const dueParts = getZonedDateParts(taskDueDate, timeZone);
  const reminderDate = shiftCalendarDate(dueParts.year, dueParts.month, dueParts.day, -window.offsetDays);
  const { hours, minutes } = parseReminderTime(user.push_reminder_time ?? DEFAULT_PUSH_REMINDER_TIME);
  return zonedDateTimeToUtc(
    reminderDate.year,
    reminderDate.month,
    reminderDate.day,
    hours,
    minutes,
    timeZone
  );
}

function isPushReminderDueNow(task: TaskRow, window: ReminderWindow, user: UserRow, now: number): boolean {
  const scheduledAt = getScheduledPushTimestamp(task.due_date, window, user);
  return scheduledAt <= now && scheduledAt > now - PUSH_LOOKBACK_MS;
}

function isEmailReminderDueNow(task: TaskRow, window: ReminderWindow, now: number): boolean {
  const diff = task.due_date - now;
  if (window.type === '7_day') return diff > 6 * DAY_MS && diff <= 8 * DAY_MS;
  if (window.type === '1_day') return diff > 22 * HOUR_MS && diff <= 50 * HOUR_MS;
  return diff <= 0 && diff > -1 * DAY_MS;
}

async function sendReminders(): Promise<void> {
  const now = Date.now();

  for (const window of REMINDER_WINDOWS) {
    const minDue = now + window.minDueOffsetMs;
    const maxDue = now + window.maxDueOffsetMs;

    // This intentionally over-fetches candidate tasks for push reminders; the
    // exact per-channel send checks below decide whether a reminder is truly due.
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
    `).all(minDue, maxDue) as TaskRow[];

    for (const task of tasks) {
      const emailApplicable = task.notify_email === 1 && (
        (window.type === '7_day' && task.notify_7day === 1) ||
        (window.type === '1_day' && task.notify_1day === 1) ||
        (window.type === 'on_day' && task.notify_onday === 1)
      );
      const pushApplicable = (
        (window.type === '7_day' && task.notify_popup_7day === 1) ||
        (window.type === '1_day' && task.notify_popup_1day === 1) ||
        (window.type === 'on_day' && task.notify_popup_onday === 1)
      );

      if (!emailApplicable && !pushApplicable) continue;

      const recipientIds = new Set<string>([task.created_by]);
      const assignees = db.prepare(
        'SELECT user_id FROM task_assignees WHERE task_id = ?'
      ).all(task.id) as Array<{ user_id: string }>;

      for (const assignee of assignees) {
        recipientIds.add(assignee.user_id);
      }

      const emailReminderAlreadySent = !!db.prepare(
        'SELECT 1 FROM task_reminders_sent WHERE task_id = ? AND reminder_type = ?'
      ).get(task.id, window.type);
      const shouldSendEmail = emailApplicable && !emailReminderAlreadySent && isEmailReminderDueNow(task, window, now);

      let emailDelivered = false;
      for (const userId of recipientIds) {
        const user = db.prepare(
          'SELECT id, email, push_reminder_time, push_time_zone FROM users WHERE id = ?'
        ).get(userId) as UserRow | undefined;
        if (!user) continue;

        if (shouldSendEmail) {
          try {
            await sendTaskReminder(user.email, { title: task.title, due_date: task.due_date }, window.label);
            emailDelivered = true;
          } catch (err) {
            console.error(`[scheduler] Failed to send reminder to ${user.email}:`, err);
          }
        }

        if (!pushApplicable) continue;

        const pushReminderAlreadySent = !!db.prepare(
          'SELECT 1 FROM task_push_reminders_sent WHERE task_id = ? AND reminder_type = ? AND user_id = ?'
        ).get(task.id, window.type, userId);

        if (pushReminderAlreadySent || !isPushReminderDueNow(task, window, user, now)) continue;

        const pushed = await sendPushNotificationsForUser(userId, task.id, task.title, window.label);
        if (pushed) {
          db.prepare(
            'INSERT OR IGNORE INTO task_push_reminders_sent (task_id, reminder_type, user_id, sent_at) VALUES (?, ?, ?, ?)'
          ).run(task.id, window.type, userId, now);
        }
      }

      if (shouldSendEmail && emailDelivered) {
        db.prepare(
          'INSERT OR IGNORE INTO task_reminders_sent (task_id, reminder_type, sent_at) VALUES (?, ?, ?)'
        ).run(task.id, window.type, now);
      }
    }
  }
}

export function startScheduler(): void {
  cron.schedule('0 * * * *', () => {
    sendReminders().catch(err => console.error('[scheduler] Error in reminder job:', err));
    try {
      resetOverdueStreaks();
    } catch (err) {
      console.error('[scheduler] Error resetting overdue streaks:', err);
    }
  });
  console.log('[scheduler] Task reminder scheduler started (email + local-time push reminders)');
}
