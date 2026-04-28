import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import { VAPID } from '../config';

const router = Router();

// GET /api/push/vapid-public-key — public endpoint, returns the VAPID public key
// so the frontend can subscribe without needing a logged-in user yet.
router.get('/vapid-public-key', (_req: Request, res: Response): void => {
  if (!VAPID.publicKey) {
    res.status(503).json({ error: 'Push notifications are not configured on this server.' });
    return;
  }
  res.json({ publicKey: VAPID.publicKey });
});

// All routes below require authentication.
router.use(authMiddleware);

// POST /api/push/subscribe — save or update a push subscription for the current user.
// Body: { endpoint, keys: { p256dh, auth } }
router.post('/subscribe', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'Missing endpoint or keys (p256dh, auth).' });
    return;
  }

  // Upsert: if this endpoint already exists (for any user) update it so the
  // current user owns it; otherwise insert a fresh row.
  const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(
      'UPDATE push_subscriptions SET user_id = ?, keys_p256dh = ?, keys_auth = ? WHERE endpoint = ?'
    ).run(userId, keys.p256dh, keys.auth, endpoint);
  } else {
    db.prepare(
      'INSERT INTO push_subscriptions (id, user_id, endpoint, keys_p256dh, keys_auth, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(randomUUID(), userId, endpoint, keys.p256dh, keys.auth, Date.now());
  }

  res.status(201).json({ ok: true });
});

// DELETE /api/push/subscribe — remove a push subscription when permission is revoked.
// Body: { endpoint }
router.delete('/subscribe', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) {
    res.status(400).json({ error: 'Missing endpoint.' });
    return;
  }

  db.prepare(
    'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?'
  ).run(endpoint, userId);

  res.json({ ok: true });
});

export default router;
