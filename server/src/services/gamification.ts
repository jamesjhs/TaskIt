/**
 * Gamification Engine — Step 1
 *
 * Covers Priority 1 (Skill Trees & Dynamic Titles) and
 * Priority 2 (Personal Achievements).
 *
 * All public functions are no-ops when gamification_enabled = 0 on the user.
 */

import db from '../db';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// XP / Level maths
// ---------------------------------------------------------------------------

/**
 * Returns the *cumulative* XP required to reach the given level.
 * Uses a triangular escalation: each level-up costs 100 * level XP.
 *   Level 1→2:  100 XP  (total  100)
 *   Level 2→3:  200 XP  (total  300)
 *   Level 3→4:  300 XP  (total  600)
 *   Level n→n+1: 100*n XP
 */
export function xpThresholdForLevel(level: number): number {
  // Sum of 100*1 + 100*2 + … + 100*(level-1) = 100 * (level-1)*level/2
  return 100 * ((level - 1) * level) / 2;
}

/** Derive the current level from total accumulated XP. */
export function computeLevel(totalXp: number): number {
  // level n is reached when totalXp >= xpThresholdForLevel(n)
  // xpThresholdForLevel(n) = 50 * n * (n-1)
  // Solve 50*n*(n-1) <= totalXp → n^2 - n - totalXp/50 <= 0
  // n = floor( (1 + sqrt(1 + 4*totalXp/50)) / 2 )
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + 4 * totalXp / 50)) / 2));
}

/** XP awarded per completed task (flat base amount). */
export const BASE_TASK_XP = 50;

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
 * Returns the highest-level skill for a user and derives a title string.
 * Returns null if the user has no skills yet.
 */
export function computeDynamicTitle(userId: string): string | null {
  const topSkill = db.prepare(
    'SELECT skill_name, level FROM user_skills WHERE user_id = ? ORDER BY level DESC, xp DESC LIMIT 1'
  ).get(userId) as { skill_name: string; level: number } | undefined;

  if (!topSkill || topSkill.level < 1) return null;

  const tier = TITLE_TIERS.find(t => topSkill.level >= t.minLevel) ?? TITLE_TIERS[TITLE_TIERS.length - 1];
  return `${tier.prefix} ${topSkill.skill_name}`;
}

// ---------------------------------------------------------------------------
// Skill XP — award on task completion
// ---------------------------------------------------------------------------

/**
 * Awards BASE_TASK_XP to the skill mapped from `typeId` for `userId`.
 * Silently skips if gamification is disabled for the user.
 * Returns the updated skill row (or null if skipped).
 */
export function awardTaskXp(
  userId: string,
  typeId: string,
): { skill_name: string; xp: number; level: number } | null {
  const user = db.prepare(
    'SELECT gamification_enabled FROM users WHERE id = ?'
  ).get(userId) as { gamification_enabled: number } | undefined;

  if (!user || !user.gamification_enabled) return null;

  const taskType = db.prepare(
    'SELECT name FROM task_types WHERE id = ?'
  ).get(typeId) as { name: string } | undefined;

  if (!taskType) return null;

  const skillName = taskType.name;

  // Upsert the skill row
  const existing = db.prepare(
    'SELECT xp, level FROM user_skills WHERE user_id = ? AND skill_name = ?'
  ).get(userId, skillName) as { xp: number; level: number } | undefined;

  let newXp: number;
  let newLevel: number;

  if (existing) {
    newXp = existing.xp + BASE_TASK_XP;
    newLevel = computeLevel(newXp);
    db.prepare(
      'UPDATE user_skills SET xp = ?, level = ? WHERE user_id = ? AND skill_name = ?'
    ).run(newXp, newLevel, userId, skillName);
  } else {
    newXp = BASE_TASK_XP;
    newLevel = computeLevel(newXp);
    db.prepare(
      'INSERT INTO user_skills (user_id, skill_name, xp, level) VALUES (?, ?, ?, ?)'
    ).run(userId, skillName, newXp, newLevel);
  }

  return { skill_name: skillName, xp: newXp, level: newLevel };
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
export function checkAndGrantAchievements(
  userId: string,
  context: { taskId?: string; dueDateMs?: number | null } = {},
): string[] {
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

  // --- Gather metrics needed for checks (lazy, only what we need) ---

  // Total completed tasks
  const completedCountRow = db.prepare(
    "SELECT COUNT(*) AS cnt FROM tasks WHERE created_by = ? AND status = 'complete'"
  ).get(userId) as { cnt: number };
  const completedCount = completedCountRow.cnt;

  // Total notes
  const noteCountRow = db.prepare(
    'SELECT COUNT(*) AS cnt FROM task_notes WHERE user_id = ?'
  ).get(userId) as { cnt: number };
  const noteCount = noteCountRow.cnt;

  // Tasks completed before due date
  const earlyCountRow = db.prepare(
    "SELECT COUNT(*) AS cnt FROM tasks WHERE created_by = ? AND status = 'complete' AND due_date IS NOT NULL AND updated_at <= due_date"
  ).get(userId) as { cnt: number };
  const earlyCount = earlyCountRow.cnt;

  // Distinct task types used in completed tasks
  const typeCountRow = db.prepare(
    "SELECT COUNT(DISTINCT type_id) AS cnt FROM tasks WHERE created_by = ? AND status = 'complete'"
  ).get(userId) as { cnt: number };
  const typeCount = typeCountRow.cnt;

  // Highest skill level
  const topLevelRow = db.prepare(
    'SELECT MAX(level) AS maxLevel FROM user_skills WHERE user_id = ?'
  ).get(userId) as { maxLevel: number | null };
  const topLevel = topLevelRow.maxLevel ?? 0;

  // --- Define threshold rules ---
  const rules: Array<{ key: string; earned: boolean }> = [
    { key: 'first_task',      earned: completedCount >= 1 },
    { key: 'task_10',         earned: completedCount >= 10 },
    { key: 'task_50',         earned: completedCount >= 50 },
    { key: 'task_100',        earned: completedCount >= 100 },
    { key: 'task_500',        earned: completedCount >= 500 },
    { key: 'detail_oriented', earned: noteCount >= 50 },
    { key: 'early_bird',      earned: earlyCount >= 10 },
    { key: 'type_explorer',   earned: typeCount >= 5 },
    { key: 'skill_level_5',   earned: topLevel >= 5 },
    { key: 'skill_level_10',  earned: topLevel >= 10 },
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
// Profile summary — used by the GET /profile endpoint
// ---------------------------------------------------------------------------

export interface GamificationProfile {
  enabled: boolean;
  title: string | null;
  totalXp: number;
  skills: Array<{ skill_name: string; xp: number; level: number; xpForNextLevel: number }>;
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
    'SELECT gamification_enabled FROM users WHERE id = ?'
  ).get(userId) as { gamification_enabled: number } | undefined;

  const enabled = !!(user?.gamification_enabled);

  const skills = (db.prepare(
    'SELECT skill_name, xp, level FROM user_skills WHERE user_id = ? ORDER BY level DESC, xp DESC'
  ).all(userId) as Array<{ skill_name: string; xp: number; level: number }>).map(s => ({
    ...s,
    xpForNextLevel: xpThresholdForLevel(s.level + 1) - s.xp,
  }));

  const totalXp = skills.reduce((sum, s) => sum + s.xp, 0);

  // All achievements with unlock status for this user.
  // Unlocked achievements first (ordered by unlock time), then locked alphabetically.
  // SQLite orders NULLs last by default when using DESC — no NULLS LAST syntax needed.
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
    skills,
    achievements: achievementRows,
  };
}
