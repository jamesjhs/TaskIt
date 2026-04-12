import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../db';
import { JWT_SECRET, MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES, ADMIN_EMAIL } from '../config';
import { sendMagicLink } from '../services/mail';

const router = Router();

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: string;
  failed_logins: number;
  locked_until: number | null;
}

router.post('/register', (req: Request, res: Response): void => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: 'username, email, and password are required' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing) {
    res.status(409).json({ error: 'Email or username already in use' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const id = uuidv4();
  const now = Date.now();

  // Determine role: admin if ADMIN_EMAIL matches or if first user ever
  let role = 'user';
  if (ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    role = 'admin';
  } else {
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
    if (userCount.cnt === 0) {
      role = 'admin';
    }
  }

  db.prepare(
    'INSERT INTO users (id, username, email, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, username, email, passwordHash, now, role);

  const token = jwt.sign({ id, username, email, role }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: { id, username, email, role } });
});

router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;

  // Check if account is locked (do this before password check to avoid timing oracle)
  if (user && user.locked_until && user.locked_until > Date.now()) {
    res.status(423).json({ error: 'Account locked. Please contact an administrator.' });
    return;
  }

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    // Increment failed_logins if user exists
    if (user) {
      const newFailedLogins = (user.failed_logins || 0) + 1;
      if (newFailedLogins >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
        db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(
          newFailedLogins, lockedUntil, user.id
        );
      } else {
        db.prepare('UPDATE users SET failed_logins = ? WHERE id = ?').run(newFailedLogins, user.id);
      }
    }
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Successful login — reset counters
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

router.post('/magic-link', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  const ALWAYS_OK = { message: 'If that email is registered, a login link has been sent.' };

  if (!email) {
    res.json(ALWAYS_OK);
    return;
  }

  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email) as
    | { id: string; email: string }
    | undefined;

  if (!user) {
    res.json(ALWAYS_OK);
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000; // 15 minutes

  db.prepare(
    'INSERT INTO magic_tokens (token, user_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)'
  ).run(token, user.id, expiresAt, now);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  try {
    await sendMagicLink(user.email, token, baseUrl);
  } catch (err) {
    console.error('[auth] Failed to send magic link email:', err);
  }

  res.json(ALWAYS_OK);
});

router.get('/magic-link/verify', (req: Request, res: Response): void => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Token is required' });
    return;
  }

  const magicToken = db.prepare(
    'SELECT * FROM magic_tokens WHERE token = ?'
  ).get(token) as { token: string; user_id: string; expires_at: number; used: number } | undefined;

  if (!magicToken) {
    res.status(400).json({ error: 'Invalid or expired token' });
    return;
  }

  if (magicToken.used === 1 || magicToken.expires_at < Date.now()) {
    res.status(400).json({ error: 'Invalid or expired token' });
    return;
  }

  // Mark token as used
  db.prepare('UPDATE magic_tokens SET used = 1 WHERE token = ?').run(token);

  const user = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(magicToken.user_id) as
    | { id: string; username: string; email: string; role: string }
    | undefined;

  if (!user) {
    res.status(400).json({ error: 'User not found' });
    return;
  }

  const jwtToken = jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token: jwtToken, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

export default router;
