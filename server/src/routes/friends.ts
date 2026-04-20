import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import { BASE_URL } from '../config';

const router = Router();

function getBaseUrl(req: Request): string {
  return BASE_URL ?? `${req.protocol}://${req.get('host')}`;
}

// ─── Public routes (no auth required) ────────────────────────────────────────

// GET /api/friends/invite/:token — look up who sent the invite so the UI can
// show the sender's name before the user logs in.
router.get('/invite/:token', (req: Request, res: Response): void => {
  const { token } = req.params;

  const invite = db.prepare('SELECT * FROM friend_invites WHERE token = ?').get(token) as
    | { token: string; user_id: string; expires_at: number; used: number }
    | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Friend invite not found' });
    return;
  }

  if (invite.used === 1 || invite.expires_at < Date.now()) {
    res.status(410).json({ error: 'Friend invite has expired or already been used' });
    return;
  }

  const sender = db.prepare('SELECT id, username FROM users WHERE id = ?').get(invite.user_id) as
    | { id: string; username: string }
    | undefined;

  if (!sender) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ sender: { id: sender.id, username: sender.username } });
});

// ─── All routes below require authentication ──────────────────────────────────
router.use(authMiddleware);

// GET /api/friends/my-key — return the current user's friend key and username
// for display in the Friends section (so they can share it with others).
router.get('/my-key', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  const user = db.prepare('SELECT username, friend_key FROM users WHERE id = ?').get(userId) as
    | { username: string; friend_key: string | null }
    | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Generate a key if one is missing (should not happen after migration, but defensive)
  let key = user.friend_key;
  if (!key) {
    key = crypto.randomBytes(4).toString('hex');
    db.prepare('UPDATE users SET friend_key = ? WHERE id = ?').run(key, userId);
  }

  res.json({ username: user.username, friend_key: key });
});

// POST /api/friends/add-by-key — add a friend by username + friend_key
// Creates a bidirectional friendship without consuming a one-time invite token.
router.post('/add-by-key', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { username, friend_key } = req.body;

  if (!username || !friend_key) {
    res.status(400).json({ error: 'username and friend_key are required' });
    return;
  }

  const target = db.prepare(
    'SELECT id, username, friend_key FROM users WHERE username = ?'
  ).get(String(username).trim()) as
    | { id: string; username: string; friend_key: string | null }
    | undefined;

  if (!target || !target.friend_key) {
    res.status(404).json({ error: 'No user found with that username and key combination' });
    return;
  }

  // Constant-time key comparison to prevent timing attacks
  const submittedKey = Buffer.from(String(friend_key).trim().toLowerCase(), 'utf8');
  const storedKey = Buffer.from(target.friend_key.toLowerCase(), 'utf8');
  const match = submittedKey.length === storedKey.length &&
    crypto.timingSafeEqual(submittedKey, storedKey);

  if (!match) {
    res.status(404).json({ error: 'No user found with that username and key combination' });
    return;
  }

  if (target.id === userId) {
    res.status(400).json({ error: 'Cannot add yourself as a friend' });
    return;
  }

  // Idempotent — already friends?
  const existing = db.prepare(
    'SELECT 1 FROM user_friends WHERE user_id = ? AND friend_id = ?'
  ).get(userId, target.id);

  if (existing) {
    res.json({ message: 'Already friends', alreadyFriends: true, target: { id: target.id, username: target.username } });
    return;
  }

  const now = Date.now();

  const addFriend = db.transaction(() => {
    db.prepare(
      'INSERT OR IGNORE INTO user_friends (user_id, friend_id, created_at) VALUES (?, ?, ?)'
    ).run(userId, target.id, now);
    db.prepare(
      'INSERT OR IGNORE INTO user_friends (user_id, friend_id, created_at) VALUES (?, ?, ?)'
    ).run(target.id, userId, now);
  });

  addFriend();

  // Notify the other user (non-critical)
  try {
    const requester = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as
      | { username: string }
      | undefined;
    db.prepare(
      'INSERT INTO user_alerts (id, user_id, message, created_at) VALUES (?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      target.id,
      `${requester?.username ?? 'Someone'} added you as a friend!`,
      now,
    );
  } catch (err) {
    console.error('[friends/add-by-key] Failed to create alert:', err);
  }

  res.status(201).json({ message: 'Friend added!', target: { id: target.id, username: target.username } });
});

// POST /api/friends/invite — generate (or refresh) a friend invite link for the
// current user.  Invalidates any existing unused invite first so there is only
// ever one live link at a time.
router.post('/invite', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  // Invalidate any existing unused invite for this user
  db.prepare('UPDATE friend_invites SET used = 1 WHERE user_id = ? AND used = 0').run(userId);

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  db.prepare(
    'INSERT INTO friend_invites (token, user_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)'
  ).run(token, userId, expiresAt, now);

  const baseUrl = getBaseUrl(req);
  const inviteUrl = `${baseUrl}?friend=${token}`;

  res.status(201).json({ token, invite_url: inviteUrl, expires_at: expiresAt });
});

// POST /api/friends/invite/:token/accept — accept a friend invite
router.post('/invite/:token/accept', (req: Request, res: Response): void => {
  const { token } = req.params;
  const userId = req.user!.id;

  const invite = db.prepare('SELECT * FROM friend_invites WHERE token = ?').get(token) as
    | { token: string; user_id: string; expires_at: number; used: number }
    | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Friend invite not found' });
    return;
  }

  if (invite.used === 1 || invite.expires_at < Date.now()) {
    res.status(410).json({ error: 'Friend invite has expired or already been used' });
    return;
  }

  if (invite.user_id === userId) {
    res.status(400).json({ error: 'Cannot add yourself as a friend' });
    return;
  }

  const sender = db.prepare('SELECT id, username FROM users WHERE id = ?').get(invite.user_id) as
    | { id: string; username: string }
    | undefined;

  if (!sender) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Idempotent — already friends?
  const existing = db.prepare(
    'SELECT 1 FROM user_friends WHERE user_id = ? AND friend_id = ?'
  ).get(userId, invite.user_id);

  if (existing) {
    res.json({ message: 'Already friends', alreadyFriends: true, sender });
    return;
  }

  const now = Date.now();

  // Create friendship in both directions atomically, then mark invite used
  const addFriend = db.transaction(() => {
    db.prepare(
      'INSERT OR IGNORE INTO user_friends (user_id, friend_id, created_at) VALUES (?, ?, ?)'
    ).run(userId, invite.user_id, now);
    db.prepare(
      'INSERT OR IGNORE INTO user_friends (user_id, friend_id, created_at) VALUES (?, ?, ?)'
    ).run(invite.user_id, userId, now);
    db.prepare('UPDATE friend_invites SET used = 1 WHERE token = ?').run(token);
  });

  addFriend();

  // Notify the invite sender (non-critical)
  try {
    const accepter = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as
      | { username: string }
      | undefined;
    db.prepare(
      'INSERT INTO user_alerts (id, user_id, message, created_at) VALUES (?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      invite.user_id,
      `${accepter?.username ?? 'Someone'} accepted your friend invite!`,
      now,
    );
  } catch (err) {
    console.error('[friends/accept] Failed to create alert:', err);
  }

  res.json({ message: 'Friend added!', sender });
});

// GET /api/friends — list all friends of the current user
router.get('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  const friends = db.prepare(`
    SELECT u.id, u.username, uf.created_at AS friends_since
    FROM user_friends uf
    JOIN users u ON u.id = uf.friend_id
    WHERE uf.user_id = ?
    ORDER BY u.username ASC
  `).all(userId);

  res.json(friends);
});

// DELETE /api/friends/:friendId — remove a friend (both directions)
router.delete('/:friendId', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { friendId } = req.params;

  db.prepare(
    'DELETE FROM user_friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
  ).run(userId, friendId, friendId, userId);

  res.json({ message: 'Friend removed' });
});

export default router;
