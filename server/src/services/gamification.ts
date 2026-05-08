/**
 * Gamification Engine — Steps 1 & 2
 *
 * Step 1: Skill Trees & Dynamic Titles (Priority 1)
 *         Personal Achievements (Priority 2)
 * Step 2: Streak System with Freeze mechanic (Priority 3)
 * Step 3: Collectibles Loot Drop Engine
 *
 * All public functions are no-ops when gamification_enabled = 0 on the user.
 */

import db from '../db';

// ---------------------------------------------------------------------------
// Sporadic Tasks — Friendly Time Formatting
// ---------------------------------------------------------------------------

/**
 * Formats a duration in milliseconds as a human-readable friendly time string.
 * Examples: "just now", "5 minutes", "2 days", "1 year"
 */
export function formatFriendlyTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} year${years > 1 ? 's' : ''}`;
  if (months > 0) return `${months} month${months > 1 ? 's' : ''}`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''}`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return 'just now';
}

// ---------------------------------------------------------------------------
// Collectibles — Loot Drop Engine (Step 3)
// ---------------------------------------------------------------------------

/** Describes a collectible item that has just dropped for a user. */
export interface LootDropResult {
  collectibleId: string;
  collectibleName: string;
  rarity: string;
  categoryName: string;
  iconFilename: string | null;
}

interface PendingDropEntry {
  drop: LootDropResult;
  expiresAt: number;
}

// In-memory pending-drop cache: userId → pending drop.
// Entries expire after PENDING_DROP_TTL_MS milliseconds.
// A user can only have one unclaimed pending drop at a time.
const pendingDrops = new Map<string, PendingDropEntry>();

/** How long (ms) a pending drop remains claimable before it expires. */
const PENDING_DROP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Sum of all rarity weights — used to normalise the random roll. */
const TOTAL_RARITY_WEIGHT = 100;

/** Rarity tiers with weighted probabilities (must sum to TOTAL_RARITY_WEIGHT). */
const RARITY_WEIGHTS: Array<{ rarity: string; weight: number }> = [
  { rarity: 'common', weight: 70 },
  { rarity: 'rare',   weight: 25 },
  { rarity: 'epic',   weight: 5  },
];

// Guard: validate at module load time that the weights are correctly configured.
// This catches misconfiguration immediately rather than letting the drop engine
// silently produce skewed probabilities.
{
  const actualSum = RARITY_WEIGHTS.reduce((acc, r) => acc + r.weight, 0);
  if (actualSum !== TOTAL_RARITY_WEIGHT) {
    throw new Error(
      `RARITY_WEIGHTS sum is ${actualSum} but must equal TOTAL_RARITY_WEIGHT (${TOTAL_RARITY_WEIGHT})`
    );
  }
}

/**
 * Base drop probability per 50 XP earned.
 * 25% chance at 50 XP, 50% at 100 XP, capped at MAX_DROP_CHANCE.
 */
const BASE_DROP_RATE_PER_50_XP = 0.25;
/** Maximum drop probability regardless of XP earned. */
const MAX_DROP_CHANCE = 0.75;
/** XP amount used as the scaling unit for drop probability. */
const XP_SCALE_FACTOR = 50;

/** Evict entries whose TTL has elapsed. Called before any cache write. */
function purgeExpiredDrops(): void {
  const now = Date.now();
  for (const [uid, entry] of pendingDrops) {
    if (entry.expiresAt < now) pendingDrops.delete(uid);
  }
}

/** Pick a rarity tier using weighted random selection. */
function selectWeightedRarity(): string {
  const roll = Math.random() * TOTAL_RARITY_WEIGHT;
  let cumulative = 0;
  for (const { rarity, weight } of RARITY_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return rarity;
  }
  return 'common'; // unreachable if weights sum to TOTAL_RARITY_WEIGHT, but required as fallback
}

/**
 * Rolls for a loot drop based on XP gained.  If a drop occurs and no
 * unclaimed drop is already pending for the user, the result is stored in
 * the in-memory cache and returned.  Returns null when:
 *   - the RNG dice miss the drop threshold,
 *   - there are no active collectibles in the database, or
 *   - the user already has an unclaimed pending drop.
 */
function rollLootDrop(userId: string, xpGained: number): LootDropResult | null {
  purgeExpiredDrops();

  // Prevent overwriting an existing unclaimed drop (anti–ghost-drop guard)
  if (pendingDrops.has(userId)) return null;

  // Probability check: chance scales linearly with XP, capped at MAX_DROP_CHANCE
  const dropChance = Math.min(MAX_DROP_CHANCE, (xpGained / XP_SCALE_FACTOR) * BASE_DROP_RATE_PER_50_XP);
  if (Math.random() >= dropChance) return null;

  const rarity = selectWeightedRarity();

  // Pick a random collectible of the rolled rarity (not archived)
  const candidates = db.prepare(`
    SELECT c.id, c.name, c.icon_filename, ic.name AS category_name
    FROM collectibles c
    JOIN item_categories ic ON ic.id = c.category_id
    WHERE c.rarity = ? AND c.archived = 0 AND ic.archived = 0
  `).all(rarity) as Array<{ id: string; name: string; icon_filename: string | null; category_name: string }>;

  let pick: { id: string; name: string; icon_filename: string | null; category_name: string } | undefined;

  if (candidates.length > 0) {
    pick = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    // Fallback: any active collectible regardless of rarity
    pick = db.prepare(`
      SELECT c.id, c.name, c.icon_filename, ic.name AS category_name
      FROM collectibles c
      JOIN item_categories ic ON ic.id = c.category_id
      WHERE c.archived = 0 AND ic.archived = 0
      ORDER BY RANDOM()
      LIMIT 1
    `).get() as { id: string; name: string; icon_filename: string | null; category_name: string } | undefined;
  }

  if (!pick) return null;

  const result: LootDropResult = {
    collectibleId: pick.id,
    collectibleName: pick.name,
    rarity,
    categoryName: pick.category_name,
    iconFilename: pick.icon_filename ?? null,
  };

  pendingDrops.set(userId, { drop: result, expiresAt: Date.now() + PENDING_DROP_TTL_MS });
  return result;
}

/**
 * Atomically removes the pending drop from the in-memory cache and returns
 * it so the caller can persist it to user_inventory.  Returns null if the
 * user has no pending drop or it has expired.
 */
export function claimPendingDrop(userId: string): LootDropResult | null {
  const entry = pendingDrops.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    pendingDrops.delete(userId);
    return null;
  }
  pendingDrops.delete(userId);
  return entry.drop;
}

/**
 * Returns the user's current pending drop without consuming it.
 * Returns null if none exists or it has expired.
 */
export function getPendingDrop(userId: string): LootDropResult | null {
  const entry = pendingDrops.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    pendingDrops.delete(userId);
    return null;
  }
  return entry.drop;
}

// ---------------------------------------------------------------------------
// XP / Level maths
// ---------------------------------------------------------------------------

/**
 * Returns the *cumulative* XP required to reach the given level.
 * Uses a triangular escalation: each level-up costs 100 × level XP.
 *   Level 1→2:  100 XP  (total  100)
 *   Level 2→3:  200 XP  (total  300)
 *   Level 3→4:  300 XP  (total  600)
 *   Level n→n+1: 100×n XP
 */
export function xpThresholdForLevel(level: number): number {
  // Sum of 100*1 + 100*2 + … + 100*(level-1) = 100 * (level-1)*level/2
  return 100 * ((level - 1) * level) / 2;
}

/** Derive the current level from total accumulated XP. */
export function computeLevel(totalXp: number): number {
  // Solve 50*n*(n-1) <= totalXp
  // n = floor( (1 + sqrt(1 + 4*totalXp/50)) / 2 )
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + 4 * totalXp / 50)) / 2));
}

/** XP awarded per completed task (flat base amount). */
export const BASE_TASK_XP = 50;

// ---------------------------------------------------------------------------
// XP event catalogue helpers
// ---------------------------------------------------------------------------

/**
 * Returns the XP value configured for an event key.
 * Returns 0 if the event is disabled or not found.
 */
export function getXpEventValue(key: string): number {
  const row = db.prepare(
    'SELECT xp_value, enabled FROM xp_events WHERE key = ?'
  ).get(key) as { xp_value: number; enabled: number } | undefined;
  if (!row || !row.enabled) return 0;
  return row.xp_value;
}

/**
 * Awards XP for a named event (e.g. 'signup', 'create_task') to the user's
 * "Activity" skill.  Unlike awardTaskXp, this does NOT require gamification
 * to be enabled — XP accumulates from day one so users have something waiting
 * for them when they do opt in.
 *
 * Returns the updated skill row, or null if the event value is 0 / disabled.
 */
export function awardEventXp(
  userId: string,
  eventKey: string,
): { skill_name: string; xp: number; level: number; drop: LootDropResult | null } | null {
  const xpAmount = getXpEventValue(eventKey);
  if (xpAmount <= 0) return null;

  const SKILL = 'Activity';

  const existing = db.prepare(
    'SELECT xp, level FROM user_skills WHERE user_id = ? AND skill_name = ?'
  ).get(userId, SKILL) as { xp: number; level: number } | undefined;

  // Compute old overall level before award
  const oldTotalRow = db.prepare(
    'SELECT COALESCE(SUM(xp), 0) AS total FROM user_skills WHERE user_id = ?'
  ).get(userId) as { total: number };
  const oldOverallLevel = computeLevel(oldTotalRow.total);

  let newXp: number;
  let newLevel: number;

  if (existing) {
    newXp = existing.xp + xpAmount;
    newLevel = computeLevel(newXp);
    db.prepare(
      'UPDATE user_skills SET xp = ?, level = ? WHERE user_id = ? AND skill_name = ?'
    ).run(newXp, newLevel, userId, SKILL);
  } else {
    newXp = xpAmount;
    newLevel = computeLevel(newXp);
    db.prepare(
      'INSERT INTO user_skills (user_id, skill_name, xp, level) VALUES (?, ?, ?, ?)'
    ).run(userId, SKILL, newXp, newLevel);
  }

  // Award 3 Arcade Tokens whenever the overall level crosses a threshold.
  const newOverallLevel = computeLevel(oldTotalRow.total + xpAmount);
  if (newOverallLevel > oldOverallLevel) {
    db.prepare(
      'UPDATE users SET arcade_tokens = arcade_tokens + 3 WHERE id = ?'
    ).run(userId);
  }

  const drop = rollLootDrop(userId, xpAmount);
  return { skill_name: SKILL, xp: newXp, level: newLevel, drop };
}

// ---------------------------------------------------------------------------
// Dynamic title generation
// ---------------------------------------------------------------------------

const TITLE_TIERS: Array<{ minLevel: number; prefix: string }> = [
  { minLevel: 10, prefix: 'Guru of' },
  { minLevel: 7,  prefix: 'Master' },
  { minLevel: 5,  prefix: 'Expert' },
  { minLevel: 3,  prefix: 'Skilled' },
  { minLevel: 1,  prefix: 'Apprentice' },
];

/**
 * Derives a title string from the user's overall level (computed from total XP
 * across all skills) combined with the skill in which the most XP has been earned.
 * Returns null if the user has no skills yet.
 */
export function computeDynamicTitle(userId: string): string | null {
  const totalXpRow = db.prepare(
    'SELECT COALESCE(SUM(xp), 0) AS total FROM user_skills WHERE user_id = ?'
  ).get(userId) as { total: number } | undefined;

  const totalXp = totalXpRow?.total ?? 0;
  const overallLevel = computeLevel(totalXp);

  if (overallLevel < 1 || totalXp === 0) return null;

  const topSkill = db.prepare(
    'SELECT skill_name FROM user_skills WHERE user_id = ? ORDER BY xp DESC LIMIT 1'
  ).get(userId) as { skill_name: string } | undefined;

  if (!topSkill) return null;

  const tier = TITLE_TIERS.find(t => overallLevel >= t.minLevel) ?? TITLE_TIERS[TITLE_TIERS.length - 1];
  return `${tier.prefix} ${topSkill.skill_name}`;
}

// ---------------------------------------------------------------------------
// Skill XP — award on task completion
// ---------------------------------------------------------------------------

/**
 * Awards task-completion XP to the skill mapped from `typeId` for `userId`.
 * The base amount is read from the `xp_events` table (key: `complete_task`),
 * falling back to BASE_TASK_XP if the event is disabled or not found.
 * An optional `xpMultiplier` (default 1.0) scales the award — used by groups
 * that have the gamification-enhancements feature enabled.
 * Silently skips if gamification is disabled for the user.
 * Returns the updated skill row (or null if skipped).
 */
export function awardTaskXp(
  userId: string,
  typeId: string,
  xpMultiplier: number = 1.0,
): { skill_name: string; xp: number; level: number; drop: LootDropResult | null } | null {
  const user = db.prepare(
    'SELECT gamification_enabled FROM users WHERE id = ?'
  ).get(userId) as { gamification_enabled: number } | undefined;

  if (!user || !user.gamification_enabled) return null;

  const taskType = db.prepare(
    'SELECT name FROM task_types WHERE id = ?'
  ).get(typeId) as { name: string } | undefined;

  if (!taskType) return null;

  const skillName = taskType.name;

  // Determine the XP to award: configurable base value scaled by the multiplier.
  // Clamp the multiplier to a sensible range and ensure at least 1 XP is awarded.
  const baseXp = getXpEventValue('complete_task') || BASE_TASK_XP;
  const clampedMultiplier = Math.max(0.1, Math.min(10, xpMultiplier));
  const awardXp = Math.max(1, Math.round(baseXp * clampedMultiplier));

  // Compute old overall level before award
  const oldTotalRow = db.prepare(
    'SELECT COALESCE(SUM(xp), 0) AS total FROM user_skills WHERE user_id = ?'
  ).get(userId) as { total: number };
  const oldOverallLevel = computeLevel(oldTotalRow.total);

  const existing = db.prepare(
    'SELECT xp, level FROM user_skills WHERE user_id = ? AND skill_name = ?'
  ).get(userId, skillName) as { xp: number; level: number } | undefined;

  let newXp: number;
  let newLevel: number;

  if (existing) {
    newXp = existing.xp + awardXp;
    newLevel = computeLevel(newXp);
    db.prepare(
      'UPDATE user_skills SET xp = ?, level = ? WHERE user_id = ? AND skill_name = ?'
    ).run(newXp, newLevel, userId, skillName);
  } else {
    newXp = awardXp;
    newLevel = computeLevel(newXp);
    db.prepare(
      'INSERT INTO user_skills (user_id, skill_name, xp, level) VALUES (?, ?, ?, ?)'
    ).run(userId, skillName, newXp, newLevel);
  }

  // Award 3 Arcade Tokens whenever the overall level crosses a threshold.
  const newOverallLevel = computeLevel(oldTotalRow.total + awardXp);
  if (newOverallLevel > oldOverallLevel) {
    db.prepare(
      'UPDATE users SET arcade_tokens = arcade_tokens + 3 WHERE id = ?'
    ).run(userId);
  }

  const drop = rollLootDrop(userId, awardXp);
  return { skill_name: skillName, xp: newXp, level: newLevel, drop };
}

// ---------------------------------------------------------------------------
// Achievement checking
// ---------------------------------------------------------------------------

interface AchievementRow {
  id: string;
  key: string;
}

/**
 * Checks all achievement thresholds for a user and grants any newly earned
 * achievements. Should be called after any event that could trigger progress
 * (task completion, note creation).
 *
 * Returns an array of achievement keys that were newly unlocked.
 */
export function checkAndGrantAchievements(userId: string): string[] {
  const user = db.prepare(
    'SELECT gamification_enabled FROM users WHERE id = ?'
  ).get(userId) as { gamification_enabled: number } | undefined;

  if (!user || !user.gamification_enabled) return [];

  // Pre-load all achievement definitions and already-unlocked achievement ids
  const allAchievements = db.prepare(
    'SELECT id, key FROM achievements'
  ).all() as AchievementRow[];

  const unlocked = new Set<string>(
    (db.prepare(
      'SELECT achievement_id FROM user_achievements WHERE user_id = ?'
    ).all(userId) as Array<{ achievement_id: string }>).map(r => r.achievement_id)
  );

  const achievementMap = new Map<string, string>(
    allAchievements.map(a => [a.key, a.id])
  );

  // --- Gather metrics --------------------------------------------------

  // Tasks this user personally completed (completed_by = userId)
  // Falls back to created_by for tasks completed before the column was added.
  const completedCountRow = db.prepare(`
    SELECT COUNT(*) AS cnt FROM tasks
    WHERE status = 'complete'
      AND (completed_by = ? OR (completed_by IS NULL AND created_by = ?))
  `).get(userId, userId) as { cnt: number };
  const completedCount = completedCountRow.cnt;

  // Total progress notes authored by this user
  const noteCountRow = db.prepare(
    'SELECT COUNT(*) AS cnt FROM task_notes WHERE user_id = ?'
  ).get(userId) as { cnt: number };
  const noteCount = noteCountRow.cnt;

  // Tasks this user completed BEFORE their due date.
  // Uses completed_at (reliable) with fallback to updated_at for old rows.
  const earlyCountRow = db.prepare(`
    SELECT COUNT(*) AS cnt FROM tasks
    WHERE status = 'complete'
      AND due_date IS NOT NULL
      AND (completed_by = ? OR (completed_by IS NULL AND created_by = ?))
      AND COALESCE(completed_at, updated_at) <= due_date
  `).get(userId, userId) as { cnt: number };
  const earlyCount = earlyCountRow.cnt;

  // Distinct task types across tasks this user completed
  const typeCountRow = db.prepare(`
    SELECT COUNT(DISTINCT type_id) AS cnt FROM tasks
    WHERE status = 'complete'
      AND (completed_by = ? OR (completed_by IS NULL AND created_by = ?))
  `).get(userId, userId) as { cnt: number };
  const typeCount = typeCountRow.cnt;

  // Overall level derived from total XP across all skills (used for level-based achievements)
  const totalXpRow = db.prepare(
    'SELECT COALESCE(SUM(xp), 0) AS total FROM user_skills WHERE user_id = ?'
  ).get(userId) as { total: number };
  const overallLevel = computeLevel(totalXpRow.total);

  // Longest streak across all of the user's recurring tasks
  const topStreakRow = db.prepare(`
    SELECT MAX(streak_longest) AS maxStreak FROM tasks
    WHERE recur_interval IS NOT NULL
      AND created_by = ?
  `).get(userId) as { maxStreak: number | null };
  const topStreak = topStreakRow.maxStreak ?? 0;

  // --- Threshold rules -------------------------------------------------
  const rules: Array<{ key: string; earned: boolean }> = [
    { key: 'first_task',      earned: completedCount >= 1 },
    { key: 'task_10',         earned: completedCount >= 10 },
    { key: 'task_50',         earned: completedCount >= 50 },
    { key: 'task_100',        earned: completedCount >= 100 },
    { key: 'task_500',        earned: completedCount >= 500 },
    { key: 'detail_oriented', earned: noteCount >= 50 },
    { key: 'early_bird',      earned: earlyCount >= 10 },
    { key: 'type_explorer',   earned: typeCount >= 5 },
    { key: 'skill_level_5',   earned: overallLevel >= 5 },
    { key: 'skill_level_10',  earned: overallLevel >= 10 },
    { key: 'streak_3',        earned: topStreak >= 3 },
    { key: 'streak_7',        earned: topStreak >= 7 },
    { key: 'streak_30',       earned: topStreak >= 30 },
  ];

  const newlyUnlocked: string[] = [];
  const now = Date.now();
  const insertAchievement = db.prepare(
    'INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)'
  );

  for (const rule of rules) {
    const achievementId = achievementMap.get(rule.key);
    if (!achievementId) continue;
    if (unlocked.has(achievementId)) continue;
    if (!rule.earned) continue;

    insertAchievement.run(userId, achievementId, now);
    newlyUnlocked.push(rule.key);
  }

  return newlyUnlocked;
}

// ---------------------------------------------------------------------------
// Profile summary
// ---------------------------------------------------------------------------

export interface GamificationProfile {
  enabled: boolean;
  title: string | null;
  totalXp: number;
  level: number;
  xpToNextLevel: number;
  freezeCredits: number;
  arcadeTokens: number;
  dailyPlayMinutes: number;
  skills: Array<{ skill_name: string; xp: number }>;
  achievements: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
    unlockedAt: number | null;
  }>;
}

export function getGamificationProfile(userId: string): GamificationProfile {
  const user = db.prepare(
    'SELECT gamification_enabled, freeze_credits, arcade_tokens, daily_play_minutes FROM users WHERE id = ?'
  ).get(userId) as { gamification_enabled: number; freeze_credits: number; arcade_tokens: number; daily_play_minutes: number } | undefined;

  const enabled = !!(user?.gamification_enabled);
  const freezeCredits = user?.freeze_credits ?? 0;
  const arcadeTokens = user?.arcade_tokens ?? 0;
  const siteRow = db.prepare("SELECT value FROM site_settings WHERE key = 'arcade_daily_play_minutes'").get() as { value: string } | undefined;
  const siteDefault = siteRow ? (parseInt(siteRow.value, 10) || 5) : 5;
  const dailyPlayMinutes = user?.daily_play_minutes ?? siteDefault;

  const skills = (db.prepare(
    'SELECT skill_name, xp FROM user_skills WHERE user_id = ? ORDER BY xp DESC'
  ).all(userId) as Array<{ skill_name: string; xp: number }>);

  const totalXp = skills.reduce((sum, s) => sum + s.xp, 0);
  const level = computeLevel(totalXp);
  const xpToNextLevel = Math.max(0, xpThresholdForLevel(level + 1) - totalXp);

  // All achievements with unlock status for this user.
  // SQLite orders NULLs last in a DESC sort, so unlocked achievements appear first.
  const achievementRows = db.prepare(`
    SELECT a.id, a.key, a.name, a.description,
           ua.unlocked_at AS unlockedAt
    FROM achievements a
    LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
    ORDER BY ua.unlocked_at DESC, a.key ASC
  `).all(userId) as Array<{
    id: string; key: string; name: string; description: string; unlockedAt: number | null;
  }>;

  return {
    enabled,
    title: enabled ? computeDynamicTitle(userId) : null,
    totalXp,
    level,
    xpToNextLevel,
    freezeCredits,
    arcadeTokens,
    dailyPlayMinutes,
    skills,
    achievements: achievementRows,
  };
}

// ---------------------------------------------------------------------------
// Step 2 — Streak System
// ---------------------------------------------------------------------------

/**
 * Pure (no DB calls) calculation of the streak values for a newly-spawned
 * recurring task occurrence after its parent was completed.
 *
 * @param currentStreak  Parent task's streak_current
 * @param longestStreak  Parent task's streak_longest
 * @param streakFrozen   Whether a Freeze was applied to the parent task
 * @param completedAt    Millisecond timestamp when the parent was completed
 * @param dueDate        Parent task's due_date (null = no deadline, always on-time)
 */
export function computeNewStreakValues(
  currentStreak: number,
  longestStreak: number,
  streakFrozen: boolean,
  completedAt: number,
  dueDate: number | null,
): { newStreak: number; newLongest: number; freezeConsumed: boolean } {
  const wasOnTime = dueDate == null || completedAt <= dueDate;
  const freezeConsumed = !wasOnTime && streakFrozen;
  const newStreak = (wasOnTime || streakFrozen) ? currentStreak + 1 : 0;
  const newLongest = Math.max(longestStreak, newStreak);
  return { newStreak, newLongest, freezeConsumed };
}

/**
 * Awards 1 freeze credit to the user for completing a task.
 * Only called when gamification is enabled.
 * Currently awards 1 credit per completion; the rate can be tuned here.
 */
export function awardFreezeCredit(userId: string): void {
  const user = db.prepare(
    'SELECT gamification_enabled FROM users WHERE id = ?'
  ).get(userId) as { gamification_enabled: number } | undefined;

  if (!user || !user.gamification_enabled) return;

  db.prepare(
    'UPDATE users SET freeze_credits = freeze_credits + 1 WHERE id = ?'
  ).run(userId);
}

/**
 * Decrements a user's freeze_credits by 1 (floor at 0).
 * Called when a freeze is consumed on task completion.
 */
export function consumeFreezeCredit(userId: string): void {
  db.prepare(
    'UPDATE users SET freeze_credits = MAX(0, freeze_credits - 1) WHERE id = ?'
  ).run(userId);
}

/**
 * Applies a Freeze to a recurring task, spending 1 freeze credit.
 * Returns an error string on failure, or null on success.
 */
export function applyStreakFreeze(
  userId: string,
  taskId: string,
): string | null {
  const user = db.prepare(
    'SELECT gamification_enabled, freeze_credits FROM users WHERE id = ?'
  ).get(userId) as { gamification_enabled: number; freeze_credits: number } | undefined;

  if (!user) return 'User not found';
  if (!user.gamification_enabled) return 'Gamification is not enabled';
  // Fast-fail before acquiring the transaction: avoids a round-trip to SQLite
  // when the balance is clearly zero. The transaction itself also guards via
  // WHERE freeze_credits > 0, so this is purely a performance optimisation.
  if (user.freeze_credits < 1) return 'No freeze credits available';

  const task = db.prepare(
    'SELECT id, recur_interval, streak_frozen, created_by FROM tasks WHERE id = ?'
  ).get(taskId) as {
    id: string; recur_interval: number | null; streak_frozen: number; created_by: string;
  } | undefined;

  if (!task) return 'Task not found';
  if (!task.recur_interval) return 'Freezes can only be applied to recurring tasks';
  if (task.streak_frozen) return 'A freeze is already active on this task';

  // Verify the user has access to this task
  const hasAccess = task.created_by === userId || !!db.prepare(
    `SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?
     UNION ALL
     SELECT 1 FROM group_members gm
       JOIN tasks t ON t.group_id = gm.group_id
       WHERE t.id = ? AND gm.user_id = ?
     LIMIT 1`
  ).get(taskId, userId, taskId, userId);

  if (!hasAccess) return 'Not authorized';

  // Atomic deduct + apply — wrapped in a transaction so both succeed or both
  // roll back. We also check that the credit row was actually modified; a
  // concurrent request may have spent the last credit between our guard above
  // and this UPDATE, which would leave changes = 0.
  const applyFreeze = db.transaction(() => {
    const info = db.prepare(
      'UPDATE users SET freeze_credits = freeze_credits - 1 WHERE id = ? AND freeze_credits > 0'
    ).run(userId);
    if (info.changes === 0) {
      // Credits were exhausted by a concurrent request — abort the transaction
      throw new Error('INSUFFICIENT_CREDITS');
    }
    db.prepare('UPDATE tasks SET streak_frozen = 1 WHERE id = ?').run(taskId);
  });

  try {
    applyFreeze();
  } catch (err) {
    if ((err as Error).message === 'INSUFFICIENT_CREDITS') {
      return 'No freeze credits available';
    }
    throw err;
  }

  return null;
}

/**
 * Returns streak info for all active recurring tasks accessible to a user.
 */
export function getStreaksForUser(userId: string): Array<{
  taskId: string;
  title: string;
  currentStreak: number;
  longestStreak: number;
  frozen: boolean;
  dueDate: number | null;
}> {
  const rows = db.prepare(`
    SELECT t.id AS taskId, t.title, t.streak_current AS currentStreak,
           t.streak_longest AS longestStreak, t.streak_frozen AS frozen,
           t.due_date AS dueDate
    FROM tasks t
    WHERE t.recur_interval IS NOT NULL
      AND t.archived = 0
      AND (
        t.created_by = ?
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)
        OR (t.group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = ?
        ))
      )
    ORDER BY t.streak_current DESC, t.title ASC
  `).all(userId, userId, userId) as Array<{
    taskId: string; title: string; currentStreak: number;
    longestStreak: number; frozen: number; dueDate: number | null;
  }>;

  return rows.map(r => ({ ...r, frozen: r.frozen === 1 }));
}

/**
 * Detects overdue recurring tasks and resets their streaks.
 * Should be called by the scheduler on each hourly tick.
 *
 * - Frozen tasks: the Freeze absorbs the miss — clear the flag, keep streak.
 * - Unfrozen tasks: reset streak_current to 0.
 */
export function resetOverdueStreaks(): void {
  const now = Date.now();

  // Frozen overdue tasks: freeze absorbs this miss
  db.prepare(`
    UPDATE tasks
    SET streak_frozen = 0
    WHERE recur_interval IS NOT NULL
      AND due_date IS NOT NULL
      AND due_date < ?
      AND status != 'complete'
      AND archived = 0
      AND streak_frozen = 1
  `).run(now);

  // Unfrozen overdue tasks: streak resets
  db.prepare(`
    UPDATE tasks
    SET streak_current = 0
    WHERE recur_interval IS NOT NULL
      AND due_date IS NOT NULL
      AND due_date < ?
      AND status != 'complete'
      AND archived = 0
      AND streak_frozen = 0
      AND streak_current > 0
  `).run(now);
}
