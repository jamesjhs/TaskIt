import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import { generateGroupName, generateSharedKey } from '../wordlists';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const groups = db.prepare(`
    SELECT g.*, gm.role,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.created_at DESC
  `).all(userId);
  res.json(groups);
});

router.post('/', (req: Request, res: Response): void => {
  const { name } = req.body;
  const userId = req.user!.id;

  const id = uuidv4();
  const trimmedName = name && typeof name === 'string' ? name.trim() : '';
  let groupName: string;
  if (trimmedName) {
    groupName = trimmedName;
  } else {
    // Retry until a name not already in use is found
    let candidate: string;
    do {
      candidate = generateGroupName();
    } while (db.prepare('SELECT 1 FROM groups WHERE name = ?').get(candidate));
    groupName = candidate;
  }
  const sharedKey = generateSharedKey();
  const now = Date.now();

  db.prepare(
    'INSERT INTO groups (id, name, shared_key, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, groupName, sharedKey, userId, now);

  db.prepare(
    'INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
  ).run(id, userId, 'admin', now);

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  res.status(201).json(group);
});

router.post('/join', (req: Request, res: Response): void => {
  const { shared_key } = req.body;
  const userId = req.user!.id;

  if (!shared_key) {
    res.status(400).json({ error: 'shared_key is required' });
    return;
  }

  const group = db.prepare('SELECT * FROM groups WHERE shared_key = ?').get(shared_key) as
    | { id: string; name: string; shared_key: string; created_by: string }
    | undefined;

  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const existing = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(group.id, userId);

  if (existing) {
    res.status(409).json({ error: 'Already a member of this group' });
    return;
  }

  db.prepare(
    'INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
  ).run(group.id, userId, 'member', Date.now());

  res.json(group);
});

router.get('/:id/members', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const groupId = req.params.id;

  const membership = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId);

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const members = db.prepare(`
    SELECT u.id, u.username, u.email, gm.role, gm.joined_at
    FROM users u
    JOIN group_members gm ON gm.user_id = u.id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at ASC
  `).all(groupId);

  res.json(members);
});

router.patch('/:id/name', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const groupId = req.params.id;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId) as { role: string } | undefined;

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }
  if (membership.role !== 'admin') {
    res.status(403).json({ error: 'Only group admins can rename the group' });
    return;
  }

  db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name.trim(), groupId);
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  res.json(group);
});

router.delete('/:id', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const groupId = req.params.id;

  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId) as { role: string } | undefined;

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }
  if (membership.role !== 'admin') {
    res.status(403).json({ error: 'Only group admins can delete the group' });
    return;
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);

  res.json({ message: 'Group deleted' });
});

router.patch('/:id/members/:userId/role', (req: Request, res: Response): void => {
  const requesterId = req.user!.id;
  const groupId = req.params.id;
  const targetUserId = req.params.userId;
  const { role } = req.body;

  if (role !== 'admin' && role !== 'member') {
    res.status(400).json({ error: 'role must be "admin" or "member"' });
    return;
  }

  const requesterMembership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, requesterId) as { role: string } | undefined;

  if (!requesterMembership || requesterMembership.role !== 'admin') {
    res.status(403).json({ error: 'Only group admins can change member roles' });
    return;
  }

  const targetMembership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, targetUserId);

  if (!targetMembership) {
    res.status(404).json({ error: 'User is not a member of this group' });
    return;
  }

  db.prepare(
    'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?'
  ).run(role, groupId, targetUserId);

  res.json({ message: 'Role updated' });
});

export default router;
