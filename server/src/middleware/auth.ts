import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import db from '../db';

export interface AuthPayload {
  id: string;
  username: string;
  email: string;
  role?: string;
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
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    // Update last_active_at at most once per day per user
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const row = db.prepare('SELECT last_active_at FROM users WHERE id = ?').get(payload.id) as { last_active_at: number | null } | undefined;
    if (!row?.last_active_at || row.last_active_at < todayMs) {
      db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(Date.now(), payload.id);
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
