import 'dotenv/config';
import pkg from '../package.json';

const secret = process.env.JWT_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  console.warn('WARNING: JWT_SECRET not set — using insecure default. Set JWT_SECRET before deploying.');
}
export const JWT_SECRET = secret ?? 'taskit-dev-secret-change-before-deploy';

export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
export const DB_PATH: string | undefined = process.env.DB_PATH;
export const DB_ENCRYPTION_KEY: string | undefined = process.env.DB_ENCRYPTION_KEY || undefined;
export const MAX_LOGIN_ATTEMPTS = process.env.MAX_LOGIN_ATTEMPTS ? parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) : 5;
export const LOCKOUT_MINUTES = process.env.LOCKOUT_MINUTES ? parseInt(process.env.LOCKOUT_MINUTES, 10) : 30;
export const ADMIN_EMAIL: string | null = process.env.ADMIN_EMAIL || null;
export const APP_VERSION: string = pkg.version;

// Optional public-facing base URL used for invite links, magic links, etc.
// When not set, the URL is derived from the request Host header (suitable for
// development / single-domain deployments but not recommended for production
// where the Host header can be spoofed).
export const BASE_URL: string | null = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : null;

// Allowed CORS origin(s).  Set CORS_ORIGIN to a comma-separated list of
// permitted origins (e.g. "https://app.example.com") to allow cross-origin
// requests.  Defaults to BASE_URL when set, or no CORS otherwise.
// Since the SPA is served directly from this Express server (same origin),
// CORS is typically only needed for non-browser clients or split deployments.
export const CORS_ORIGIN: string | string[] | false = (() => {
  if (process.env.CORS_ORIGIN) {
    const origins = process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
    return origins.length === 1 ? origins[0] : origins;
  }
  if (BASE_URL) return BASE_URL;
  // Default: no cross-origin access.  Set CORS_ORIGIN or BASE_URL to enable.
  return false;
})();

export const SMTP = {
  host: process.env.SMTP_HOST || '',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
};

// Web Push (VAPID) configuration.
// Generate a key pair once with: npx web-push generate-vapid-keys
// Then set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in .env.
const vapidSubjectFallback = (() => {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  if (process.env.BASE_URL) {
    try {
      return `mailto:admin@${new URL(process.env.BASE_URL).hostname}`;
    } catch {
      // BASE_URL is not a valid URL; fall through to localhost default.
    }
  }
  return 'mailto:admin@localhost';
})();

export const VAPID = {
  publicKey: process.env.VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || '',
  subject: vapidSubjectFallback,
};

// Cloudflare Turnstile CAPTCHA configuration (optional, for improved security)
export const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
export const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
