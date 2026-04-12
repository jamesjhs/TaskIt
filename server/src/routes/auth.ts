import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../db';
import { JWT_SECRET, MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES, ADMIN_EMAIL } from '../config';
import { sendMagicLink, sendOTP } from '../services/mail';

const router = Router();

// BCP 47 locale tags we accept at registration / profile update
const ALLOWED_LOCALES: ReadonlySet<string> = new Set([
  'en-GB', 'en-US', 'en-AU', 'en-CA', 'en-NZ', 'en-ZA',
  'fr-FR', 'fr-BE', 'fr-CA', 'fr-CH',
  'de-DE', 'de-AT', 'de-CH',
  'es-ES', 'es-MX', 'es-AR',
  'it-IT', 'pt-PT', 'pt-BR',
  'nl-NL', 'nl-BE',
  'pl-PL', 'cs-CZ', 'sk-SK', 'hu-HU', 'ro-RO',
  'sv-SE', 'nb-NO', 'da-DK', 'fi-FI',
  'ru-RU', 'uk-UA',
  'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR',
  'ar-SA', 'he-IL', 'tr-TR',
  'hi-IN', 'id-ID', 'th-TH',
]);

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: string;
  failed_logins: number;
  locked_until: number | null;
  email_verified: number;
  locale: string;
}

// POST /api/auth/register
// Creates an unverified account and sends an email verification magic link.
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { username, email, password, locale } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: 'username, email, and password are required' });
    return;
  }

  // Default to British English; reject unrecognised locale tags
  const userLocale: string = locale && ALLOWED_LOCALES.has(locale) ? locale : 'en-GB';

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

  // Insert with email_verified = 0; magic link will flip this to 1
  db.prepare(
    'INSERT INTO users (id, username, email, password_hash, created_at, role, email_verified, locale) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).run(id, username, email, passwordHash, now, role, userLocale);

  // Generate and store a verification magic token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + 15 * 60 * 1000; // 15 minutes
  db.prepare(
    'INSERT INTO magic_tokens (token, user_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)'
  ).run(token, id, expiresAt, now);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  try {
    await sendMagicLink(email, token, baseUrl, 'verify');
  } catch (err) {
    console.error('[auth] Failed to send verification email:', err);
  }

  res.status(201).json({ message: 'Registration successful. Please check your email to verify your account before signing in.' });
});

// POST /api/auth/login
// Validates credentials, then sends a one-time OTP for 2FA.
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;

  // Check if account is locked
  if (user && user.locked_until && user.locked_until > Date.now()) {
    res.status(423).json({ error: 'Account locked. Please contact an administrator.' });
    return;
  }

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
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

  // Check email verification
  if (!user.email_verified) {
    res.status(403).json({ error: 'Email address not yet verified. Please check your inbox for the verification link.' });
    return;
  }

  // Credentials valid — reset failed-login counter
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);

  // Generate a 6-digit OTP for 2FA
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const sessionId = uuidv4();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  db.prepare(
    'INSERT INTO otp_tokens (id, user_id, code, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(sessionId, user.id, code, expiresAt, Date.now());

  try {
    await sendOTP(user.email, code);
  } catch (err) {
    console.error('[auth] Failed to send OTP email:', err);
  }

  res.json({ status: 'otp_required', sessionId });
});

// POST /api/auth/verify-otp
// Second step of password login: validates the email OTP and issues a JWT.
router.post('/verify-otp', (req: Request, res: Response): void => {
  const { sessionId, code } = req.body;

  if (!sessionId || !code) {
    res.status(400).json({ error: 'sessionId and code are required' });
    return;
  }

  const otpRow = db.prepare('SELECT * FROM otp_tokens WHERE id = ?').get(sessionId) as
    | { id: string; user_id: string; code: string; expires_at: number; used: number }
    | undefined;

  if (!otpRow || otpRow.used === 1 || otpRow.expires_at < Date.now()) {
    res.status(400).json({ error: 'Invalid or expired verification code' });
    return;
  }

  if (otpRow.code !== String(code).trim()) {
    res.status(401).json({ error: 'Incorrect verification code' });
    return;
  }

  db.prepare('UPDATE otp_tokens SET used = 1 WHERE id = ?').run(sessionId);

  const user = db.prepare('SELECT id, username, email, role, locale FROM users WHERE id = ?').get(otpRow.user_id) as
    | { id: string; username: string; email: string; role: string; locale: string }
    | undefined;

  if (!user) {
    res.status(400).json({ error: 'User not found' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role, locale: user.locale },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role, locale: user.locale } });
});

// POST /api/auth/magic-link
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
    await sendMagicLink(user.email, token, baseUrl, 'login');
  } catch (err) {
    console.error('[auth] Failed to send magic link email:', err);
  }

  res.json(ALWAYS_OK);
});

// GET /api/auth/magic-link/verify
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

  // Mark token as used and mark the user's email as verified
  db.prepare('UPDATE magic_tokens SET used = 1 WHERE token = ?').run(token);
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(magicToken.user_id);

  const user = db.prepare('SELECT id, username, email, role, locale FROM users WHERE id = ?').get(magicToken.user_id) as
    | { id: string; username: string; email: string; role: string; locale: string }
    | undefined;

  if (!user) {
    res.status(400).json({ error: 'User not found' });
    return;
  }

  const jwtToken = jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role, locale: user.locale },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token: jwtToken, user: { id: user.id, username: user.username, email: user.email, role: user.role, locale: user.locale } });
});

export default router;
