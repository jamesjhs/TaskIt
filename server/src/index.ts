import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import db from './db'; // initialize database
import { APP_VERSION, BASE_URL, CORS_ORIGIN, JWT_SECRET, PORT, VAPID } from './config';
import { startScheduler } from './services/scheduler';

import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import taskRoutes from './routes/tasks';
import taskTypeRoutes from './routes/taskTypes';
import adminRoutes from './routes/admin';
import userRoutes from './routes/users';
import gamificationRoutes from './routes/gamification';
import friendRoutes from './routes/friends';
import pushRoutes from './routes/push';

const app = express();

// Initialise VAPID details for web-push if keys are configured.
// If keys are missing, push notifications are silently disabled (the /api/push/vapid-public-key
// endpoint returns 503 and the frontend falls back to the tab-open Notification API).
if (VAPID.publicKey && VAPID.privateKey) {
  webpush.setVapidDetails(VAPID.subject, VAPID.publicKey, VAPID.privateKey);
}

// Trust the first proxy hop (e.g. nginx/Cloudflare) so that
// express-rate-limit can correctly read the client IP from X-Forwarded-For
app.set('trust proxy', 1);

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-user rate limiter for authenticated API routes.
// Keyed by the JWT user ID so each logged-in user has their own quota.
// Falls back to IP for unauthenticated requests.
const authenticatedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: ['HS256'] }) as { id: string };
        return `user:${payload.id}`;
      } catch {
        // invalid/expired token – fall through to IP-based key
      }
    }
    return ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0');
  },
});

// Inline CORS middleware — equivalent to the cors package but with no extra dependency.
// CORS_ORIGIN is configured in config.ts from the CORS_ORIGIN / BASE_URL env vars.
// When false (the default) no cross-origin access is granted.
app.use((req: Request, res: Response, next: NextFunction): void => {
  const requestOrigin = req.headers.origin;

  // Resolve the permitted origin header value from the configuration (not from the request).
  // Reflecting the request origin directly would allow any origin through if validation is
  // accidentally bypassed; using the configured value is strictly safer.
  let allowedOriginHeader: string | null = null;
  let withCredentials = false;

  if (CORS_ORIGIN !== false && CORS_ORIGIN !== '*') {
    // Specific origin(s): look up the request origin in the allowlist and, if found, use the
    // *configured* value (not the raw request header) in the response.
    const match = Array.isArray(CORS_ORIGIN)
      ? CORS_ORIGIN.find(o => o === requestOrigin)
      : CORS_ORIGIN === requestOrigin ? CORS_ORIGIN : undefined;

    if (match) {
      allowedOriginHeader = match;
      withCredentials = true;
    }
  } else if (CORS_ORIGIN === '*') {
    // Wildcard: allow any origin, but credentials are not permitted with a wildcard.
    allowedOriginHeader = '*';
  }

  if (allowedOriginHeader !== null) {
    res.setHeader('Access-Control-Allow-Origin', allowedOriginHeader);
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (withCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
  }

  // Handle preflight — always respond 204 (headers already set above if allowed)
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});
// Security headers (helmet must come before static/route middleware)
app.use(helmet({
  // Allow the service worker to load and scripts to run from the same origin.
  // Inline scripts are used by the SPA, so 'unsafe-inline' is kept for scripts.
  // Cloudflare Turnstile CAPTCHA script and iframe are allowed from challenges.cloudflare.com
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", "https://challenges.cloudflare.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["https://challenges.cloudflare.com"],
    },
  },
}));
app.use(express.json({ limit: '50kb' }));

// ─── Health-check endpoint (exempt from auth and rate limiting) ──────────────
app.get('/readyz', (_req, res) => {
  res.json({ ok: true, service: 'taskit', version: APP_VERSION, timestamp: new Date().toISOString() });
});

// Version endpoint
app.get('/api/version', (_req, res) => {
  res.json({ version: APP_VERSION });
});

// ─── Public ICS calendar feed ─────────────────────────────────────────────────
// GET /calendar/:token/tasks.ics — returns a valid iCalendar (.ics) file for the user
// The token acts as a secret — no session or JWT required.
app.get('/calendar/:token/tasks.ics', generalLimiter, (req, res): void => {
  const { token } = req.params;
  if (!token || token.length !== 64 || !/^[0-9a-f]+$/.test(token)) {
    res.status(404).send('Not found');
    return;
  }

  const user = db.prepare('SELECT id, username FROM users WHERE ics_token = ?').get(token) as
    | { id: string; username: string }
    | undefined;

  if (!user) {
    res.status(404).send('Not found');
    return;
  }

  const userId = user.id;

  const tasks = db.prepare(`
    SELECT t.id, t.title, t.details, t.status, t.due_date, t.group_id, t.created_at, t.updated_at,
           tt.name AS type_name,
           g.name AS group_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    LEFT JOIN groups g ON g.id = t.group_id
    WHERE t.archived = 0
      AND t.due_date IS NOT NULL
      AND (
        t.created_by = ?
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)
        OR (t.group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = ?
        ))
      )
    ORDER BY t.due_date ASC
  `).all(userId, userId, userId) as Array<{
    id: string; title: string; details: string | null; status: string;
    due_date: number; group_id: string | null; created_at: number; updated_at: number;
    type_name: string; group_name: string | null;
  }>;

  const escIcs = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

  const toIcsDate = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };

  const foldLine = (line: string): string => {
    const out: string[] = [];
    while (line.length > 75) {
      out.push(line.slice(0, 75));
      line = ' ' + line.slice(75);
    }
    out.push(line);
    return out.join('\r\n');
  };

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TaskIt!//TaskIt! Task Manager//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:TaskIt! – ${escIcs(user.username)}`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const t of tasks) {
    const groupPrefix = t.group_name ? `[${t.group_name}] ` : '';
    const summary = groupPrefix + t.title;
    const dtDue = toIcsDate(t.due_date);
    const dtCreated = toIcsDate(t.created_at);
    const dtStamp = toIcsDate(t.updated_at);
    const uidDomain = BASE_URL ? BASE_URL.replace(/^https?:\/\//, '') : 'taskit.jahosi.co.uk';
    const uid = `${t.id}@${uidDomain}`;
    const descParts: string[] = [];
    if (t.details) descParts.push(t.details);
    descParts.push(`Type: ${t.type_name}`);
    if (t.group_name) descParts.push(`Group: ${t.group_name}`);
    descParts.push(`Status: ${t.status.replace(/_/g, ' ')}`);
    const description = descParts.join('\n');

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${uid}`));
    lines.push(foldLine(`SUMMARY:${escIcs(summary)}`));
    lines.push(foldLine(`DESCRIPTION:${escIcs(description)}`));
    lines.push(`DTSTART:${dtDue}`);
    lines.push(`DTEND:${dtDue}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`CREATED:${dtCreated}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const body = lines.join('\r\n') + '\r\n';

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="taskit-tasks.ics"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(body);
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/groups', authenticatedLimiter, groupRoutes);
app.use('/api/tasks', authenticatedLimiter, taskRoutes);
app.use('/api/task-types', authenticatedLimiter, taskTypeRoutes);
app.use('/api/admin', authenticatedLimiter, adminRoutes);
app.use('/api/users', authenticatedLimiter, userRoutes);
app.use('/api/gamification', authenticatedLimiter, gamificationRoutes);
app.use('/api/friends', authenticatedLimiter, friendRoutes);
app.use('/api/push', authenticatedLimiter, pushRoutes);

// Serve sw.js dynamically so its CACHE_NAME always reflects the current app
// version. The SW's activate handler deletes every cache whose name doesn't
// match CACHE_NAME, so changing the name on each deploy automatically cleans
// up the previous version's cached assets — even if checkVersion() never
// runs (e.g. on a first load after an update, or while offline).
let swContent: string;
try {
  swContent = fs
    .readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8')
    .replace(/'taskit-__APP_VERSION__'/g, `'taskit-${APP_VERSION}'`);
} catch (err) {
  console.error('Failed to read public/sw.js:', err);
  swContent = '/* sw.js not found */';
}

app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Service-Worker-Allowed', '/');
  res.send(swContent);
});

// Serve static frontend files
app.use(generalLimiter, express.static(path.join(__dirname, '..', '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      // Always revalidate the HTML shell so clients pick up new asset fingerprints
      // immediately, even when the Service Worker has been bypassed or not yet active.
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// SPA fallback
app.get('*', generalLimiter, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

startScheduler();

app.listen(PORT, () => {
  console.log(`TaskIt! server running on port ${PORT}`);
});

export default app;
