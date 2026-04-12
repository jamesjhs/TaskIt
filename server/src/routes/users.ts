import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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

  const reported = db.prepare('SELECT id FROM users WHERE id = ?').get(reportedId);
  if (!reported) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const id = uuidv4();
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

export default router;
