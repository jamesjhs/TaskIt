import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import { BASE_URL } from '../config';
import { generateGroupName, generateSharedKey } from '../wordlists';
import { sendGroupInvite } from '../services/mail';

const router = Router();

// Derive the public-facing base URL, preferring the configured BASE_URL over the
// request Host header (which is user-controlled and can be spoofed).
function getBaseUrl(req: Request): string {
  return BASE_URL ?? `${req.protocol}://${req.get('host')}`;
}

// Basic email format guard using only string operations (no regex) to avoid any ReDoS risk.
function isValidEmail(email: string): boolean {
  const at = email.indexOf('@');
  // Must have exactly one '@', at least one char before it
  if (at < 1 || email.indexOf('@', at + 1) !== -1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  // Local part must not be empty; domain must contain a dot not at start/end
  if (!local || !domain) return false;
  const lastDot = domain.lastIndexOf('.');
  if (lastDot < 1 || lastDot === domain.length - 1) return false;
  // No whitespace anywhere
  return !/\s/.test(email);
}

// ─── Public routes (no auth required) ────────────────────────────────────────

// GET /api/groups/invite/:token  — look up invite info so the UI can show group name before login
router.get('/invite/:token', (req: Request, res: Response): void => {
  const { token } = req.params;

  const invite = db.prepare('SELECT * FROM group_invites WHERE token = ?').get(token) as
    | { token: string; group_id: string; invited_email: string | null; multi_use: number; used: number; expires_at: number }
    | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  if ((!invite.multi_use && invite.used === 1) || invite.expires_at < Date.now()) {
    res.status(410).json({ error: 'Invite has expired or already been used' });
    return;
  }

  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(invite.group_id) as
    | { id: string; name: string }
    | undefined;

  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  res.json({ group: { id: group.id, name: group.name }, invited_email: invite.invited_email });
});

// ─── All routes below require authentication ──────────────────────────────────
router.use(authMiddleware);

// GET /api/groups
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

// POST /api/groups  — create a new group
router.post('/', (req: Request, res: Response): void => {
  const { name } = req.body;
  const userId = req.user!.id;

  const id = uuidv4();
  const now = Date.now();

  // Always auto-generate a unique invite word pair
  let inviteName: string;
  let attempts = 0;
  do {
    if (++attempts > 1000) {
      res.status(500).json({ error: 'Could not generate a unique invite name — please try again' });
      return;
    }
    inviteName = generateGroupName();
  } while (db.prepare('SELECT 1 FROM groups WHERE invite_name = ?').get(inviteName));

  // Display name is optional — falls back to the invite word pair
  const trimmedName = name && typeof name === 'string' ? name.trim() : '';
  const groupName = trimmedName || inviteName;

  const sharedKey = generateSharedKey();

  db.prepare(
    'INSERT INTO groups (id, name, invite_name, shared_key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, groupName, inviteName, sharedKey, userId, now);

  db.prepare(
    'INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
  ).run(id, userId, 'admin', now);

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  res.status(201).json(group);
});

// POST /api/groups/join  — join by invite word pair + secret key
router.post('/join', (req: Request, res: Response): void => {
  const { invite_name, shared_key } = req.body;
  const userId = req.user!.id;

  if (!invite_name || typeof invite_name !== 'string' || !shared_key || typeof shared_key !== 'string') {
    res.status(400).json({ error: 'invite_name and shared_key are required' });
    return;
  }

  const group = db.prepare('SELECT * FROM groups WHERE LOWER(invite_name) = LOWER(?) AND shared_key = ?').get(
    invite_name.trim(),
    shared_key.trim()
  ) as { id: string; name: string; invite_name: string; shared_key: string; created_by: string } | undefined;

  if (!group) {
    res.status(404).json({ error: 'Group not found or secret key is incorrect' });
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

  // Notify admins (non-critical — errors must not affect the response already sent)
  try {
    const admins = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? AND role = "admin"').all(group.id) as Array<{ user_id: string }>;
    const joiner = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const username = joiner?.username ?? 'Someone';
    const insertAlert = db.prepare('INSERT INTO user_alerts (id, user_id, message, created_at) VALUES (?, ?, ?, ?)');
    for (const admin of admins) {
      insertAlert.run(uuidv4(), admin.user_id, `${username} joined group: ${group.name}`, Date.now());
    }
  } catch (err) {
    console.error('[groups/join] Failed to send admin notifications:', err);
  }
});

// POST /api/groups/invite/:token/accept  — accept a group invite (authenticated user)
router.post('/invite/:token/accept', (req: Request, res: Response): void => {
  const { token } = req.params;
  const userId = req.user!.id;
  const userEmail = req.user!.email;

  const invite = db.prepare('SELECT * FROM group_invites WHERE token = ?').get(token) as
    | { token: string; group_id: string; invited_email: string | null; multi_use: number; used: number; expires_at: number }
    | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  if ((!invite.multi_use && invite.used === 1) || invite.expires_at < Date.now()) {
    res.status(410).json({ error: 'Invite has expired or already been used' });
    return;
  }

  // If invite is tied to an email, only that email can use it
  if (invite.invited_email && invite.invited_email.toLowerCase() !== userEmail.toLowerCase()) {
    res.status(403).json({ error: 'This invite was sent to a different email address' });
    return;
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(invite.group_id) as
    | { id: string; name: string }
    | undefined;

  if (!group) {
    res.status(404).json({ error: 'Group no longer exists' });
    return;
  }

  const existing = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(group.id, userId);

  if (existing) {
    // Already a member — return the group anyway (idempotent)
    res.json({ group, alreadyMember: true });
    return;
  }

  db.prepare(
    'INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
  ).run(group.id, userId, 'member', Date.now());

  // Mark single-use invites as used
  if (!invite.multi_use) {
    db.prepare('UPDATE group_invites SET used = 1 WHERE token = ?').run(token);
  }

  res.json({ group });
});

// GET /api/groups/:id/members
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

// POST /api/groups/:id/invite  — create an invite (email or generic/QR)
router.post('/:id/invite', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const groupId = req.params.id;
  const { email, multi_use } = req.body;

  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId) as { role: string } | undefined;

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }
  if (membership.role !== 'admin') {
    res.status(403).json({ error: 'Only group admins can invite members' });
    return;
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId) as
    | { id: string; name: string }
    | undefined;

  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const invitedEmail: string | null = email && typeof email === 'string' ? email.trim().toLowerCase() : null;

  if (invitedEmail && !isValidEmail(invitedEmail)) {
    res.status(400).json({ error: 'Invalid email address' });
    return;
  }

  // Invalidate any unused previous invites for the same group+email
  if (invitedEmail) {
    db.prepare(
      'UPDATE group_invites SET used = 1 WHERE group_id = ? AND invited_email = ? AND used = 0'
    ).run(groupId, invitedEmail);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days
  const isMultiUse = multi_use ? 1 : 0;

  db.prepare(
    'INSERT INTO group_invites (token, group_id, invited_email, multi_use, created_by, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).run(token, groupId, invitedEmail, isMultiUse, userId, expiresAt, now);

  const baseUrl = getBaseUrl(req);
  const inviteUrl = `${baseUrl}?invite=${token}`;

  if (invitedEmail) {
    const inviter = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    try {
      await sendGroupInvite(invitedEmail, group.name, inviteUrl, inviter?.username);
    } catch (err) {
      console.error('[groups] Failed to send invite email:', err);
    }
  }

  res.status(201).json({ token, invite_url: inviteUrl, expires_at: expiresAt });
});

// GET /api/groups/:id/qr  — generate a QR code for a multi-use invite link
router.get('/:id/qr', async (req: Request, res: Response): Promise<void> => {
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
    res.status(403).json({ error: 'Only group admins can generate QR codes' });
    return;
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId) as
    | { id: string; name: string }
    | undefined;

  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  // Invalidate any previous QR invite tokens for this group
  db.prepare(
    "UPDATE group_invites SET used = 1 WHERE group_id = ? AND multi_use = 1 AND invited_email IS NULL AND used = 0"
  ).run(groupId);

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

  db.prepare(
    'INSERT INTO group_invites (token, group_id, invited_email, multi_use, created_by, expires_at, used, created_at) VALUES (?, ?, NULL, 1, ?, ?, 0, ?)'
  ).run(token, groupId, userId, expiresAt, now);

  const baseUrl = getBaseUrl(req);
  const inviteUrl = `${baseUrl}?invite=${token}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(inviteUrl, { width: 256, margin: 2 });
    res.json({ qr: qrDataUrl, invite_url: inviteUrl, expires_at: expiresAt });
  } catch (err) {
    console.error('[groups] Failed to generate QR code:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// PATCH /api/groups/:id/name
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

// DELETE /api/groups/:id
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

  db.prepare('DELETE FROM group_invites WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);

  res.json({ message: 'Group deleted' });
});

// POST /api/groups/:id/members/:userId/promote  — promote a member to admin (Android convenience endpoint)
router.post('/:id/members/:userId/promote', (req: Request, res: Response): void => {
  const requesterId = req.user!.id;
  const groupId = req.params.id;
  const targetUserId = req.params.userId;

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
  ).run('admin', groupId, targetUserId);

  res.json({ message: 'Member promoted to admin' });
});

// POST /api/groups/:id/members/:userId/demote  — demote an admin to member (Android convenience endpoint)
router.post('/:id/members/:userId/demote', (req: Request, res: Response): void => {
  const requesterId = req.user!.id;
  const groupId = req.params.id;
  const targetUserId = req.params.userId;

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
  ).run('member', groupId, targetUserId);

  res.json({ message: 'Admin demoted to member' });
});

// PATCH /api/groups/:id/members/:userId/role
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
