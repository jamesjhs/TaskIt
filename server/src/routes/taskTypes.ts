import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import db from '../db';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;

  // Get global types + types belonging to user's groups
  const types = db.prepare(`
    SELECT tt.*
    FROM task_types tt
    WHERE tt.group_id IS NULL
      OR tt.group_id IN (
        SELECT group_id FROM group_members WHERE user_id = ?
      )
    ORDER BY tt.group_id NULLS FIRST, tt.name ASC
  `).all(userId);

  res.json(types);
});

router.post('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { name, groupId } = req.body;

  if (!name) {
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
  ).run(id, name, groupId || null, userId, now);

  const type = db.prepare('SELECT * FROM task_types WHERE id = ?').get(id);
  res.status(201).json(type);
});

export default router;
