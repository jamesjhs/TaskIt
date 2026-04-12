import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import db from '../db';

const router = Router();

router.use(authMiddleware, adminMiddleware);

interface SmtpSettings {
  id: number;
  host: string;
  port: number;
  secure: number;
  username: string;
  pass: string;
  from_addr: string;
  enabled: number;
  updated_at: number;
}

router.get('/smtp', (_req: Request, res: Response): void => {
  const row = db.prepare('SELECT id, host, port, secure, username, from_addr, enabled, updated_at FROM smtp_settings WHERE id = 1').get() as Omit<SmtpSettings, 'pass'> | undefined;
  if (!row) {
    res.status(404).json({ error: 'SMTP settings not found' });
    return;
  }
  res.json(row);
});

router.put('/smtp', (req: Request, res: Response): void => {
  const { host, port, secure, user: username, pass, from_addr, enabled } = req.body;

  const current = db.prepare('SELECT pass FROM smtp_settings WHERE id = 1').get() as { pass: string } | undefined;
  const existingPass = current?.pass || '';
  const newPass = typeof pass === 'string' && pass.length > 0 ? pass : existingPass;

  db.prepare(`
    UPDATE smtp_settings
    SET host = ?, port = ?, secure = ?, username = ?, pass = ?, from_addr = ?, enabled = ?, updated_at = ?
    WHERE id = 1
  `).run(
    host || '',
    port != null ? parseInt(String(port), 10) : 587,
    secure ? 1 : 0,
    username || '',
    newPass,
    from_addr || '',
    enabled ? 1 : 0,
    Date.now()
  );

  res.json({ message: 'SMTP settings updated' });
});

router.get('/users', (_req: Request, res: Response): void => {
  const users = db.prepare(
    'SELECT id, username, email, role, failed_logins, locked_until, created_at FROM users ORDER BY created_at ASC'
  ).all();
  res.json(users);
});

router.get('/locked', (_req: Request, res: Response): void => {
  const now = Date.now();
  const users = db.prepare(
    'SELECT id, username, email, role, failed_logins, locked_until, created_at FROM users WHERE locked_until > ? ORDER BY locked_until ASC'
  ).all(now);
  res.json(users);
});

router.post('/users/:id/unlock', (req: Request, res: Response): void => {
  const userId = req.params.id;
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(userId);
  res.json({ message: 'Account unlocked' });
});

router.put('/users/:id/role', (req: Request, res: Response): void => {
  const targetId = req.params.id;
  const requesterId = req.user!.id;
  const { role } = req.body;

  if (targetId === requesterId) {
    res.status(400).json({ error: 'Cannot change your own role' });
    return;
  }

  if (role !== 'admin' && role !== 'user') {
    res.status(400).json({ error: 'role must be "admin" or "user"' });
    return;
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
  res.json({ message: 'Role updated' });
});

router.get('/reports', (_req: Request, res: Response): void => {
  const reports = db.prepare(`
    SELECT
      r.id, r.reason, r.created_at, r.resolved,
      reporter.username AS reporter_username,
      reporter.email AS reporter_email,
      reported.username AS reported_username,
      reported.email AS reported_email
    FROM user_reports r
    JOIN users reporter ON reporter.id = r.reporter_id
    JOIN users reported ON reported.id = r.reported_id
    ORDER BY r.created_at DESC
  `).all();
  res.json(reports);
});

router.put('/reports/:id/resolve', (req: Request, res: Response): void => {
  const reportId = req.params.id;
  const report = db.prepare('SELECT id FROM user_reports WHERE id = ?').get(reportId);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  db.prepare('UPDATE user_reports SET resolved = 1 WHERE id = ?').run(reportId);
  res.json({ message: 'Report resolved' });
});

router.get('/stats', (_req: Request, res: Response): void => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const totalUsers = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  const activeToday = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE last_active_at >= ?').get(todayMs) as { cnt: number }).cnt;
  const totalTasks = (db.prepare('SELECT COUNT(*) as cnt FROM tasks').get() as { cnt: number }).cnt;
  const tasksToday = (db.prepare('SELECT COUNT(*) as cnt FROM tasks WHERE created_at >= ?').get(todayMs) as { cnt: number }).cnt;
  res.json({ totalUsers, activeToday, totalTasks, tasksToday });
});

router.get('/feedback', (_req: Request, res: Response): void => {
  const rows = db.prepare(`
    SELECT f.id, f.subject, f.message, f.contact_ok, f.status, f.read_at, f.created_at,
           u.username, u.email
    FROM feedback_messages f
    JOIN users u ON u.id = f.user_id
    ORDER BY f.created_at DESC
  `).all();
  res.json(rows);
});

router.put('/feedback/:id/read', (req: Request, res: Response): void => {
  const fbId = req.params.id;
  const row = db.prepare('SELECT id FROM feedback_messages WHERE id = ?').get(fbId);
  if (!row) { res.status(404).json({ error: 'Feedback not found' }); return; }
  db.prepare('UPDATE feedback_messages SET read_at = ? WHERE id = ?').run(Date.now(), fbId);
  res.json({ message: 'Marked as read' });
});

router.patch('/feedback/:id/status', (req: Request, res: Response): void => {
  const fbId = req.params.id;
  const { status } = req.body;
  const VALID_STATUSES = new Set(['not_started', 'in_progress', 'completed', 'archived']);
  if (!status || !VALID_STATUSES.has(status)) {
    res.status(400).json({ error: 'status must be one of: not_started, in_progress, completed, archived' });
    return;
  }
  const row = db.prepare('SELECT id FROM feedback_messages WHERE id = ?').get(fbId);
  if (!row) { res.status(404).json({ error: 'Feedback not found' }); return; }
  const now = Date.now();
  if (status !== 'not_started') {
    db.prepare('UPDATE feedback_messages SET status = ?, read_at = COALESCE(read_at, ?) WHERE id = ?').run(status, now, fbId);
  } else {
    db.prepare('UPDATE feedback_messages SET status = ?, read_at = NULL WHERE id = ?').run(status, fbId);
  }
  res.json({ message: 'Status updated' });
});

router.post('/feedback/:id/reply', (req: Request, res: Response): void => {
  const fbId = req.params.id;
  const { message } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const fb = db.prepare('SELECT id, user_id FROM feedback_messages WHERE id = ?').get(fbId) as
    | { id: string; user_id: string }
    | undefined;

  if (!fb) { res.status(404).json({ error: 'Feedback not found' }); return; }

  const id = uuidv4();
  const now = Date.now();
  db.prepare(
    'INSERT INTO user_alerts (id, user_id, message, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, fb.user_id, message.trim(), now);

  res.status(201).json({ message: 'Alert sent to user' });
});

export default router;
