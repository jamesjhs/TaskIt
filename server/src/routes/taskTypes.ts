import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import db from '../db';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  // Return: system-global types (created_by IS NULL, group_id IS NULL)
  //       + this user's personal types (created_by = userId, group_id IS NULL)
  //       + types belonging to any group the user is a member of
  // Exclude archived types
  const types = db.prepare(`
    SELECT tt.*
    FROM task_types tt
    WHERE (tt.archived IS NULL OR tt.archived = 0)
      AND (
        (tt.group_id IS NULL AND tt.created_by IS NULL)
        OR (tt.group_id IS NULL AND tt.created_by = ?)
        OR tt.group_id IN (
          SELECT group_id FROM group_members WHERE user_id = ?
        )
      )
    ORDER BY tt.group_id NULLS FIRST, tt.created_by NULLS FIRST, tt.name ASC
  `).all(userId, userId);

  res.json(types);
});

router.post('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { name, groupId } = req.body;

  if (!name || !String(name).trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  if (String(name).trim().length > 100) {
    res.status(400).json({ error: 'name must not exceed 100 characters' });
    return;
  }

  if (groupId) {
    const member = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, userId);
    if (!member) {
      res.status(403).json({ error: 'Not a member of the specified group' });
      return;
    }
  }

  const trimmedName = String(name).trim();

  // Check if a type with this name already exists (and is not archived)
  const existing = db.prepare(
    'SELECT id FROM task_types WHERE name = ? AND (archived IS NULL OR archived = 0) AND group_id IS ? AND created_by IS ?'
  ).get(trimmedName, groupId || null, groupId ? null : userId);

  if (existing) {
    res.status(400).json({ error: 'A task type with this name already exists' });
    return;
  }

  // Check if an archived type with this name exists — if so, re-enable it
  const archived = db.prepare(
    'SELECT id FROM task_types WHERE name = ? AND archived = 1 AND group_id IS ? AND created_by IS ?'
  ).get(trimmedName, groupId || null, groupId ? null : userId) as { id: string } | undefined;

  if (archived) {
    db.prepare('UPDATE task_types SET archived = 0, created_at = ? WHERE id = ?').run(
      Date.now(),
      archived.id
    );
    const type = db.prepare('SELECT * FROM task_types WHERE id = ?').get(archived.id);
    res.status(201).json(type);
    return;
  }

  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    'INSERT INTO task_types (id, name, group_id, created_by, created_at, archived) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(id, trimmedName, groupId || null, userId, now);

  const type = db.prepare('SELECT * FROM task_types WHERE id = ?').get(id);
  res.status(201).json(type);
});

router.patch('/:id', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const typeId = req.params.id;
  const { name } = req.body;

  if (!name || !String(name).trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  if (String(name).trim().length > 100) {
    res.status(400).json({ error: 'name must not exceed 100 characters' });
    return;
  }

  const trimmedName = String(name).trim();

  const type = db.prepare('SELECT * FROM task_types WHERE id = ?').get(typeId) as
    | { id: string; name: string; group_id: string | null; created_by: string | null; archived: number }
    | undefined;

  if (!type) {
    res.status(404).json({ error: 'Task type not found' });
    return;
  }

  // System types cannot be edited
  if (!type.created_by) {
    res.status(403).json({ error: 'System task types cannot be edited' });
    return;
  }

  // Only creator can edit, or group admin for group types
  if (type.created_by !== userId) {
    if (type.group_id) {
      const membership = db.prepare(
        'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
      ).get(type.group_id, userId) as { role: string } | undefined;
      if (!membership || membership.role !== 'admin') {
        res.status(403).json({ error: 'Not authorised to edit this task type' });
        return;
      }
    } else {
      res.status(403).json({ error: 'Not authorised to edit this task type' });
      return;
    }
  }

  // Check if name is a duplicate (among non-archived types)
  const existing = db.prepare(
    'SELECT id FROM task_types WHERE name = ? AND id != ? AND (archived IS NULL OR archived = 0) AND group_id IS ? AND created_by IS ?'
  ).get(trimmedName, typeId, type.group_id || null, type.created_by);

  if (existing) {
    res.status(400).json({ error: 'A task type with this name already exists' });
    return;
  }

  db.prepare('UPDATE task_types SET name = ? WHERE id = ?').run(trimmedName, typeId);

  const updated = db.prepare('SELECT * FROM task_types WHERE id = ?').get(typeId);
  res.json(updated);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.delete('/:id', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const typeId = req.params.id;

  if (!UUID_RE.test(typeId)) {
    res.status(400).json({ error: 'Invalid category id' });
    return;
  }

  const type = db.prepare('SELECT * FROM task_types WHERE id = ?').get(typeId) as
    | { id: string; name: string; group_id: string | null; created_by: string | null; archived: number }
    | undefined;

  if (!type) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  // System categories (created_by IS NULL) cannot be deleted
  if (!type.created_by) {
    res.status(403).json({ error: 'System categories cannot be deleted' });
    return;
  }

  // Creator can always delete their own category.
  // For group categories, a group admin can also delete.
  if (type.created_by !== userId) {
    if (type.group_id) {
      const membership = db.prepare(
        'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
      ).get(type.group_id, userId) as { role: string } | undefined;
      if (!membership || membership.role !== 'admin') {
        res.status(403).json({ error: 'Not authorised to delete this category' });
        return;
      }
    } else {
      res.status(403).json({ error: 'Not authorised to delete this category' });
      return;
    }
  }

  // Soft delete: mark as archived
  db.prepare('UPDATE task_types SET archived = 1 WHERE id = ?').run(typeId);

  // Find the Routine task type (system type)
  const routineType = db.prepare(
    'SELECT id FROM task_types WHERE name = ? AND created_by IS NULL AND group_id IS NULL'
  ).get('Routine') as { id: string } | undefined;

  if (!routineType) {
    // Fallback: if Routine doesn't exist, find any system type
    const fallback = db.prepare(
      'SELECT id FROM task_types WHERE created_by IS NULL AND group_id IS NULL LIMIT 1'
    ).get() as { id: string } | undefined;

    if (fallback) {
      // Reset active tasks to fallback system type
      db.prepare(
        'UPDATE tasks SET type_id = ? WHERE type_id = ? AND archived = 0 AND status NOT IN (?, ?)'
      ).run(fallback.id, typeId, 'complete', 'archived');
    }
  } else {
    // Reset active tasks to Routine type
    db.prepare(
      'UPDATE tasks SET type_id = ? WHERE type_id = ? AND archived = 0 AND status NOT IN (?, ?)'
    ).run(routineType.id, typeId, 'complete', 'archived');
  }

  res.status(204).end();
});

export default router;
