import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import { getGamificationProfile, checkAndGrantAchievements } from '../services/gamification';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/gamification/profile
 * Returns the current user's full gamification profile:
 * opt-in status, skill tree, achievements, and dynamic title.
 */
router.get('/profile', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const profile = getGamificationProfile(userId);
  res.json(profile);
});

/**
 * PATCH /api/gamification/opt-in
 * Toggle (or explicitly set) gamification_enabled for the current user.
 * Body: { enabled: boolean }
 */
router.patch('/opt-in', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: '`enabled` must be a boolean' });
    return;
  }

  db.prepare('UPDATE users SET gamification_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, userId);

  // When a user first opts in, immediately check whether they have already
  // earned any achievements based on their existing task history.
  if (enabled) {
    checkAndGrantAchievements(userId);
  }

  const profile = getGamificationProfile(userId);
  res.json({ message: `Gamification ${enabled ? 'enabled' : 'disabled'}`, profile });
});

/**
 * GET /api/gamification/achievements
 * Returns the full catalogue of available achievements (with unlock status).
 * Useful for rendering the achievements list on the frontend.
 */
router.get('/achievements', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const rows = db.prepare(`
    SELECT a.id, a.key, a.name, a.description,
           ua.unlocked_at AS unlockedAt
    FROM achievements a
    LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
    ORDER BY ua.unlocked_at DESC NULLS LAST, a.key ASC
  `).all(userId) as Array<{
    id: string; key: string; name: string; description: string; unlockedAt: number | null;
  }>;

  res.json(rows);
});

export default router;
