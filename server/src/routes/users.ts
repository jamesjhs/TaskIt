import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import { ALLOWED_LOCALES } from '../constants';

const router = Router();

router.use(authMiddleware);

// PATCH /api/users/me/locale — update the authenticated user's date/time locale
router.patch('/me/locale', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { locale } = req.body;

  if (!locale || !ALLOWED_LOCALES.has(locale)) {
    res.status(400).json({ error: 'Invalid or unsupported locale', allowedLocales: Array.from(ALLOWED_LOCALES) });
    return;
  }

  db.prepare('UPDATE users SET locale = ? WHERE id = ?').run(locale, userId);

  const user = db.prepare('SELECT id, username, email, role, locale FROM users WHERE id = ?').get(userId) as
    | { id: string; username: string; email: string; role: string; locale: string }
    | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ message: 'Locale updated', user });
});

router.post('/:id/report', (req: Request, res: Response): void => {
  const reporterId = req.user!.id;
  const reportedId = req.params.id;
  const { reason } = req.body;

  if (reporterId === reportedId) {
    res.status(400).json({ error: 'Cannot report yourself' });
    return;
  }

  if (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > 1000)) {
    res.status(400).json({ error: 'reason must not exceed 1000 characters' });
    return;
  }

  const reported = db.prepare('SELECT id FROM users WHERE id = ?').get(reportedId);
  if (!reported) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO user_reports (id, reporter_id, reported_id, reason, created_at, resolved) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(id, reporterId, reportedId, reason || null, now);

  res.status(201).json({ message: 'Report submitted' });
});

router.post('/:id/block', (req: Request, res: Response): void => {
  const blockerId = req.user!.id;
  const blockedId = req.params.id;

  if (blockerId === blockedId) {
    res.status(400).json({ error: 'Cannot block yourself' });
    return;
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(blockedId);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Idempotent — ignore if already exists
  const existing = db.prepare(
    'SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).get(blockerId, blockedId);

  if (!existing) {
    db.prepare(
      'INSERT INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)'
    ).run(blockerId, blockedId, Date.now());
  }

  res.json({ message: 'User blocked' });
});

router.delete('/:id/block', (req: Request, res: Response): void => {
  const blockerId = req.user!.id;
  const blockedId = req.params.id;

  db.prepare(
    'DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).run(blockerId, blockedId);

  res.json({ message: 'User unblocked' });
});

router.get('/blocks', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  const blocked = db.prepare(`
    SELECT u.id, u.username, u.email, ub.created_at AS blocked_at
    FROM user_blocks ub
    JOIN users u ON u.id = ub.blocked_id
    WHERE ub.blocker_id = ?
    ORDER BY ub.created_at DESC
  `).all(userId);

  res.json(blocked);
});

router.post('/me/feedback', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { subject, message, contact_ok } = req.body;
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  const subjectVal = (subject && typeof subject === 'string') ? subject.trim().substring(0, 200) : '';
  if (message.length > 4000) {
    res.status(400).json({ error: 'message must be ≤4000 chars' });
    return;
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO feedback_messages (id, user_id, subject, message, contact_ok, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, userId, subjectVal, message.trim(), contact_ok ? 1 : 0, now);
  res.status(201).json({ message: 'Feedback submitted. Thank you!' });
});

// PATCH /api/users/me/password — change the authenticated user's password
router.patch('/me/password', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword are required' });
    return;
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    res.status(400).json({ error: 'New password must be between 8 and 128 characters' });
    return;
  }

  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(userId) as
    | { id: string; password_hash: string }
    | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);

  res.json({ message: 'Password updated successfully' });
});

router.delete('/me', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  // Delete all user data in dependency order
  const deleteInOrder = db.transaction(() => {
    db.prepare('DELETE FROM task_reminders_sent WHERE task_id IN (SELECT id FROM tasks WHERE created_by = ?)').run(userId);
    db.prepare('DELETE FROM task_notes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM task_notes WHERE task_id IN (SELECT id FROM tasks WHERE created_by = ?)').run(userId);
    db.prepare('DELETE FROM task_assignees WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM task_assignees WHERE task_id IN (SELECT id FROM tasks WHERE created_by = ?)').run(userId);
    db.prepare('DELETE FROM tasks WHERE created_by = ?').run(userId);
    db.prepare('DELETE FROM group_invites WHERE created_by = ?').run(userId);
    // Remove from groups; if sole admin of a group, delete the group
    const ownedGroups = db.prepare(
      "SELECT g.id FROM groups g WHERE g.created_by = ?"
    ).all(userId) as Array<{ id: string }>;
    for (const g of ownedGroups) {
      const otherAdmins = db.prepare(
        "SELECT 1 FROM group_members WHERE group_id = ? AND user_id != ? AND role = 'admin'"
      ).get(g.id, userId);
      if (!otherAdmins) {
        // No other admin — delete the group entirely
        db.prepare('DELETE FROM task_reminders_sent WHERE task_id IN (SELECT id FROM tasks WHERE group_id = ?)').run(g.id);
        db.prepare('DELETE FROM task_notes WHERE task_id IN (SELECT id FROM tasks WHERE group_id = ?)').run(g.id);
        db.prepare('DELETE FROM task_assignees WHERE task_id IN (SELECT id FROM tasks WHERE group_id = ?)').run(g.id);
        db.prepare('DELETE FROM tasks WHERE group_id = ?').run(g.id);
        db.prepare('DELETE FROM group_invites WHERE group_id = ?').run(g.id);
        db.prepare('DELETE FROM group_members WHERE group_id = ?').run(g.id);
        db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
      }
    }
    db.prepare('DELETE FROM group_members WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?').run(userId, userId);
    db.prepare('DELETE FROM user_reports WHERE reporter_id = ? OR reported_id = ?').run(userId, userId);
    db.prepare('DELETE FROM user_friends WHERE user_id = ? OR friend_id = ?').run(userId, userId);
    db.prepare('DELETE FROM friend_invites WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM otp_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM magic_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM feedback_messages WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_alerts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  deleteInOrder();
  res.json({ message: 'Your account and all associated data have been permanently deleted.' });
});

router.get('/me/alerts', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const alerts = db.prepare(
    'SELECT id, message, read_at, created_at FROM user_alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(userId);
  res.json(alerts);
});

router.patch('/me/alerts/:id/read', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const alertId = req.params.id;
  const alert = db.prepare('SELECT id FROM user_alerts WHERE id = ? AND user_id = ?').get(alertId, userId);
  if (!alert) { res.status(404).json({ error: 'Alert not found' }); return; }
  db.prepare('UPDATE user_alerts SET read_at = ? WHERE id = ?').run(Date.now(), alertId);
  res.json({ message: 'Alert marked as read' });
});

router.get('/me/ics-token', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const user = db.prepare('SELECT ics_token FROM users WHERE id = ?').get(userId) as { ics_token: string | null } | undefined;
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  let token = user.ics_token;
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    db.prepare('UPDATE users SET ics_token = ? WHERE id = ?').run(token, userId);
  }
  res.json({ token });
});

router.post('/me/ics-token/rotate', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE users SET ics_token = ? WHERE id = ?').run(token, userId);
  res.json({ token });
});

// GET /api/users/me/notification-preferences — get user's default reminder preferences
router.get('/me/notification-preferences', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const user = db.prepare('SELECT notification_preferences FROM users WHERE id = ?').get(userId) as
    | { notification_preferences: string }
    | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  let prefs = {
    email: { notify_7day: false, notify_1day: true, notify_onday: false },
    popup: { notify_7day: false, notify_1day: false, notify_onday: false },
  };

  try {
    prefs = JSON.parse(user.notification_preferences);
  } catch (e) {
    console.error('[users/notification-preferences] Failed to parse preferences:', e);
  }

  res.json(prefs);
});

// PATCH /api/users/me/notification-preferences — update user's default reminder preferences
router.patch('/me/notification-preferences', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { email, popup } = req.body;

  // Validate structure
  if (!email || typeof email !== 'object' || !popup || typeof popup !== 'object') {
    res.status(400).json({ error: 'email and popup objects are required' });
    return;
  }

  const emailKeys = ['notify_7day', 'notify_1day', 'notify_onday'];
  const popupKeys = ['notify_7day', 'notify_1day', 'notify_onday'];

  for (const key of emailKeys) {
    if (typeof email[key] !== 'boolean') {
      res.status(400).json({ error: `email.${key} must be a boolean` });
      return;
    }
  }

  for (const key of popupKeys) {
    if (typeof popup[key] !== 'boolean') {
      res.status(400).json({ error: `popup.${key} must be a boolean` });
      return;
    }
  }

  const prefs = { email, popup };
  db.prepare('UPDATE users SET notification_preferences = ? WHERE id = ?').run(
    JSON.stringify(prefs),
    userId
  );

  res.json({ message: 'Notification preferences updated', prefs });
});

export default router;
