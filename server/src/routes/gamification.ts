import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import {
  getGamificationProfile,
  checkAndGrantAchievements,
  getStreaksForUser,
  applyStreakFreeze,
  claimPendingDrop,
  getPendingDrop,
  awardEventXp,
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

/**
 * GET /api/gamification/catalogue
 * Returns the full catalogue of active (non-archived) collectibles with their
 * category details.  Available to any authenticated user so the frontend can
 * render unowned silhouette placeholders.
 */
router.get('/catalogue', (_req: Request, res: Response): void => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.description, c.rarity, c.icon_filename,
           ic.id AS category_id, ic.name AS category_name
    FROM collectibles c
    JOIN item_categories ic ON ic.id = c.category_id
    WHERE c.archived = 0 AND ic.archived = 0
    ORDER BY ic.name ASC, c.rarity ASC, c.name ASC
  `).all();
  res.json(rows);
});

// ─── User Inventory ───────────────────────────────────────────────────────────

/**
 * GET /api/gamification/inventory
 * Returns the authenticated user's full collectible inventory, joined with
 * item and category details, ordered by acquisition date (newest first).
 */
router.get('/inventory', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  const rows = db.prepare(`
    SELECT ui.id, ui.acquired_at,
           c.id AS collectible_id, c.name AS collectible_name,
           c.description, c.rarity, c.icon_filename,
           ic.id AS category_id, ic.name AS category_name
    FROM user_inventory ui
    JOIN collectibles c ON c.id = ui.collectible_id
    JOIN item_categories ic ON ic.id = c.category_id
    WHERE ui.user_id = ?
    ORDER BY ui.acquired_at DESC
  `).all(userId);

  res.json(rows);
});

/**
 * POST /api/gamification/inventory/claim
 * Claims the authenticated user's pending loot drop (if any) by removing it
 * from the in-memory cache and persisting it to user_inventory.
 * Returns 404 if no pending drop exists or it has expired.
 */
router.post('/inventory/claim', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  // Check (non-destructively) before writing — gives a clean 404 without side effects
  const pending = getPendingDrop(userId);
  if (!pending) {
    res.status(404).json({ error: 'No pending drop to claim' });
    return;
  }

  // Verify the collectible still exists and is not archived before saving
  const collectible = db.prepare(
    'SELECT id FROM collectibles WHERE id = ? AND archived = 0'
  ).get(pending.collectibleId);
  if (!collectible) {
    // The item was archived between the drop roll and the claim — cancel the drop
    claimPendingDrop(userId); // remove from cache
    res.status(410).json({ error: 'The dropped item was archived and can no longer be claimed' });
    return;
  }

  // Atomically consume the pending drop and write to user_inventory
  const claimTx = db.transaction(() => {
    const drop = claimPendingDrop(userId);
    if (!drop) return null; // raced to expiry between check and claim

    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      'INSERT INTO user_inventory (id, user_id, collectible_id, acquired_at) VALUES (?, ?, ?, ?)'
    ).run(id, userId, drop.collectibleId, now);

    return {
      id,
      acquired_at: now,
      collectible_id: drop.collectibleId,
      collectible_name: drop.collectibleName,
      rarity: drop.rarity,
      category_name: drop.categoryName,
    };
  });

  const saved = claimTx();
  if (!saved) {
    res.status(404).json({ error: 'No pending drop to claim' });
    return;
  }

  res.status(201).json(saved);
});

/**
 * POST /api/gamification/inventory/recycle
 * Discards the authenticated user's pending loot drop (if any) and awards a
 * small XP consolation bonus via the 'recycle_drop' XP event key.
 * Returns 404 if no pending drop exists or it has expired.
 */
router.post('/inventory/recycle', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  const pending = getPendingDrop(userId);
  if (!pending) {
    res.status(404).json({ error: 'No pending drop to recycle' });
    return;
  }

  // Consume (discard) the pending drop from the cache
  claimPendingDrop(userId);

  // Award a consolation XP bonus (event key configured via /api/admin/xp-events)
  const xpResult = awardEventXp(userId, 'recycle_drop');

  res.json({
    message: 'Drop recycled',
    xpAwarded: xpResult ? xpResult.xp : null,
  });
});

// ─── Arcade Token Economy ─────────────────────────────────────────────────────

/**
 * PATCH /api/gamification/arcade/daily-limit
 * Updates the current user's daily arcade play limit (in minutes).
 * Body: { minutes: number }  — must be an integer between 1 and 180.
 */
router.patch('/arcade/daily-limit', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { minutes } = req.body;

  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
    res.status(400).json({ error: '`minutes` must be an integer between 1 and 180' });
    return;
  }

  db.prepare('UPDATE users SET daily_play_minutes = ? WHERE id = ?').run(minutes, userId);
  res.json({ dailyPlayMinutes: minutes });
});

/**
 * POST /api/gamification/arcade/spend-token
 * Deducts 1 Arcade Token from the current user's balance and returns the new balance.
 * Uses a database transaction with a conditional UPDATE to prevent the balance
 * from dropping below zero, even under concurrent requests.
 */
router.post('/arcade/spend-token', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  const spendToken = db.transaction((): number => {
    // The WHERE clause (arcade_tokens > 0) acts as an atomic guard:
    // if a concurrent request has already spent the last token, changes === 0.
    const info = db.prepare(
      'UPDATE users SET arcade_tokens = arcade_tokens - 1 WHERE id = ? AND arcade_tokens > 0'
    ).run(userId);

    if (info.changes === 0) {
      // Either the user doesn't exist or the balance is already zero.
      const exists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId);
      throw new Error(exists ? 'NO_TOKENS' : 'USER_NOT_FOUND');
    }

    const updated = db.prepare(
      'SELECT arcade_tokens FROM users WHERE id = ?'
    ).get(userId) as { arcade_tokens: number };

    return updated.arcade_tokens;
  });

  try {
    const newBalance = spendToken();
    res.json({ arcadeTokens: newBalance });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'USER_NOT_FOUND') { res.status(404).json({ error: 'User not found' }); return; }
    if (msg === 'NO_TOKENS') { res.status(400).json({ error: 'No arcade tokens available' }); return; }
    throw err;
  }
});

/**
 * GET /api/gamification/arcade/games
 * Returns enabled arcade games in unlock order.  The frontend uses this as the
 * catalogue for achievement-card labels and dynamic game-module loading.
 */
router.get('/arcade/games', (_req: Request, res: Response): void => {
  const rows = db.prepare(`
    SELECT id, achievement_key AS achievementKey, title, subtitle, icon,
           game_id AS gameId, script_path AS scriptPath, sort_order AS sortOrder,
           enabled, updated_at AS updatedAt
    FROM arcade_games
    WHERE enabled = 1
    ORDER BY sort_order ASC, title ASC
  `).all();
  res.json(rows);
});

export default router;
