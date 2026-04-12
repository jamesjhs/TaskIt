import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import db from '../db';

const router = Router();

// Allowed values for validated enum fields
const ALLOWED_STATUSES = new Set(['not_started', 'started', 'complete']);

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
      g.name AS group_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    JOIN users u ON u.id = t.created_by
    LEFT JOIN groups g ON g.id = t.group_id
    ${whereClause}
    ORDER BY t.updated_at DESC
  `).all(...params) as Array<Record<string, unknown>>;

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

  const result = tasks.map((t) => ({
    ...t,
    archived: t.archived === 1,
    assignees: assigneeMap[t.id as string] || [],
  }));

  res.json(result);
});

router.post('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { title, details, typeId, groupId, assigneeIds, dueDate } = req.body;

  if (!title || !typeId) {
    res.status(400).json({ error: 'title and typeId are required' });
    return;
  }

  // Verify type exists
  const typeExists = db.prepare('SELECT 1 FROM task_types WHERE id = ?').get(typeId);
  if (!typeExists) {
    res.status(400).json({ error: 'Invalid typeId' });
    return;
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

  const id = uuidv4();
  const now = Date.now();

  db.prepare(`
    INSERT INTO tasks (id, title, details, type_id, status, created_by, group_id, archived, created_at, updated_at, due_date)
    VALUES (?, ?, ?, ?, 'not_started', ?, ?, 0, ?, ?, ?)
  `).run(id, title, details || null, typeId, userId, groupId || null, now, now, dueDate || null);

  // Insert assignees
  const ids: string[] = Array.isArray(assigneeIds) ? assigneeIds : [];
  const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
  for (const aId of ids) {
    insertAssignee.run(id, aId);
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

router.patch('/:id', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; group_id: string | null; archived: number }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Only creator can update
  if (task.created_by !== userId) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const { title, details, typeId, status, assigneeIds, dueDate } = req.body;

  // Validate status if provided
  if (status !== undefined && !ALLOWED_STATUSES.has(status as string)) {
    res.status(400).json({ error: 'Invalid status value' });
    return;
  }

  const now = Date.now();

  // All SET clause fragments are hardcoded string literals — no user input is
  // interpolated into the SQL structure; only values use ? placeholders.
  const setClauses: string[] = [];
  const vals: (string | number | null)[] = [];

  if (title !== undefined) { setClauses.push('title = ?'); vals.push(title); }
  if (details !== undefined) { setClauses.push('details = ?'); vals.push(details); }
  if (typeId !== undefined) { setClauses.push('type_id = ?'); vals.push(typeId); }
  if (status !== undefined) { setClauses.push('status = ?'); vals.push(status); }
  if (dueDate !== undefined) { setClauses.push('due_date = ?'); vals.push(dueDate || null); }
  setClauses.push('updated_at = ?');
  vals.push(now);
  vals.push(taskId);

  if (setClauses.length > 0) {
    db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...vals);
  }

  if (Array.isArray(assigneeIds)) {
    db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
    const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
    for (const aId of assigneeIds) {
      insertAssignee.run(taskId, aId);
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
    | { id: string; created_by: string }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Allow creator or assignee to update status
  const isAssignee = db.prepare(
    'SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?'
  ).get(taskId, userId);

  if (task.created_by !== userId && !isAssignee) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), taskId);

  const updated = db.prepare(`
    SELECT t.*, tt.name AS type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.type_id
    WHERE t.id = ?
  `).get(taskId) as Record<string, unknown>;

  res.json({ ...updated, archived: updated.archived === 1 });
});

router.patch('/:id/archive', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; created_by: string; archived: number }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (task.created_by !== userId) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const newArchived = task.archived === 0 ? 1 : 0;
  db.prepare('UPDATE tasks SET archived = ?, updated_at = ? WHERE id = ?').run(
    newArchived, Date.now(), taskId
  );

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
    | { id: string; created_by: string }
    | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (task.created_by !== userId) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM task_notes WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM task_reminders_sent WHERE task_id = ?').run(taskId);
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

  const id = uuidv4();
  const now = Date.now();

  db.prepare(
    'INSERT INTO task_notes (id, task_id, user_id, note, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, taskId, userId, note.trim(), now);

  const created = db.prepare(`
    SELECT tn.id, tn.note, tn.created_at, u.username
    FROM task_notes tn
    JOIN users u ON u.id = tn.user_id
    WHERE tn.id = ?
  `).get(id);

  res.status(201).json(created);
});

export default router;
