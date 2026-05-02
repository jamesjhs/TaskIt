import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import {
  awardTaskXp,
  checkAndGrantAchievements,
  awardFreezeCredit,
  consumeFreezeCredit,
  computeNewStreakValues,
  awardEventXp,
  LootDropResult,
  formatFriendlyTime,
} from '../services/gamification';

const router = Router();

// Allowed values for validated enum fields
const ALLOWED_STATUSES = new Set(['not_started', 'started', 'complete']);
const ALLOWED_RECUR_UNITS = new Set(['days', 'weeks', 'months', 'years']);

// The system task type that is always sorted to the top of the task list
const URGENT_TASK_TYPE = 'urgent';

// Anti-farming: tasks completed this many ms after creation earn no XP (non-recurring only)
const ANTI_FARM_TIMEGATE_MS = 60 * 1000; // 60 seconds

/** Format a UNIX-millisecond timestamp as a YYYY-MM-DD string for audit notes. */
function formatDueDate(ms: number | null | undefined): string {
  if (ms == null) return '(no date)';
  return new Date(ms).toISOString().split('T')[0];
}

// Returns true when the requesting user may act on a task — either because they
// created it, or because the task belongs to a group the user is a member of.
// Personal (non-group) tasks remain accessible only to their creator.
function hasTaskAccess(task: { created_by: string; group_id: string | null }, userId: string): boolean {
  if (task.created_by === userId) return true;
  if (task.group_id) {
    return !!db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(task.group_id, userId);
  }
  return false;
}

function computeNextDue(dueDateMs: number, interval: number, unit: string): number {
  const d = new Date(dueDateMs);
  switch (unit) {
    case 'days':   d.setDate(d.getDate() + interval); break;
    case 'weeks':  d.setDate(d.getDate() + interval * 7); break;
    case 'months': d.setMonth(d.getMonth() + interval); break;
    case 'years':  d.setFullYear(d.getFullYear() + interval); break;
    default: throw new Error(`Invalid recur_unit: ${unit}`);
  }
  return d.getTime();
}

// Copies all subtasks from one task to another with completion state reset,
// preserving title and sort order. Used when spawning the next recurrence.
function copySubtasksToNewTask(fromTaskId: string, toTaskId: string, now: number): void {
  const subtasks = db.prepare(
    'SELECT title, sort_order FROM task_subtasks WHERE task_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(fromTaskId) as Array<{ title: string; sort_order: number }>;
  const insertSubtask = db.prepare(
    'INSERT INTO task_subtasks (id, task_id, title, completed, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?)'
  );
  for (const s of subtasks) {
    insertSubtask.run(randomUUID(), toTaskId, s.title, s.sort_order, now);
  }
}

router.use(authMiddleware);

router.get('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  // Build filters — all condition strings are hardcoded; only values use parameters
  const { groupId, assignedToMe, status, archived, typeId } = req.query;

  // Validate status against allowed values to reject garbage before hitting the DB
  if (status && !ALLOWED_STATUSES.has(status as string)) {
    res.status(400).json({ error: 'Invalid status value' });
    return;
  }

  const whereConditions: string[] = [];
  const params: (string | number | null)[] = [];

  // Exclude long-term goals and sporadic tasks from the main task list (they have their own dedicated sections)
  whereConditions.push('(t.is_long_term_goal IS NULL OR t.is_long_term_goal = 0)');
  whereConditions.push('(t.is_sporadic IS NULL OR t.is_sporadic = 0)');

  // User must be the creator OR an assignee OR group member
  whereConditions.push(`(
    t.created_by = ?
    OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)
    OR (t.group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = ?
    ))
  )`);
  params.push(userId, userId, userId);

  if (groupId) {
    whereConditions.push('t.group_id = ?');
    params.push(groupId as string);
  }

  if (typeId) {
    whereConditions.push('t.type_id = ?');
    params.push(typeId as string);
  }

  if (assignedToMe === 'true') {
    whereConditions.push(
      'EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)'
    );
    params.push(userId);
  }

  if (status) {
    whereConditions.push('t.status = ?');
    params.push(status as string);
  }

  const archivedVal = archived === 'true' ? 1 : 0;
  whereConditions.push('t.archived = ?');
  params.push(archivedVal);

  // All strings in whereConditions are hardcoded literals with ? placeholders;
  // no user-supplied content is interpolated into the SQL structure.
  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  const tasks = db.prepare(`
    SELECT t.*, tt.name AS type_name,
      u.username AS created_by_username,
      g.name AS group_name,
      (SELECT gm.role FROM group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = ?) AS group_role
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    JOIN users u ON u.id = t.created_by
    LEFT JOIN groups g ON g.id = t.group_id
    ${whereClause}
    ORDER BY CASE WHEN LOWER(tt.name) = '${URGENT_TASK_TYPE}' THEN 0 ELSE 1 END, t.updated_at DESC
  `).all(userId, ...params) as Array<Record<string, unknown>>;

  // Attach assignees
  const taskIds = tasks.map((t) => t.id as string);
  let assigneeMap: Record<string, Array<{ id: string; username: string; email: string }>> = {};

  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => '?').join(',');
    const assignees = db.prepare(`
      SELECT ta.task_id, u.id, u.username, u.email
      FROM task_assignees ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id IN (${placeholders})
    `).all(...taskIds) as Array<{ task_id: string; id: string; username: string; email: string }>;

    for (const a of assignees) {
      if (!assigneeMap[a.task_id]) assigneeMap[a.task_id] = [];
      assigneeMap[a.task_id].push({ id: a.id, username: a.username, email: a.email });
    }
  }

  // Attach subtask summary counts (total / completed) in a single batch query
  type SubtaskSummary = { subtask_total: number; subtask_done: number };
  let subtaskMap: Record<string, SubtaskSummary> = {};
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => '?').join(',');
    const subtaskRows = db.prepare(`
      SELECT task_id,
        COUNT(*) AS subtask_total,
        COALESCE(SUM(completed), 0) AS subtask_done
      FROM task_subtasks
      WHERE task_id IN (${placeholders})
      GROUP BY task_id
    `).all(...taskIds) as Array<{ task_id: string; subtask_total: number; subtask_done: number }>;
    for (const r of subtaskRows) {
      subtaskMap[r.task_id] = { subtask_total: r.subtask_total, subtask_done: r.subtask_done };
    }
  }

  const result = tasks.map((t) => ({
    ...t,
    archived: t.archived === 1,
    assignees: assigneeMap[t.id as string] || [],
    subtask_total: subtaskMap[t.id as string]?.subtask_total ?? 0,
    subtask_done: subtaskMap[t.id as string]?.subtask_done ?? 0,
  }));

  res.json(result);
});

router.post('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { title, details, typeId, groupId, assigneeIds, dueDate, recurInterval, recurUnit,
          notifyEmail, notify7day, notify1day, notifyOnday,
          notifyPopup7day, notifyPopup1day, notifyPopupOnday,
          xpMultiplier } = req.body;

  if (!title || !typeId) {
    res.status(400).json({ error: 'title and typeId are required' });
    return;
  }

  if (typeof title !== 'string' || title.trim().length === 0 || title.length > 255) {
    res.status(400).json({ error: 'title must be between 1 and 255 characters' });
    return;
  }

  if (details !== undefined && details !== null && (typeof details !== 'string' || details.length > 10000)) {
    res.status(400).json({ error: 'details must not exceed 10000 characters' });
    return;
  }

  if (Array.isArray(assigneeIds) && assigneeIds.length > 100) {
    res.status(400).json({ error: 'assigneeIds must not contain more than 100 entries' });
    return;
  }

  if ((recurInterval !== undefined && recurInterval !== null) || (recurUnit !== undefined && recurUnit !== null)) {
    const interval = recurInterval != null ? parseInt(String(recurInterval), 10) : NaN;
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
      res.status(400).json({ error: 'recurInterval must be an integer between 1 and 365' });
      return;
    }
    if (!recurUnit || !ALLOWED_RECUR_UNITS.has(recurUnit)) {
      res.status(400).json({ error: 'recurUnit must be one of: days, weeks, months, years' });
      return;
    }
  }

  // Verify type exists
  const typeExists = db.prepare('SELECT 1 FROM task_types WHERE id = ?').get(typeId);
  if (!typeExists) {
    res.status(400).json({ error: 'Invalid typeId' });
    return;
  }

  // If groupId provided, verify membership
  let groupGamificationEnhanced = false;
  if (groupId) {
    const member = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, userId);
    if (!member) {
      res.status(403).json({ error: 'Not a member of the specified group' });
      return;
    }
    const grp = db.prepare(
      'SELECT gamification_enhanced FROM groups WHERE id = ?'
    ).get(groupId) as { gamification_enhanced: number } | undefined;
    groupGamificationEnhanced = !!(grp?.gamification_enhanced);
  }

  // Validate and resolve the XP multiplier
  let resolvedMultiplier = 1.0;
  if (xpMultiplier !== undefined && xpMultiplier !== null) {
    if (!groupGamificationEnhanced) {
      res.status(400).json({ error: 'xpMultiplier can only be set for tasks in a group with gamification enhancements enabled' });
      return;
    }
    const parsed = parseFloat(String(xpMultiplier));
    if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 10) {
      res.status(400).json({ error: 'xpMultiplier must be a number between 0.1 and 10' });
      return;
    }
    resolvedMultiplier = parsed;
  }

  // Get user's default notification preferences
  const userNotifPrefs = db.prepare('SELECT notification_preferences FROM users WHERE id = ?').get(userId) as
    | { notification_preferences: string }
    | undefined;
  let defaultPrefs = {
    email: { notify_7day: false, notify_1day: true, notify_onday: false },
    popup: { notify_7day: false, notify_1day: false, notify_onday: false },
  };
  if (userNotifPrefs) {
    try {
      defaultPrefs = JSON.parse(userNotifPrefs.notification_preferences);
    } catch (e) {
      console.error('[tasks/create] Failed to parse notification_preferences:', e);
    }
  }

  // Use provided values or fall back to user's defaults
  const finalNotifyEmail = notifyEmail !== undefined && notifyEmail !== null ? (notifyEmail === false || notifyEmail === 0 ? 0 : 1) : 1;
  const finalNotify7day = notify7day !== undefined && notify7day !== null ? (notify7day === false || notify7day === 0 ? 0 : 1) : (defaultPrefs.email.notify_7day ? 1 : 0);
  const finalNotify1day = notify1day !== undefined && notify1day !== null ? (notify1day === false || notify1day === 0 ? 0 : 1) : (defaultPrefs.email.notify_1day ? 1 : 0);
  const finalNotifyOnday = notifyOnday !== undefined && notifyOnday !== null ? (notifyOnday === false || notifyOnday === 0 ? 0 : 1) : (defaultPrefs.email.notify_onday ? 1 : 0);
  const finalNotifyPopup7day = notifyPopup7day !== undefined && notifyPopup7day !== null ? (notifyPopup7day === false || notifyPopup7day === 0 ? 0 : 1) : (defaultPrefs.popup.notify_7day ? 1 : 0);
  const finalNotifyPopup1day = notifyPopup1day !== undefined && notifyPopup1day !== null ? (notifyPopup1day === false || notifyPopup1day === 0 ? 0 : 1) : (defaultPrefs.popup.notify_1day ? 1 : 0);
  const finalNotifyPopupOnday = notifyPopupOnday !== undefined && notifyPopupOnday !== null ? (notifyPopupOnday === false || notifyPopupOnday === 0 ? 0 : 1) : (defaultPrefs.popup.notify_onday ? 1 : 0);

  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO tasks (id, title, details, type_id, status, created_by, group_id, archived, created_at, updated_at, due_date, original_due_date, recur_interval, recur_unit, notify_email, notify_7day, notify_1day, notify_onday, notify_popup_7day, notify_popup_1day, notify_popup_onday, xp_multiplier)
    VALUES (?, ?, ?, ?, 'not_started', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, details || null, typeId, userId, groupId || null, now, now, dueDate || null,
    dueDate || null,
    recurInterval ? parseInt(String(recurInterval), 10) : null,
    recurUnit || null,
    finalNotifyEmail,
    finalNotify7day,
    finalNotify1day,
    finalNotifyOnday,
    finalNotifyPopup7day,
    finalNotifyPopup1day,
    finalNotifyPopupOnday,
    resolvedMultiplier);

  // Award create_task XP (non-critical)
  try {
    awardEventXp(userId, 'create_task');
  } catch (xpErr) {
    console.error('[tasks/create] Failed to award create_task XP:', xpErr);
  }

  // Insert assignees — validate each ID refers to a real user before inserting
  // to avoid a FK constraint exception (and a 500 response) on bad input.
  // Batch-validate all IDs in a single query to avoid N+1 round trips.
  const ids: string[] = (Array.isArray(assigneeIds) ? assigneeIds : []).filter(
    (id): id is string => typeof id === 'string'
  );
  const validAssigneeIds: Set<string> = new Set();
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const validRows = db.prepare(
      `SELECT id FROM users WHERE id IN (${placeholders})`
    ).all(...ids) as Array<{ id: string }>;
    for (const r of validRows) validAssigneeIds.add(r.id);
  }

  const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
  const insertAlert = db.prepare('INSERT INTO user_alerts (id, user_id, message, created_at) VALUES (?, ?, ?, ?)');

  for (const aId of validAssigneeIds) {
    insertAssignee.run(id, aId);
    // Don't notify the creator
    if (aId !== userId) {
      insertAlert.run(randomUUID(), aId, `You were assigned to task: ${title}`, now);
    }
  }

  const task = db.prepare(`
    SELECT t.*, tt.name AS type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    WHERE t.id = ?
  `).get(id) as Record<string, unknown>;

  const assignees = db.prepare(`
    SELECT u.id, u.username, u.email
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ?
  `).all(id);

  res.status(201).json({ ...task, archived: task.archived === 1, assignees });
});

// GET /api/tasks/sporadic — Fetch all sporadic tasks for user
router.get('/sporadic', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  const tasks = db.prepare(`
    SELECT t.*, tt.name AS type_name,
      u.username AS created_by_username,
      g.name AS group_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    JOIN users u ON u.id = t.created_by
    LEFT JOIN groups g ON g.id = t.group_id
    WHERE t.is_sporadic = 1 AND t.archived = 0
      AND (
        t.created_by = ?
        OR (t.group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = ?
        ))
      )
    ORDER BY t.last_completed_at ASC NULLS FIRST, t.created_at ASC
  `).all(userId, userId) as Array<Record<string, unknown>>;

  // Add friendly timestamp for last_completed_at
  const result = tasks.map((t) => {
    let lastCompletedFriendly = 'Never';
    let lastCompletedLabel = 'Never done';
    if (t.last_completed_at && typeof t.last_completed_at === 'number') {
      const now = Date.now();
      const ago = now - t.last_completed_at;
      const friendlyTime = formatFriendlyTime(ago);
      const dateStr = new Date(t.last_completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      lastCompletedFriendly = (friendlyTime === 'just now' ? 'just now' : friendlyTime + ' ago') + ` (${dateStr})`;
      lastCompletedLabel = ago > 90 * 24 * 60 * 60 * 1000 ? 'Overdue (90+ days)' : 'Last done: ' + lastCompletedFriendly;
    }
    return {
      ...t,
      archived: t.archived === 1,
      is_sporadic: t.is_sporadic === 1,
      last_completed_friendly: lastCompletedFriendly,
      last_completed_label: lastCompletedLabel,
    };
  });

  res.json(result);
});

// POST /api/tasks/create-sporadic — Create a new sporadic task
router.post('/create-sporadic', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { title, description, groupId, taskTypeId } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 255) {
    res.status(400).json({ error: 'title must be between 1 and 255 characters' });
    return;
  }

  if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > 10000)) {
    res.status(400).json({ error: 'description must not exceed 10000 characters' });
    return;
  }

  // Determine type_id: use provided taskTypeId or find a default task type
  let typeId = taskTypeId;
  if (!typeId) {
    const defaultType = db.prepare('SELECT id FROM task_types LIMIT 1').get() as { id: string } | undefined;
    if (!defaultType) {
      res.status(400).json({ error: 'No task types available' });
      return;
    }
    typeId = defaultType.id;
  } else {
    // Verify type exists
    const typeExists = db.prepare('SELECT 1 FROM task_types WHERE id = ?').get(typeId);
    if (!typeExists) {
      res.status(400).json({ error: 'Invalid taskTypeId' });
      return;
    }
  }

  // If groupId provided, verify membership
  if (groupId) {
    const member = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, userId);
    if (!member) {
      res.status(403).json({ error: 'Not a member of the specified group' });
      return;
    }
  }

  const taskId = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO tasks (
      id, title, details, type_id, status, created_by, group_id, archived,
      created_at, updated_at, is_sporadic
    ) VALUES (?, ?, ?, ?, 'not_started', ?, ?, 0, ?, ?, 1)
  `).run(taskId, title.trim(), description || null, typeId, userId, groupId || null, now, now);

  res.status(201).json({ success: true, taskId });
});

// PUT /api/tasks/:id/complete-sporadic — Mark a sporadic task complete
router.put('/:id/complete-sporadic', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | {
        id: string;
        is_sporadic: number;
        created_by: string;
        group_id: string | null;
        type_id: string;
        xp_multiplier: number;
      }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (task.is_sporadic !== 1) {
    res.status(400).json({ error: 'Task is not sporadic' });
    return;
  }

  // Allow creator or group member only
  if (!hasTaskAccess(task, userId)) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const now = Date.now();

  // Reset status to 'not_started' and update last_completed_at
  const updateTx = db.transaction(() => {
    db.prepare(
      'UPDATE tasks SET status = ?, last_completed_at = ?, updated_at = ?, completed_at = ?, completed_by = ? WHERE id = ?'
    ).run('not_started', now, now, now, userId, taskId);

    // Log to task_history
    db.prepare(
      'INSERT INTO task_history (id, task_id, user_id, action, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), taskId, userId, 'completed_sporadic', now);
  });

  updateTx();

  // Award XP and check achievements (same as regular task completion)
  let lootDrop: LootDropResult | null = null;
  try {
    const xpResult = awardTaskXp(userId, task.type_id, task.xp_multiplier ?? 1.0);
    if (xpResult) lootDrop = xpResult.drop;
    awardFreezeCredit(userId);
    checkAndGrantAchievements(userId);
  } catch (gamErr) {
    console.error('[gamification] Error processing sporadic task completion:', gamErr);
  }

  const updated = db.prepare(`
    SELECT t.*, tt.name AS type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    WHERE t.id = ?
  `).get(taskId) as Record<string, unknown>;

  const response: Record<string, unknown> = { ...updated, archived: updated.archived === 1, is_sporadic: updated.is_sporadic === 1 };
  if (lootDrop) response.drop = lootDrop;
  res.json(response);
});

// PATCH /api/tasks/:id/sporadic-last-done — Update last_completed_at for a sporadic task
router.patch('/:id/sporadic-last-done', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;
  const { lastCompletedAt } = req.body;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | {
        id: string;
        is_sporadic: number;
        created_by: string;
        group_id: string | null;
      }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (task.is_sporadic !== 1) {
    res.status(400).json({ error: 'Task is not sporadic' });
    return;
  }

  // Allow creator or group member only
  if (!hasTaskAccess(task, userId)) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  // Validate lastCompletedAt is a number (milliseconds since epoch)
  if (typeof lastCompletedAt !== 'number' || lastCompletedAt < 0) {
    res.status(400).json({ error: 'lastCompletedAt must be a non-negative number (milliseconds)' });
    return;
  }

  const now = Date.now();

  // Update the last_completed_at timestamp
  db.prepare(
    'UPDATE tasks SET last_completed_at = ?, updated_at = ? WHERE id = ?'
  ).run(lastCompletedAt, now, taskId);

  const updated = db.prepare(`
    SELECT t.*, tt.name AS type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    WHERE t.id = ?
  `).get(taskId) as Record<string, unknown>;

  const response: Record<string, unknown> = { ...updated, archived: updated.archived === 1, is_sporadic: updated.is_sporadic === 1 };
  res.json(response);
});

// GET /api/tasks/long-term-goals — Fetch all long-term goals for user
router.get('/long-term-goals', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  const goals = db.prepare(`
    SELECT t.*, tt.name AS type_name,
      u.username AS created_by_username,
      g.name AS group_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    JOIN users u ON u.id = t.created_by
    LEFT JOIN groups g ON g.id = t.group_id
    WHERE t.is_long_term_goal = 1 AND t.archived = 0
      AND (
        t.created_by = ?
        OR (t.group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = ?
        ))
      )
    ORDER BY t.created_at ASC
  `).all(userId, userId) as Array<Record<string, unknown>>;

  // Fetch assignees for all goals in a single query
  const goalIds = goals.map((g) => g.id as string);
  const assigneesByGoal: Record<string, Array<{ id: string; username: string; email: string }>> = {};
  if (goalIds.length > 0) {
    const placeholders = goalIds.map(() => '?').join(',');
    const assigneeRows = db.prepare(`
      SELECT ta.task_id, u2.id, u2.username, u2.email
      FROM task_assignees ta
      JOIN users u2 ON u2.id = ta.user_id
      WHERE ta.task_id IN (${placeholders})
    `).all(...goalIds) as Array<{ task_id: string; id: string; username: string; email: string }>;
    for (const row of assigneeRows) {
      if (!assigneesByGoal[row.task_id]) assigneesByGoal[row.task_id] = [];
      assigneesByGoal[row.task_id].push({ id: row.id, username: row.username, email: row.email });
    }
  }

  const result = goals.map((g) => ({
    ...g,
    archived: g.archived === 1,
    is_long_term_goal: g.is_long_term_goal === 1,
    assignees: assigneesByGoal[g.id as string] || [],
  }));

  res.json(result);
});

// POST /api/tasks/create-long-term-goal — Create a new long-term goal
router.post('/create-long-term-goal', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { title, description, groupId, taskTypeId, xpMultiplier } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 255) {
    res.status(400).json({ error: 'title must be between 1 and 255 characters' });
    return;
  }

  if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > 10000)) {
    res.status(400).json({ error: 'description must not exceed 10000 characters' });
    return;
  }

  // Determine type_id: use provided taskTypeId or require caller to provide one
  let typeId = taskTypeId;
  if (!typeId) {
    // Fall back to the 'Personal' type, or any type if Personal doesn't exist
    const personalType = db.prepare("SELECT id FROM task_types WHERE LOWER(name) = 'personal' LIMIT 1").get() as { id: string } | undefined;
    const fallbackType = personalType || (db.prepare('SELECT id FROM task_types ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined);
    if (!fallbackType) {
      res.status(400).json({ error: 'No task types available' });
      return;
    }
    typeId = fallbackType.id;
  } else {
    const typeExists = db.prepare('SELECT 1 FROM task_types WHERE id = ?').get(typeId);
    if (!typeExists) {
      res.status(400).json({ error: 'Invalid taskTypeId' });
      return;
    }
  }

  // If groupId provided, verify membership
  if (groupId) {
    const member = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, userId);
    if (!member) {
      res.status(403).json({ error: 'Not a member of the specified group' });
      return;
    }
  }

  // Validate xpMultiplier if provided
  let resolvedMultiplier = 1.0;
  if (xpMultiplier !== undefined && xpMultiplier !== null) {
    if (groupId) {
      const grpRow = db.prepare('SELECT gamification_enhanced FROM groups WHERE id = ?').get(groupId) as
        | { gamification_enhanced: number }
        | undefined;
      if (!grpRow?.gamification_enhanced) {
        res.status(400).json({ error: 'xpMultiplier can only be set for goals in a group with gamification enhancements enabled' });
        return;
      }
    }
    const parsed = parseFloat(String(xpMultiplier));
    if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 10) {
      res.status(400).json({ error: 'xpMultiplier must be a number between 0.1 and 10' });
      return;
    }
    resolvedMultiplier = parsed;
  }

  const goalId = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO tasks (
      id, title, details, type_id, status, created_by, group_id, archived,
      created_at, updated_at, is_long_term_goal, xp_multiplier
    ) VALUES (?, ?, ?, ?, 'not_started', ?, ?, 0, ?, ?, 1, ?)
  `).run(goalId, title.trim(), description || null, typeId, userId, groupId || null, now, now, resolvedMultiplier);

  res.status(201).json({ success: true, goalId });
});

router.patch('/:id', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null; archived: number; due_date: number | null }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Creator always has access; group members have full write access to group tasks
  if (!hasTaskAccess(task, userId)) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const { title, details, typeId, status, assigneeIds, dueDate, recurInterval, recurUnit,
          notifyEmail, notify7day, notify1day, notifyOnday,
          notifyPopup7day, notifyPopup1day, notifyPopupOnday,
          xpMultiplier, isLongTermGoal, groupId, lastCompletedAt } = req.body;

  // Validate status if provided
  if (status !== undefined && !ALLOWED_STATUSES.has(status as string)) {
    res.status(400).json({ error: 'Invalid status value' });
    return;
  }

  // Validate groupId if provided
  if (groupId !== undefined && groupId !== null) {
    if (typeof groupId !== 'string') {
      res.status(400).json({ error: 'groupId must be a string' });
      return;
    }
    // Verify membership
    const membership = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, userId);
    if (!membership) {
      res.status(403).json({ error: 'Not a member of the specified group' });
      return;
    }
  }

  // Validate lastCompletedAt if provided
  if (lastCompletedAt !== undefined && lastCompletedAt !== null) {
    if (typeof lastCompletedAt !== 'number' || lastCompletedAt < 0) {
      res.status(400).json({ error: 'lastCompletedAt must be a non-negative number (milliseconds)' });
      return;
    }
  }

  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0 || title.length > 255)) {
    res.status(400).json({ error: 'title must be between 1 and 255 characters' });
    return;
  }

  if (details !== undefined && details !== null && (typeof details !== 'string' || details.length > 10000)) {
    res.status(400).json({ error: 'details must not exceed 10000 characters' });
    return;
  }

  if (Array.isArray(assigneeIds) && assigneeIds.length > 100) {
    res.status(400).json({ error: 'assigneeIds must not contain more than 100 entries' });
    return;
  }

  // Validate recurrence if provided
  if (recurInterval !== undefined || recurUnit !== undefined) {
    if (recurInterval !== null && recurUnit !== null) {
      const interval = recurInterval != null ? parseInt(String(recurInterval), 10) : NaN;
      if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
        res.status(400).json({ error: 'recurInterval must be an integer between 1 and 365' });
        return;
      }
      if (!recurUnit || !ALLOWED_RECUR_UNITS.has(recurUnit)) {
        res.status(400).json({ error: 'recurUnit must be one of: days, weeks, months, years' });
        return;
      }
    }
  }

  // Validate xpMultiplier if provided, resolving the value for later use in the SET clause
  let resolvedPatchMultiplier: number | undefined;
  if (xpMultiplier !== undefined && xpMultiplier !== null) {
    const taskGroup = db.prepare(`
      SELECT t.group_id, g.gamification_enhanced
      FROM tasks t
      LEFT JOIN groups g ON g.id = t.group_id
      WHERE t.id = ?
    `).get(taskId) as { group_id: string | null; gamification_enhanced: number | null } | undefined;
    const grpGamEnabled = !!(taskGroup?.group_id && taskGroup?.gamification_enhanced);
    if (!grpGamEnabled) {
      res.status(400).json({ error: 'xpMultiplier can only be set for tasks in a group with gamification enhancements enabled' });
      return;
    }
    const parsed = parseFloat(String(xpMultiplier));
    if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 10) {
      res.status(400).json({ error: 'xpMultiplier must be a number between 0.1 and 10' });
      return;
    }
    resolvedPatchMultiplier = parsed;
  }

  const now = Date.now();

  // All SET clause fragments are hardcoded string literals — no user input is
  // interpolated into the SQL structure; only values use ? placeholders.
  const setClauses: string[] = [];
  const vals: (string | number | null)[] = [];

  if (title !== undefined) { setClauses.push('title = ?'); vals.push(title); }
  if (details !== undefined) { setClauses.push('details = ?'); vals.push(details); }
  if (typeId !== undefined) { setClauses.push('type_id = ?'); vals.push(typeId); }
  if (status !== undefined) {
    setClauses.push('status = ?');
    vals.push(status);
    // Keep completed_at/completed_by in sync when status is changed via the general PATCH
    if (status === 'complete') {
      setClauses.push('completed_at = ?'); vals.push(now);
      setClauses.push('completed_by = ?'); vals.push(userId);
    } else {
      setClauses.push('completed_at = ?'); vals.push(null);
      setClauses.push('completed_by = ?'); vals.push(null);
    }
  }
  if (dueDate !== undefined) { setClauses.push('due_date = ?'); vals.push(dueDate || null); }
  if (recurInterval !== undefined) { setClauses.push('recur_interval = ?'); vals.push(recurInterval ? parseInt(String(recurInterval), 10) : null); }
  if (recurUnit !== undefined) { setClauses.push('recur_unit = ?'); vals.push(recurUnit || null); }
  if (resolvedPatchMultiplier !== undefined) {
    setClauses.push('xp_multiplier = ?'); vals.push(resolvedPatchMultiplier);
  }
  if (notifyEmail !== undefined) { setClauses.push('notify_email = ?'); vals.push(notifyEmail === false || notifyEmail === 0 ? 0 : 1); }
  if (notify7day !== undefined) { setClauses.push('notify_7day = ?'); vals.push(notify7day === false || notify7day === 0 ? 0 : 1); }
  if (notify1day !== undefined) { setClauses.push('notify_1day = ?'); vals.push(notify1day === false || notify1day === 0 ? 0 : 1); }
  if (notifyOnday !== undefined) { setClauses.push('notify_onday = ?'); vals.push(notifyOnday === false || notifyOnday === 0 ? 0 : 1); }
  if (notifyPopup7day !== undefined) { setClauses.push('notify_popup_7day = ?'); vals.push(notifyPopup7day === false || notifyPopup7day === 0 ? 0 : 1); }
  if (notifyPopup1day !== undefined) { setClauses.push('notify_popup_1day = ?'); vals.push(notifyPopup1day === false || notifyPopup1day === 0 ? 0 : 1); }
  if (notifyPopupOnday !== undefined) { setClauses.push('notify_popup_onday = ?'); vals.push(notifyPopupOnday === false || notifyPopupOnday === 0 ? 0 : 1); }
   if (isLongTermGoal !== undefined) { setClauses.push('is_long_term_goal = ?'); vals.push(isLongTermGoal ? 1 : 0); }
  if (groupId !== undefined) { setClauses.push('group_id = ?'); vals.push(groupId || null); }
  if (lastCompletedAt !== undefined) { setClauses.push('last_completed_at = ?'); vals.push(lastCompletedAt || null); }
  setClauses.push('updated_at = ?');
  vals.push(now);
  vals.push(taskId);

  if (setClauses.length > 0) {
    const patchTx = db.transaction(() => {
      db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...vals);

      // Audit trail: insert a system note if the due_date has actually changed.
      // Normalise dueDate to number|null (same type SQLite returns) so a string
      // "123" from req.body doesn't falsely differ from the stored numeric 123.
      if (dueDate !== undefined) {
        const newDueDateNorm: number | null = dueDate ? Number(dueDate) : null;
        if (newDueDateNorm !== task.due_date) {
          db.prepare(
            'INSERT INTO task_notes (id, task_id, user_id, note, created_at) VALUES (?, ?, ?, ?, ?)'
          ).run(
            randomUUID(), taskId, userId,
            `System: Deadline deferred from ${formatDueDate(task.due_date)} to ${formatDueDate(newDueDateNorm)}`,
            now
          );
        }
      }
    });
    patchTx();
  }

  if (Array.isArray(assigneeIds)) {
    db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
    // Batch-validate all assignee IDs in a single query
    const validIds = (assigneeIds as unknown[]).filter((id): id is string => typeof id === 'string');
    if (validIds.length > 0) {
      const placeholders = validIds.map(() => '?').join(',');
      const validRows = db.prepare(
        `SELECT id FROM users WHERE id IN (${placeholders})`
      ).all(...validIds) as Array<{ id: string }>;
      const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
      for (const row of validRows) {
        insertAssignee.run(taskId, row.id);
      }
    }
  }

  const updated = db.prepare(`
    SELECT t.*, tt.name AS type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    WHERE t.id = ?
  `).get(taskId) as Record<string, unknown>;

  const assignees = db.prepare(`
    SELECT u.id, u.username, u.email
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ?
  `).all(taskId);

  res.json({ ...updated, archived: updated.archived === 1, assignees });
});

router.patch('/:id/status', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;
  const { status } = req.body;

  if (!status || !ALLOWED_STATUSES.has(status)) {
    res.status(400).json({ error: 'status must be one of: not_started, started, complete' });
    return;
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null; created_at: number; xp_claimed: number; recur_interval: number | null }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Allow creator, assignee, or any group member to update status
  const isAssignee = !!db.prepare(
    'SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?'
  ).get(taskId, userId);

  if (!hasTaskAccess(task, userId) && !isAssignee) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const now = Date.now();

  // Anti-farming: tasks completed within ANTI_FARM_TIMEGATE_MS of creation (non-recurring only) earn no XP/Loot.
  const isTimegated = status === 'complete' && (now - task.created_at < ANTI_FARM_TIMEGATE_MS) && task.recur_interval === null;
  // xp_claimed is a one-time flag — once XP has been awarded for this task it must not be re-awarded.
  const shouldAwardXp = status === 'complete' && !isTimegated && task.xp_claimed === 0;

  // Update status, always stamp updated_at.
  // When completing: record who completed it and when (for accurate achievement logic).
  // When completing with a fresh XP claim: atomically set xp_claimed = 1.
  // When reverting from complete: clear those fields.
  if (status === 'complete') {
    const xpClaimedClause = shouldAwardXp ? ', xp_claimed = 1' : '';
    db.prepare(
      `UPDATE tasks SET status = ?, updated_at = ?, completed_at = ?, completed_by = ?${xpClaimedClause} WHERE id = ?`
    ).run(status, now, now, userId, taskId);
  } else {
    db.prepare(
      'UPDATE tasks SET status = ?, updated_at = ?, completed_at = NULL, completed_by = NULL WHERE id = ?'
    ).run(status, now, taskId);
  }

  // Track whether a freeze was consumed (needed for the gamification block below)
  let freezeConsumed = false;
  // Loot drop result from this task completion (null when XP is not awarded)
  let lootDrop: LootDropResult | null = null;

  // If task is completed and has recurrence, spawn the next occurrence and archive the parent
  if (status === 'complete') {
    const fullTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string; title: string; details: string | null; type_id: string; created_by: string;
      group_id: string | null; due_date: number | null; recur_interval: number | null; recur_unit: string | null;
      notify_email: number; notify_7day: number; notify_1day: number; notify_onday: number;
      notify_popup_7day: number; notify_popup_1day: number; notify_popup_onday: number;
      streak_current: number; streak_longest: number; streak_frozen: number;
      xp_multiplier: number;
    } | undefined;

    if (fullTask && fullTask.recur_interval && fullTask.recur_unit) {
      // Compute streak values for the new occurrence (pure, no DB calls)
      const streakResult = computeNewStreakValues(
        fullTask.streak_current ?? 0,
        fullTask.streak_longest ?? 0,
        !!(fullTask.streak_frozen),
        now,
        fullTask.due_date,
      );
      freezeConsumed = streakResult.freezeConsumed;

      // Use the existing due date as base, or fall back to now when no due date was set
      const baseDue = fullTask.due_date != null ? fullTask.due_date : now;
      const nextDue = computeNextDue(baseDue, fullTask.recur_interval, fullTask.recur_unit);
      const newId = randomUUID();

      const spawnAndArchive = db.transaction(() => {
        db.prepare(`
          INSERT INTO tasks (id, title, details, type_id, status, created_by, group_id, archived, created_at, updated_at, due_date, original_due_date, recur_interval, recur_unit, notify_email, notify_7day, notify_1day, notify_onday, notify_popup_7day, notify_popup_1day, notify_popup_onday, streak_current, streak_longest, streak_frozen, xp_multiplier)
          VALUES (?, ?, ?, ?, 'not_started', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).run(newId, fullTask.title, fullTask.details, fullTask.type_id, fullTask.created_by,
          fullTask.group_id, now, now, nextDue, nextDue, fullTask.recur_interval, fullTask.recur_unit,
          fullTask.notify_email, fullTask.notify_7day, fullTask.notify_1day, fullTask.notify_onday,
          fullTask.notify_popup_7day, fullTask.notify_popup_1day, fullTask.notify_popup_onday,
          streakResult.newStreak, streakResult.newLongest,
          fullTask.xp_multiplier ?? 1.0);

        const assignees = db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ?').all(taskId) as Array<{ user_id: string }>;
        const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
        for (const a of assignees) {
          insertAssignee.run(newId, a.user_id);
        }

        // Copy subtasks to the new occurrence with completion state reset so the
        // user can complete them fresh in the next recurrence.
        copySubtasksToNewTask(taskId, newId, now);

        // Archive the completed parent so only the fresh occurrence appears in the active list
        db.prepare('UPDATE tasks SET archived = 1, updated_at = ? WHERE id = ?').run(now, taskId);
      });

      spawnAndArchive();
    }

    // Award XP, freeze credits, check achievements for the completing user.
    // XP/Loot are skipped when the task is timegated (too new, non-recurring) or
    // when XP has already been claimed for this task (xp_claimed = 1).
    // Consuming a freeze credit is independent of XP: a freeze is logically spent
    // as soon as it protects a streak, regardless of whether XP is awarded.
    // Errors here must never break the status update response.
    try {
      const completedTask = db.prepare(
        'SELECT type_id, xp_multiplier FROM tasks WHERE id = ?'
      ).get(taskId) as { type_id: string; xp_multiplier: number } | undefined;

      if (completedTask) {
        if (shouldAwardXp) {
          const xpResult = awardTaskXp(userId, completedTask.type_id, completedTask.xp_multiplier ?? 1.0);
          if (xpResult) lootDrop = xpResult.drop;
          awardFreezeCredit(userId);
        }
        // Deduct the freeze credit whenever a freeze was used, even if XP was not
        // awarded (timegate / already claimed). The freeze protected the streak and
        // must always be consumed to keep the balance consistent.
        if (freezeConsumed) {
          consumeFreezeCredit(userId);
        }
        checkAndGrantAchievements(userId);
      }
    } catch (gamErr) {
      console.error('[gamification] Error processing task completion:', gamErr);
    }
  }

  const updated = db.prepare(`
    SELECT t.*, tt.name AS type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    WHERE t.id = ?
  `).get(taskId) as Record<string, unknown>;

  const statusResponsePayload: Record<string, unknown> = { ...updated, archived: updated.archived === 1 };
  if (lootDrop) statusResponsePayload.drop = lootDrop;
  res.json(statusResponsePayload);
});

router.patch('/:id/defer', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null; due_date: number | null }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Allow creator or any group member to defer
  const isCreator = task.created_by === userId;
  const isGroupMember = task.group_id ? !!db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(task.group_id, userId) : false;

  if (!isCreator && !isGroupMember) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const { dueDate } = req.body;
  const oldDueDate = task.due_date;
  // Normalise to number|null so the strict equality comparison is reliable
  // regardless of whether the client sent a number or a numeric string.
  const newDueDate: number | null = dueDate !== undefined ? (dueDate ? Number(dueDate) : null) : null;
  const deferNow = Date.now();

  const deferTx = db.transaction(() => {
    db.prepare('UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?').run(
      newDueDate, deferNow, taskId
    );

    // Audit trail: insert a system note if the due_date has actually changed
    if (newDueDate !== oldDueDate) {
      db.prepare(
        'INSERT INTO task_notes (id, task_id, user_id, note, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        randomUUID(), taskId, userId,
        `System: Deadline deferred from ${formatDueDate(oldDueDate)} to ${formatDueDate(newDueDate)}`,
        deferNow
      );
    }
  });
  deferTx();

  const updated = db.prepare(`
    SELECT t.*, tt.name AS type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    WHERE t.id = ?
  `).get(taskId) as Record<string, unknown>;

  const assignees = db.prepare(`
    SELECT u.id, u.username, u.email
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ?
  `).all(taskId);

  res.json({ ...updated, archived: updated.archived === 1, assignees });
});

// PATCH /api/tasks/:id/fast-forward
// Advances the due_date of a recurring task by one interval so the task stays
// in the active list (without being marked complete). Reminders are reset so
// they fire against the new date.
router.patch('/:id/fast-forward', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null;
        due_date: number | null; recur_interval: number | null; recur_unit: string | null }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (!hasTaskAccess(task, userId)) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  if (!task.recur_interval || !task.recur_unit) {
    res.status(400).json({ error: 'Task is not recurring' });
    return;
  }

  if (!task.due_date) {
    res.status(400).json({ error: 'Task has no due date to advance' });
    return;
  }

  const nextDue = computeNextDue(task.due_date, task.recur_interval, task.recur_unit);

  // Update the due date and bump updated_at
  db.prepare('UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?').run(
    nextDue, Date.now(), taskId
  );

  // Clear sent-reminders so the scheduler will re-evaluate against the new date
  db.prepare('DELETE FROM task_reminders_sent WHERE task_id = ?').run(taskId);

  const updated = db.prepare(`
    SELECT t.*, tt.name AS type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    WHERE t.id = ?
  `).get(taskId) as Record<string, unknown>;

  const assignees = db.prepare(`
    SELECT u.id, u.username, u.email
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ?
  `).all(taskId);

  res.json({ ...updated, archived: updated.archived === 1, assignees });
});

router.patch('/:id/archive', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null; archived: number;
        title: string; details: string | null; type_id: string; due_date: number | null;
        recur_interval: number | null; recur_unit: string | null;
        notify_email: number; notify_7day: number; notify_1day: number; notify_onday: number;
        notify_popup_7day: number; notify_popup_1day: number; notify_popup_onday: number; }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (!hasTaskAccess(task, userId)) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const now = Date.now();
  const newArchived = task.archived === 0 ? 1 : 0;

  // If archiving a recurring task, spawn the next occurrence before archiving
  if (newArchived === 1 && task.recur_interval && task.recur_unit) {
    const baseDue = task.due_date != null ? task.due_date : now;
    const nextDue = computeNextDue(baseDue, task.recur_interval, task.recur_unit);
    const newId = randomUUID();

    const spawnAndArchive = db.transaction(() => {
      db.prepare(`
        INSERT INTO tasks (id, title, details, type_id, status, created_by, group_id, archived, created_at, updated_at, due_date, original_due_date, recur_interval, recur_unit, notify_email, notify_7day, notify_1day, notify_onday, notify_popup_7day, notify_popup_1day, notify_popup_onday)
        VALUES (?, ?, ?, ?, 'not_started', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, task.title, task.details, task.type_id, task.created_by,
        task.group_id, now, now, nextDue, nextDue, task.recur_interval, task.recur_unit,
        task.notify_email, task.notify_7day, task.notify_1day, task.notify_onday,
        task.notify_popup_7day, task.notify_popup_1day, task.notify_popup_onday);

      const assignees = db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ?').all(taskId) as Array<{ user_id: string }>;
      const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
      for (const a of assignees) {
        insertAssignee.run(newId, a.user_id);
      }

      copySubtasksToNewTask(taskId, newId, now);

      db.prepare('UPDATE tasks SET archived = ?, updated_at = ? WHERE id = ?').run(
        newArchived, now, taskId
      );
    });

    spawnAndArchive();
  } else {
    // Non-recurring or unarchiving: just update the archived flag
    db.prepare('UPDATE tasks SET archived = ?, updated_at = ? WHERE id = ?').run(
      newArchived, now, taskId
    );
  }

  const updated = db.prepare(`
    SELECT t.*, tt.name AS type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    WHERE t.id = ?
  `).get(taskId) as Record<string, unknown>;

  res.json({ ...updated, archived: updated.archived === 1 });
});

router.delete('/:id', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null;
        title: string; details: string | null; type_id: string;
        due_date: number | null; recur_interval: number | null; recur_unit: string | null;
        notify_email: number; notify_7day: number; notify_1day: number; notify_onday: number;
        notify_popup_7day: number; notify_popup_1day: number; notify_popup_onday: number; }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Only the task creator or a group admin may delete a task.
  // Regular group members can edit/archive but not delete.
  const isCreator = task.created_by === userId;
  const isGroupAdmin = task.group_id
    ? !!(db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = ?')
           .get(task.group_id, userId, 'admin'))
    : false;

  if (!isCreator && !isGroupAdmin) {
    res.status(403).json({ error: 'Only the task creator or a group admin may delete a task' });
    return;
  }

  // If the task is recurring, spawn the next occurrence before deleting so the
  // schedule is preserved (same behaviour as marking the task complete).
  if (task.recur_interval && task.recur_unit) {
    const baseDue = task.due_date != null ? task.due_date : Date.now();
    const nextDue = computeNextDue(baseDue, task.recur_interval, task.recur_unit);
    const newId = randomUUID();
    const now2 = Date.now();

    const spawnAndDelete = db.transaction(() => {
      db.prepare(`
        INSERT INTO tasks (id, title, details, type_id, status, created_by, group_id, archived, created_at, updated_at, due_date, original_due_date, recur_interval, recur_unit, notify_email, notify_7day, notify_1day, notify_onday, notify_popup_7day, notify_popup_1day, notify_popup_onday)
        VALUES (?, ?, ?, ?, 'not_started', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, task.title, task.details, task.type_id, task.created_by,
        task.group_id, now2, now2, nextDue, nextDue, task.recur_interval, task.recur_unit,
        task.notify_email, task.notify_7day, task.notify_1day, task.notify_onday,
        task.notify_popup_7day, task.notify_popup_1day, task.notify_popup_onday);

      const assignees = db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ?').all(taskId) as Array<{ user_id: string }>;
      const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
      for (const a of assignees) {
        insertAssignee.run(newId, a.user_id);
      }

      // Copy subtasks to the new occurrence with completion state reset so the
      // user can complete them fresh in the next recurrence.
      copySubtasksToNewTask(taskId, newId, now2);

      db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
      db.prepare('DELETE FROM task_notes WHERE task_id = ?').run(taskId);
      db.prepare('DELETE FROM task_reminders_sent WHERE task_id = ?').run(taskId);
      db.prepare('DELETE FROM task_subtasks WHERE task_id = ?').run(taskId);
      db.prepare('DELETE FROM task_history WHERE task_id = ?').run(taskId);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    });

    spawnAndDelete();
    res.status(204).send();
    return;
  }

  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM task_notes WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM task_reminders_sent WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM task_subtasks WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM task_history WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

  res.status(204).send();
});

// ─── Task Notes ───────────────────────────────────────────────────────────────

router.get('/:id/notes', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  // Check access: creator, assignee, or group member
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const isCreator = task.created_by === userId;
  const isAssignee = !!db.prepare(
    'SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?'
  ).get(taskId, userId);
  const isGroupMember = task.group_id ? !!db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(task.group_id, userId) : false;

  if (!isCreator && !isAssignee && !isGroupMember) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const notes = db.prepare(`
    SELECT tn.id, tn.note, tn.created_at, u.username
    FROM task_notes tn
    JOIN users u ON u.id = tn.user_id
    WHERE tn.task_id = ?
    ORDER BY tn.created_at ASC
  `).all(taskId);

  res.json(notes);
});

router.post('/:id/notes', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;
  const { note } = req.body;

  if (!note || typeof note !== 'string' || !note.trim()) {
    res.status(400).json({ error: 'note is required' });
    return;
  }

  if (note.length > 5000) {
    res.status(400).json({ error: 'note must not exceed 5000 characters' });
    return;
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const isCreator = task.created_by === userId;
  const isAssignee = !!db.prepare(
    'SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?'
  ).get(taskId, userId);
  const isGroupMember = task.group_id ? !!db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(task.group_id, userId) : false;

  if (!isCreator && !isAssignee && !isGroupMember) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    'INSERT INTO task_notes (id, task_id, user_id, note, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, taskId, userId, note.trim(), now);

  // Check note-related achievements (e.g. 'detail_oriented')
  try {
    checkAndGrantAchievements(userId);
  } catch (gamErr) {
    console.error('[gamification] Error processing note creation:', gamErr);
  }

  const created = db.prepare(`
    SELECT tn.id, tn.note, tn.created_at, u.username
    FROM task_notes tn
    JOIN users u ON u.id = tn.user_id
    WHERE tn.id = ?
  `).get(id);

  res.status(201).json(created);
});

// ─── Sub-tasks ────────────────────────────────────────────────────────────────

// GET /api/tasks/:id/subtasks — list sub-tasks for a task
router.get('/:id/subtasks', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  const task = db.prepare('SELECT id, created_by, group_id FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null }
    | undefined;

  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const isAssignee = !!db.prepare(
    'SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?'
  ).get(taskId, userId);

  if (!hasTaskAccess(task, userId) && !isAssignee) {
    res.status(403).json({ error: 'Not authorized' }); return;
  }

  const subtasks = db.prepare(
    'SELECT id, title, completed, completed_by, completed_at, sort_order, created_at FROM task_subtasks WHERE task_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(taskId);

  res.json(subtasks);
});

// POST /api/tasks/:id/subtasks — create a sub-task
router.post('/:id/subtasks', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;
  const { title } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'title is required' }); return;
  }

  if (title.length > 255) {
    res.status(400).json({ error: 'title must not exceed 255 characters' }); return;
  }

  const task = db.prepare('SELECT id, created_by, group_id FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null }
    | undefined;

  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  if (!hasTaskAccess(task, userId)) {
    res.status(403).json({ error: 'Not authorized' }); return;
  }

  // Limit to 50 sub-tasks per task
  const count = (db.prepare('SELECT COUNT(*) AS cnt FROM task_subtasks WHERE task_id = ?').get(taskId) as { cnt: number }).cnt;
  if (count >= 50) {
    res.status(400).json({ error: 'A task cannot have more than 50 sub-tasks' }); return;
  }

  const id = randomUUID();
  const now = Date.now();
  const sortOrder = count; // append at end

  db.prepare(
    'INSERT INTO task_subtasks (id, task_id, title, completed, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?)'
  ).run(id, taskId, title.trim(), sortOrder, now);

  const created = db.prepare(
    'SELECT id, title, completed, completed_by, completed_at, sort_order, created_at FROM task_subtasks WHERE id = ?'
  ).get(id);

  res.status(201).json(created);
});

// PATCH /api/tasks/:id/subtasks/:subId — update a sub-task (title or completed)
router.patch('/:id/subtasks/:subId', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;
  const subId = req.params.subId;

  const task = db.prepare('SELECT id, created_by, group_id, status FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null; status: string }
    | undefined;

  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const isAssignee = !!db.prepare(
    'SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?'
  ).get(taskId, userId);

  if (!hasTaskAccess(task, userId) && !isAssignee) {
    res.status(403).json({ error: 'Not authorized' }); return;
  }

  const subtask = db.prepare(
    'SELECT id, task_id, completed FROM task_subtasks WHERE id = ? AND task_id = ?'
  ).get(subId, taskId) as { id: string; task_id: string; completed: number } | undefined;

  if (!subtask) { res.status(404).json({ error: 'Sub-task not found' }); return; }

  const { title, completed } = req.body;
  const setClauses: string[] = [];
  const vals: (string | number | null)[] = [];
  const now = Date.now();

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim() || title.length > 255) {
      res.status(400).json({ error: 'title must be between 1 and 255 characters' }); return;
    }
    setClauses.push('title = ?'); vals.push(title.trim());
  }

  const wasCompleted = subtask.completed === 1;
  let justCompleted = false;

  if (completed !== undefined) {
    const completedBool = completed === true || completed === 1;
    setClauses.push('completed = ?'); vals.push(completedBool ? 1 : 0);
    if (completedBool) {
      setClauses.push('completed_by = ?'); vals.push(userId);
      setClauses.push('completed_at = ?'); vals.push(now);
      justCompleted = !wasCompleted;
    } else {
      setClauses.push('completed_by = ?'); vals.push(null);
      setClauses.push('completed_at = ?'); vals.push(null);
    }
  }

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'Nothing to update' }); return;
  }

  vals.push(subId);
  db.prepare(`UPDATE task_subtasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...vals);

  // When a sub-task is ticked for the first time, set the parent task to 'started'
  // (if it was 'not_started') so the Started flag is applied automatically.
  if (justCompleted && task.status === 'not_started') {
    db.prepare(
      "UPDATE tasks SET status = 'started', updated_at = ? WHERE id = ?"
    ).run(now, taskId);
  }

  // Award XP for completing a sub-task (non-critical, runs regardless of gamification flag)
  let awardedXp = 0;
  if (justCompleted) {
    try {
      awardEventXp(userId, 'complete_subtask');
      // Also track the XP value for the response (best-effort)
      const ev = db.prepare('SELECT xp_value, enabled FROM xp_events WHERE key = ?')
        .get('complete_subtask') as { xp_value: number; enabled: number } | undefined;
      if (ev && ev.enabled) awardedXp = ev.xp_value;
    } catch (xpErr) {
      console.error('[subtasks] Failed to award complete_subtask XP:', xpErr);
    }
  }

  const updated = db.prepare(
    'SELECT id, title, completed, completed_by, completed_at, sort_order, created_at FROM task_subtasks WHERE id = ?'
  ).get(subId);

  // Refresh the parent task status for the response
  const updatedTask = db.prepare(
    `SELECT t.*, tt.name AS type_name FROM tasks t JOIN task_types tt ON tt.id = t.type_id WHERE t.id = ?`
  ).get(taskId) as Record<string, unknown>;

  res.json({ subtask: updated, task: { ...updatedTask, archived: updatedTask.archived === 1 }, awardedXp });
});

// DELETE /api/tasks/:id/subtasks/:subId — remove a sub-task
router.delete('/:id/subtasks/:subId', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;
  const subId = req.params.subId;

  const task = db.prepare('SELECT id, created_by, group_id FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null }
    | undefined;

  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  if (!hasTaskAccess(task, userId)) {
    res.status(403).json({ error: 'Not authorized' }); return;
  }

  const subtask = db.prepare(
    'SELECT id FROM task_subtasks WHERE id = ? AND task_id = ?'
  ).get(subId, taskId);

  if (!subtask) { res.status(404).json({ error: 'Sub-task not found' }); return; }

  db.prepare('DELETE FROM task_subtasks WHERE id = ?').run(subId);
  res.status(204).send();
});

// ─── Sporadic Tasks ───────────────────────────────────────────────────────────
export default router;
