import express from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import './db'; // initialize database
import { APP_VERSION, JWT_SECRET, PORT } from './config';
import { startScheduler } from './services/scheduler';

import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import taskRoutes from './routes/tasks';
import taskTypeRoutes from './routes/taskTypes';
import adminRoutes from './routes/admin';
import userRoutes from './routes/users';

const app = express();

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
        const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { id: string };
        return `user:${payload.id}`;
      } catch {
        // invalid/expired token – fall through to IP-based key
      }
    }
    return req.ip ?? 'unknown';
  },
});

app.use(cors());
app.use(express.json());

// ─── Health-check endpoint (exempt from auth and rate limiting) ──────────────
app.get('/readyz', (_req, res) => {
  res.json({ ok: true, service: 'Jobber', version: APP_VERSION, timestamp: new Date().toISOString() });
});

// Version endpoint
app.get('/api/version', (_req, res) => {
  res.json({ version: APP_VERSION });
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/groups', authenticatedLimiter, groupRoutes);
app.use('/api/tasks', authenticatedLimiter, taskRoutes);
app.use('/api/task-types', authenticatedLimiter, taskTypeRoutes);
app.use('/api/admin', authenticatedLimiter, adminRoutes);
app.use('/api/users', authenticatedLimiter, userRoutes);

// Serve static frontend files
app.use(generalLimiter, express.static(path.join(__dirname, '..', '..', 'public')));

// SPA fallback
app.get('*', generalLimiter, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

startScheduler();

app.listen(PORT, () => {
  console.log(`Jobber server running on port ${PORT}`);
});

export default app;
