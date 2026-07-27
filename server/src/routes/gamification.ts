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

const PSEUDONYM_MAX_LENGTH = 10;
const PSEUDONYM_MIN_LENGTH = 2;
const PSEUDONYM_BLOCKLIST = [
  'fuck', 'shit', 'cunt', 'cock', 'dick', 'pussy', 'bitch', 'bastard',
  'wank', 'twat', 'slut', 'whore', 'rape', 'nazi', 'hitler', 'porn',
];

function normalizeArcadePseudonym(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function leetFold(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7+]/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

function validateArcadePseudonym(rawValue: unknown): { value: string } | { error: string } {
  const value = normalizeArcadePseudonym(rawValue);
  if (value.length < PSEUDONYM_MIN_LENGTH) return { error: 'Pseudonym must be at least 2 characters' };
  if (value.length > PSEUDONYM_MAX_LENGTH) return { error: 'Pseudonym must be 10 characters or fewer' };
  if (!/^[A-Za-z0-9 _-]+$/.test(value)) return { error: 'Use only letters, numbers, spaces, hyphens, or underscores' };
  if (/@/.test(value) || /\b\S+@\S+\.\S+\b/.test(value)) return { error: 'Pseudonym cannot be an email address' };
  if (value.replace(/\D/g, '').length >= 7) return { error: 'Pseudonym cannot be a phone number' };
  if (/(?:https?:\/\/|www\.|\.com|\.net|\.org)/i.test(value)) return { error: 'Pseudonym cannot be a link or contact address' };

  const folded = leetFold(value);
  if (PSEUDONYM_BLOCKLIST.some(term => folded.includes(term))) {
    return { error: 'Choose a different pseudonym' };
  }

  return { value };
}

function requireGamifiedUser(userId: string): { arcade_pseudonym: string | null } | null {
  const row = db.prepare(
    'SELECT arcade_pseudonym FROM users WHERE id = ? AND gamification_enabled = 1'
  ).get(userId) as { arcade_pseudonym: string | null } | undefined;
  return row || null;
}

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
 * PUT /api/gamification/arcade/pseudonym
 * Sets the anonymous display name used for future public arcade high scores.
 * The account username/email are never exposed on the high-score table.
 */
router.put('/arcade/pseudonym', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const user = requireGamifiedUser(userId);
  if (!user) {
    res.status(403).json({ error: 'Enable gamification before choosing an arcade pseudonym' });
    return;
  }

  const result = validateArcadePseudonym(req.body?.pseudonym);
  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  db.prepare('UPDATE users SET arcade_pseudonym = ? WHERE id = ?').run(result.value, userId);
  res.json({ arcadePseudonym: result.value });
});

/**
 * POST /api/gamification/arcade/high-scores
 * Records a public anonymous high-score row for a completed arcade run.
 * Body: { gameId: string, score: number }
 */
router.post('/arcade/high-scores', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const user = requireGamifiedUser(userId);
  if (!user) {
    res.status(403).json({ error: 'Enable gamification before submitting scores' });
    return;
  }
  if (!user.arcade_pseudonym) {
    res.status(400).json({ error: 'Choose an arcade pseudonym before submitting scores' });
    return;
  }

  const gameId = String(req.body?.gameId || '').trim();
  const score = Number(req.body?.score);
  if (!/^[a-z0-9_-]{2,64}$/.test(gameId)) {
    res.status(400).json({ error: 'Invalid game id' });
    return;
  }
  if (!Number.isInteger(score) || score < 0 || score > 1000000000) {
    res.status(400).json({ error: 'Score must be an integer between 0 and 1,000,000,000' });
    return;
  }

  const game = db.prepare('SELECT game_id FROM arcade_games WHERE game_id = ? AND enabled = 1').get(gameId);
  if (!game) {
    res.status(404).json({ error: 'Arcade game not found' });
    return;
  }

  const id = randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO arcade_high_scores (id, user_id, game_id, score, pseudonym, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, gameId, score, user.arcade_pseudonym, now);

  const rankRow = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM arcade_high_scores
    WHERE game_id = ?
      AND (score > ? OR (score = ? AND created_at < ?))
  `).get(gameId, score, score, now) as { rank: number };

  res.status(201).json({ id, gameId, score, pseudonym: user.arcade_pseudonym, createdAt: now, rank: rankRow.rank });
});

/**
 * GET /api/gamification/arcade/high-scores/:gameId
 * Returns the public top scores for an enabled arcade game. Account usernames,
 * emails, and user IDs are deliberately omitted.
 */
router.get('/arcade/high-scores/:gameId', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const gameId = String(req.params.gameId || '').trim();
  if (!/^[a-z0-9_-]{2,64}$/.test(gameId)) {
    res.status(400).json({ error: 'Invalid game id' });
    return;
  }

  const game = db.prepare('SELECT game_id FROM arcade_games WHERE game_id = ? AND enabled = 1').get(gameId);
  if (!game) {
    res.status(404).json({ error: 'Arcade game not found' });
    return;
  }

  const rows = db.prepare(`
    SELECT id, score, pseudonym, created_at AS createdAt,
           CASE WHEN user_id = ? THEN 1 ELSE 0 END AS isMine
    FROM arcade_high_scores
    WHERE game_id = ?
    ORDER BY score DESC, created_at ASC
    LIMIT 20
  `).all(userId, gameId) as Array<{
    id: string;
    score: number;
    pseudonym: string;
    createdAt: number;
    isMine: number;
  }>;

  res.json(rows.map((row, i) => ({
    rank: i + 1,
    id: row.id,
    score: row.score,
    pseudonym: row.pseudonym,
    createdAt: row.createdAt,
    isMine: row.isMine === 1,
  })));
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
