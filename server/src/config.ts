import 'dotenv/config';
import pkg from '../package.json';

type TrustProxySetting = boolean | number | string | string[];

const isProduction = process.env.NODE_ENV === 'production';

const secret = process.env.JWT_SECRET;
if (!secret) {
  if (isProduction) {
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

function parseBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/$/, '');
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('BASE_URL must use http:// or https://');
    }
    return trimmed;
  } catch (err) {
    throw new Error(`BASE_URL must be a valid absolute URL: ${(err as Error).message}`);
  }
}

function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  if (!raw || raw.trim() === '') {
    if (isProduction) {
      throw new Error(
        'TRUST_PROXY must be set in production. Use "false" for direct Node exposure, ' +
        '"1" for one trusted reverse-proxy hop, or a named/CIDR allowlist such as "loopback".'
      );
    }
    return 1;
  }

  const value = raw.trim();
  const lower = value.toLowerCase();
  if (['false', '0', 'direct', 'none'].includes(lower)) return false;
  if (['true', 'all'].includes(lower)) {
    if (isProduction) {
      throw new Error('TRUST_PROXY=true is not allowed in production because it trusts every X-Forwarded-For sender.');
    }
    return true;
  }

  if (/^\d+$/.test(value)) {
    const hops = parseInt(value, 10);
    if (hops < 0) throw new Error('TRUST_PROXY numeric hop count must not be negative.');
    return hops;
  }

  const entries = value.split(',').map(v => v.trim()).filter(Boolean);
  return entries.length === 1 ? entries[0] : entries;
}

function validateHttpsOrigin(name: string, origin: string): void {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`${name} must contain valid absolute URL origins.`);
  }

  if (isProduction && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https:// in production: ${origin}`);
  }
}

// Public-facing base URL used for invite links, magic links, reset links, push
// subjects and other URLs that leave the request/response cycle.
export const BASE_URL: string | null = parseBaseUrl(process.env.BASE_URL);

export const TRUST_PROXY: TrustProxySetting = parseTrustProxy(process.env.TRUST_PROXY);

// Allowed CORS origin(s).  Set CORS_ORIGIN to a comma-separated list of
// permitted origins (e.g. "https://app.example.com") to allow cross-origin
// requests.  Defaults to BASE_URL when set, or no CORS otherwise.
// Since the SPA is served directly from this Express server (same origin),
// CORS is typically only needed for non-browser clients or split deployments.
export const CORS_ORIGIN: string | string[] | false = (() => {
  if (process.env.CORS_ORIGIN) {
    const origins = process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
    if (isProduction && origins.includes('*')) {
      throw new Error('CORS_ORIGIN=* is not allowed in production. Configure explicit https:// origins.');
    }
    for (const origin of origins) {
      if (origin !== '*') validateHttpsOrigin('CORS_ORIGIN', origin);
    }
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

function validateProductionConfig(): void {
  if (!isProduction) return;

  if (!BASE_URL) {
    throw new Error('BASE_URL must be set in production so outbound auth and invite links never depend on Host headers.');
  }
  validateHttpsOrigin('BASE_URL', BASE_URL);

  if (!DB_ENCRYPTION_KEY) {
    throw new Error('DB_ENCRYPTION_KEY must be set in production so the SQLite database is encrypted at rest.');
  }

  if (SMTP.secure && SMTP.port !== 465) {
    console.warn('WARNING: SMTP_SECURE=true usually expects SMTP_PORT=465. Verify your SMTP provider settings.');
  }
  if (!SMTP.secure && SMTP.port === 465) {
    console.warn('WARNING: SMTP_PORT=465 usually expects SMTP_SECURE=true. Verify your SMTP provider settings.');
  }
  if ((SMTP.user && !SMTP.pass) || (!SMTP.user && SMTP.pass)) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured together in production.');
  }

  if ((VAPID.publicKey && !VAPID.privateKey) || (!VAPID.publicKey && VAPID.privateKey)) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured together in production.');
  }

  if ((TURNSTILE_SITE_KEY && !TURNSTILE_SECRET_KEY) || (!TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY)) {
    throw new Error('TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be configured together in production.');
  }
}

validateProductionConfig();
