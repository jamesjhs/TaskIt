import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import db from '../db';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  // Return: system-global types (created_by IS NULL, group_id IS NULL)
  //       + this user's personal types (created_by = userId, group_id IS NULL)
  //       + types belonging to any group the user is a member of
  const types = db.prepare(`
    SELECT tt.*
    FROM task_types tt
    WHERE (tt.group_id IS NULL AND tt.created_by IS NULL)
      OR (tt.group_id IS NULL AND tt.created_by = ?)
      OR tt.group_id IN (
        SELECT group_id FROM group_members WHERE user_id = ?
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

  db.prepare(
    'INSERT INTO task_types (id, name, group_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, String(name).trim(), groupId || null, userId, now);

  const type = db.prepare('SELECT * FROM task_types WHERE id = ?').get(id);
  res.status(201).json(type);
});

router.delete('/:id', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const typeId = req.params.id;

  const type = db.prepare('SELECT * FROM task_types WHERE id = ?').get(typeId) as
    | { id: string; name: string; group_id: string | null; created_by: string | null }
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

  db.prepare('DELETE FROM task_types WHERE id = ?').run(typeId);
  res.status(204).end();
});

export default router;
