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

async function sendReminders(): Promise<void> {
  const now = Date.now();
  const in24h = now + 24 * 60 * 60 * 1000;

  const tasks = db.prepare(`
    SELECT id, title, due_date, created_by
    FROM tasks
    WHERE due_date IS NOT NULL
      AND due_date > ?
      AND due_date <= ?
      AND status != 'complete'
      AND archived = 0
  `).all(now, in24h) as TaskRow[];

  for (const task of tasks) {
    const recipientIds = new Set<string>();
    recipientIds.add(task.created_by);

    const assignees = db.prepare(
      'SELECT user_id FROM task_assignees WHERE task_id = ?'
    ).all(task.id) as Array<{ user_id: string }>;

    for (const a of assignees) {
      recipientIds.add(a.user_id);
    }

    for (const userId of recipientIds) {
      const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as UserRow | undefined;
      if (!user) continue;
      try {
        await sendTaskReminder(user.email, { title: task.title, due_date: task.due_date });
      } catch (err) {
        console.error(`[scheduler] Failed to send reminder to ${user.email}:`, err);
      }
    }
  }
}

export function startScheduler(): void {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    sendReminders().catch(err => console.error('[scheduler] Error in reminder job:', err));
  });
  console.log('[scheduler] Task reminder scheduler started');
}
