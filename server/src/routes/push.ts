import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import { getVapidFromDb } from '../webpush-config';

const router = Router();

// Base64url characters only; used to validate p256dh / auth keys from the browser.
// At most 2 padding `=` characters are allowed (standard base64 padding).
const BASE64URL_RE = /^[A-Za-z0-9\-_]+={0,2}$/;
// p256dh is an uncompressed EC public key (65 bytes) → ~88 chars base64url.
// auth is a 16-byte random value → ~24 chars base64url.
// Both limits are generous to accommodate padding variants.
const P256DH_MAX_LEN = 200;
const AUTH_MAX_LEN   = 50;

// GET /api/push/vapid-public-key — public endpoint, returns the VAPID public key
// so the frontend can subscribe without needing a logged-in user yet.
router.get('/vapid-public-key', (_req: Request, res: Response): void => {
  const { publicKey } = getVapidFromDb();
  if (!publicKey) {
    res.status(503).json({ error: 'Push notifications are not configured on this server.' });
    return;
  }
  res.json({ publicKey });
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

  // Validate endpoint is a well-formed HTTPS URL (push service URLs are always HTTPS).
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    res.status(400).json({ error: 'endpoint must be a valid URL.' });
    return;
  }
  if (parsedEndpoint.protocol !== 'https:') {
    res.status(400).json({ error: 'endpoint must use HTTPS.' });
    return;
  }

  // Validate key material: base64url characters only, within expected size limits.
  if (
    !BASE64URL_RE.test(keys.p256dh) || keys.p256dh.length > P256DH_MAX_LEN ||
    !BASE64URL_RE.test(keys.auth)   || keys.auth.length   > AUTH_MAX_LEN
  ) {
    res.status(400).json({ error: 'Invalid key format.' });
    return;
  }

  // Upsert: if this endpoint already belongs to the current user, refresh the keys
  // (they can rotate after a browser update).  If the endpoint does not exist, insert
  // a fresh row.  We deliberately do NOT reassign an endpoint that belongs to a
  // different user — that would allow any authenticated user to hijack another user's
  // push subscription.
  const existing = db.prepare('SELECT id, user_id FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as
    | { id: string; user_id: string }
    | undefined;

  if (existing) {
    if (existing.user_id !== userId) {
      // The endpoint is already registered to another user.  Return 200 so the browser
      // can't infer whether a given endpoint exists, but do not alter ownership.
      res.status(200).json({ ok: true });
      return;
    }
    db.prepare(
      'UPDATE push_subscriptions SET keys_p256dh = ?, keys_auth = ? WHERE endpoint = ?'
    ).run(keys.p256dh, keys.auth, endpoint);
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
