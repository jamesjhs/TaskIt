import cron from 'node-cron';
import db from '../db';
import { sendTaskReminder } from './mail';

interface TaskRow {
  id: string;
  title: string;
  due_date: number;
  created_by: string;
}

interface UserRow {
  id: string;
  email: string;
}

// Reminder thresholds: type name → milliseconds before deadline
const REMINDER_WINDOWS: Array<{ type: string; minMs: number; maxMs: number; label: string }> = [
  { type: '7_day',   minMs: 6 * 24 * 60 * 60 * 1000, maxMs: 8 * 24 * 60 * 60 * 1000, label: '7 days' },
  { type: '1_day',   minMs: 0,                        maxMs: 2 * 24 * 60 * 60 * 1000, label: '1 day'  },
  { type: 'overdue', minMs: -Infinity,                 maxMs: 0,                        label: 'overdue' },
];

async function sendReminders(): Promise<void> {
  const now = Date.now();

  for (const window of REMINDER_WINDOWS) {
    const minDue = now + window.minMs;
    const maxDue = now + window.maxMs;

    const tasks = db.prepare(`
      SELECT t.id, t.title, t.due_date, t.created_by
      FROM tasks t
      WHERE t.due_date IS NOT NULL
        AND t.due_date > ?
        AND t.due_date <= ?
        AND t.status != 'complete'
        AND t.archived = 0
        AND NOT EXISTS (
          SELECT 1 FROM task_reminders_sent trs
          WHERE trs.task_id = t.id AND trs.reminder_type = ?
        )
    `).all(minDue, maxDue, window.type) as TaskRow[];

    for (const task of tasks) {
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
  });
  console.log('[scheduler] Task reminder scheduler started (up to 3 reminders per task)');
}
