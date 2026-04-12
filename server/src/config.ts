import 'dotenv/config';
import pkg from '../package.json';

const secret = process.env.JWT_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  console.warn('WARNING: JWT_SECRET not set — using insecure default. Set JWT_SECRET before deploying.');
}
export const JWT_SECRET = secret ?? 'jobber-dev-secret-change-before-deploy';

export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
export const DB_PATH: string | undefined = process.env.DB_PATH;
export const MAX_LOGIN_ATTEMPTS = process.env.MAX_LOGIN_ATTEMPTS ? parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) : 5;
export const LOCKOUT_MINUTES = process.env.LOCKOUT_MINUTES ? parseInt(process.env.LOCKOUT_MINUTES, 10) : 30;
export const ADMIN_EMAIL: string | null = process.env.ADMIN_EMAIL || null;
export const APP_VERSION: string = pkg.version;

// Optional public-facing base URL used for invite links, magic links, etc.
// When not set, the URL is derived from the request Host header (suitable for
// development / single-domain deployments but not recommended for production
// where the Host header can be spoofed).
export const BASE_URL: string | null = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : null;

export const SMTP = {
  host: process.env.SMTP_HOST || '',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
};
