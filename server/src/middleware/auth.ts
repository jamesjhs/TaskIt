import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import db from '../db';

export interface AuthPayload {
  id: string;
  username: string;
  email: string;
  role?: string;
  token_version?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AuthPayload;

    // Re-verify the user still exists and is not currently locked.
    // This ensures that deleted, locked, or password-changed accounts cannot
    // continue using an old JWT for the remainder of its 7-day lifetime.
    const userRow = db.prepare(
      'SELECT last_active_at, locked_until, token_version FROM users WHERE id = ?'
    ).get(payload.id) as { last_active_at: number | null; locked_until: number | null; token_version: number | null } | undefined;

    if (!userRow) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    if (userRow.locked_until && userRow.locked_until > Date.now()) {
      res.status(423).json({ error: 'Account is locked' });
      return;
    }

    const currentTokenVersion = userRow.token_version ?? 0;
    if (typeof payload.token_version !== 'number' || payload.token_version !== currentTokenVersion) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = payload;

    // Update last_active_at at most once per day per user
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    if (!userRow.last_active_at || userRow.last_active_at < todayMs) {
      db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(Date.now(), payload.id);
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
