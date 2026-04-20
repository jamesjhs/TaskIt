import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import {
  getGamificationProfile,
  checkAndGrantAchievements,
  getStreaksForUser,
  applyStreakFreeze,
} from '../services/gamification';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/gamification/profile
 * Returns the current user's full gamification profile:
 * opt-in status, skill tree, achievements, dynamic title, and freeze credit balance.
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
    ORDER BY ua.unlocked_at DESC, a.key ASC
  `).all(userId) as Array<{
    id: string; key: string; name: string; description: string; unlockedAt: number | null;
  }>;

  res.json(rows);
});

/**
 * GET /api/gamification/streaks
 * Returns streak data for all active recurring tasks accessible to the user.
 */
router.get('/streaks', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const streaks = getStreaksForUser(userId);
  res.json(streaks);
});

/**
 * GET /api/gamification/leaderboard/group/:groupId
 * Returns a ranked list of group members (who have gamification enabled) by
 * total XP.  Only accessible to members of the group.
 */
router.get('/leaderboard/group/:groupId', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { groupId } = req.params;

  const membership = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId);

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const rows = db.prepare(`
    SELECT u.id, u.username,
           COALESCE(SUM(us.xp), 0) AS totalXp,
           MAX(us.level) AS topLevel
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    LEFT JOIN user_skills us ON us.user_id = u.id
    WHERE gm.group_id = ? AND u.gamification_enabled = 1
    GROUP BY u.id, u.username
    ORDER BY totalXp DESC, u.username ASC
  `).all(groupId) as Array<{ id: string; username: string; totalXp: number; topLevel: number | null }>;

  res.json(rows.map((row, i) => ({ ...row, rank: i + 1 })));
});

/**
 * GET /api/gamification/leaderboard/friends
 * Returns the current user plus all their friends who have gamification
 * enabled, ranked by total XP.
 */
router.get('/leaderboard/friends', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  const rows = db.prepare(`
    SELECT u.id, u.username,
           COALESCE(SUM(us.xp), 0) AS totalXp,
           MAX(us.level) AS topLevel,
           CASE WHEN u.id = ? THEN 1 ELSE 0 END AS isMe
    FROM users u
    LEFT JOIN user_skills us ON us.user_id = u.id
    WHERE u.id = ?
       OR (u.gamification_enabled = 1 AND EXISTS (
         SELECT 1 FROM user_friends uf WHERE uf.user_id = ? AND uf.friend_id = u.id
       ))
    GROUP BY u.id, u.username
    ORDER BY totalXp DESC, u.username ASC
  `).all(userId, userId, userId) as Array<{
    id: string; username: string; totalXp: number; topLevel: number | null; isMe: number;
  }>;

  res.json(rows.map((row, i) => ({ ...row, rank: i + 1, isMe: row.isMe === 1 })));
});

/**
 * POST /api/gamification/streaks/:taskId/freeze
 * Spends 1 freeze credit to protect the streak on a recurring task.
 * The Freeze absorbs the next missed deadline without resetting the streak.
 */
router.post('/streaks/:taskId/freeze', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { taskId } = req.params;

  const err = applyStreakFreeze(userId, taskId);
  if (err) {
    const status =
      err === 'User not found' || err === 'Task not found' ? 404 :
      err === 'Not authorized' ? 403 : 400;
    res.status(status).json({ error: err });
    return;
  }

  const streaks = getStreaksForUser(userId);
  const profile = getGamificationProfile(userId);
  res.json({ message: 'Freeze applied', streaks, freezeCredits: profile.freezeCredits });
});

export default router;
