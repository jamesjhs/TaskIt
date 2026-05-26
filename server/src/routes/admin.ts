import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import db from '../db';
import { ADMIN_EMAIL, VAPID } from '../config';

/** Absolute path to the server-side PNG icons directory. */
const COLLECTABLES_DIR = path.resolve(__dirname, '..', '..', '..', 'public', 'collectables');

/**
 * Validates that an icon filename is safe to store and serve.
 *
 * Accepts two formats:
 *  - Flat file:      `photo.png`   (alphanumerics, hyphens, underscores, .png extension)
 *  - Subfolder file: `avian-friends/photo.png`  (one level of kebab-case subfolder only)
 *
 * Rules applied to both formats:
 *  - Must be a non-empty string
 *  - Must end with `.png` (case-insensitive)
 *  - Must not contain `..` or backslashes
 *  - The resolved path must be strictly inside the collectables directory
 *  - The file must actually exist
 *
 * Returns the normalised path on success, or null on failure.
 */
function validateIconFilename(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.includes('..') || trimmed.includes('\\')) return null;

  const parts = trimmed.split('/');
  if (parts.length === 1) {
    // Flat file: must match safe filename pattern
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-]*\.png$/i.test(parts[0])) return null;
  } else if (parts.length === 2) {
    // One subfolder level: subfolder must be kebab-case, filename must be safe
    if (!/^[a-z0-9][a-z0-9-]*$/.test(parts[0])) return null;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-]*\.png$/i.test(parts[1])) return null;
  } else {
    return null;
  }

  // Verify the resolved path is strictly inside the collectables directory
  const resolved = path.join(COLLECTABLES_DIR, ...parts);
  if (!resolved.startsWith(COLLECTABLES_DIR + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return trimmed;
}

const router = Router();

router.use(authMiddleware, adminMiddleware);

interface SmtpSettings {
  id: number;
  host: string;
  port: number;
  secure: number;
  username: string;
  pass: string;
  from_addr: string;
  enabled: number;
  updated_at: number;
}

router.get('/smtp', (_req: Request, res: Response): void => {
  const row = db.prepare('SELECT id, host, port, secure, username, from_addr, enabled, updated_at FROM smtp_settings WHERE id = 1').get() as Omit<SmtpSettings, 'pass'> | undefined;
  if (!row) {
    res.status(404).json({ error: 'SMTP settings not found' });
    return;
  }
  res.json({
    ...row,
    vapid: {
      publicKey: VAPID.publicKey || '',
      subject: VAPID.subject || '',
      privateKeyConfigured: !!VAPID.privateKey,
    },
  });
});

router.put('/smtp', (req: Request, res: Response): void => {
  const { host, port, secure, user: username, pass, from_addr, enabled } = req.body;

  const current = db.prepare('SELECT pass FROM smtp_settings WHERE id = 1').get() as { pass: string } | undefined;
  const existingPass = current?.pass || '';
  const newPass = typeof pass === 'string' && pass.length > 0 ? pass : existingPass;

  db.prepare(`
    UPDATE smtp_settings
    SET host = ?, port = ?, secure = ?, username = ?, pass = ?, from_addr = ?, enabled = ?, updated_at = ?
    WHERE id = 1
  `).run(
    host || '',
    port != null ? parseInt(String(port), 10) : 587,
    secure ? 1 : 0,
    username || '',
    newPass,
    from_addr || '',
    enabled ? 1 : 0,
    Date.now()
  );

  res.json({ message: 'SMTP settings updated' });
});

// ─── Original-admin guard helper ──────────────────────────────────────────────
// The "original admin" is the user matched by ADMIN_EMAIL (if configured) OR
// the first-ever registered user (lowest created_at across all users).
// This user can never be demoted via the admin panel.
//
// The result is computed lazily and then cached — the founding admin never
// changes, so a one-time lookup is sufficient for the lifetime of the process.
let _originalAdminId: string | null | undefined = undefined; // undefined = not yet resolved

function getOriginalAdminId(): string | null {
  if (_originalAdminId !== undefined) return _originalAdminId;

  // Prefer the explicitly configured ADMIN_EMAIL
  if (ADMIN_EMAIL) {
    const row = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1').get(ADMIN_EMAIL) as { id: string } | undefined;
    if (row) {
      _originalAdminId = row.id;
      return _originalAdminId;
    }
  }

  // Fall back to the first-ever registered user
  const first = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
  _originalAdminId = first ? first.id : null;
  return _originalAdminId;
}

function isOriginalAdmin(userId: string): boolean {
  const oid = getOriginalAdminId();
  return oid !== null && oid === userId;
}

// ─── Users ────────────────────────────────────────────────────────────────────

router.get('/users', (_req: Request, res: Response): void => {
  const now = Date.now();
  const users = db.prepare(
    'SELECT id, username, role, failed_logins, locked_until, created_at FROM users ORDER BY created_at ASC'
  ).all() as Array<{
    id: string;
    username: string;
    role: string;
    failed_logins: number;
    locked_until: number | null;
    created_at: number;
  }>;

  // Open (unresolved) report counts per reported user
  const reportCounts = db.prepare(`
    SELECT reported_id AS user_id, COUNT(*) AS cnt
    FROM user_reports
    WHERE resolved = 0
    GROUP BY reported_id
  `).all() as Array<{ user_id: string; cnt: number }>;
  const reportMap = new Map(reportCounts.map(r => [r.user_id, r.cnt]));

  const result = users.map(u => ({
    ...u,
    is_locked: u.locked_until != null && u.locked_until > now,
    open_reports: reportMap.get(u.id) ?? 0,
    is_original_admin: isOriginalAdmin(u.id),
  }));

  res.json(result);
});

router.get('/locked', (_req: Request, res: Response): void => {
  const now = Date.now();
  const users = db.prepare(
    'SELECT id, username, role, failed_logins, locked_until, created_at FROM users WHERE locked_until > ? ORDER BY locked_until ASC'
  ).all(now);
  res.json(users);
});

router.post('/users/:id/unlock', (req: Request, res: Response): void => {
  const userId = req.params.id;
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(userId);
  res.json({ message: 'Account unlocked' });
});

router.put('/users/:id/role', (req: Request, res: Response): void => {
  const targetId = req.params.id;
  const requesterId = req.user!.id;
  const { role } = req.body;

  if (targetId === requesterId) {
    res.status(400).json({ error: 'Cannot change your own role' });
    return;
  }

  if (role !== 'admin' && role !== 'user') {
    res.status(400).json({ error: 'role must be "admin" or "user"' });
    return;
  }

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId) as { id: string; role: string } | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Prevent demotion of the original (founding) admin
  if (role === 'user' && isOriginalAdmin(targetId)) {
    res.status(403).json({ error: 'The original site administrator cannot be demoted' });
    return;
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
  res.json({ message: 'Role updated' });
});

router.get('/reports', (_req: Request, res: Response): void => {
  const reports = db.prepare(`
    SELECT
      r.id, r.reason, r.created_at, r.resolved,
      reporter.username AS reporter_username,
      reporter.email AS reporter_email,
      reported.username AS reported_username,
      reported.email AS reported_email
    FROM user_reports r
    JOIN users reporter ON reporter.id = r.reporter_id
    JOIN users reported ON reported.id = r.reported_id
    ORDER BY r.created_at DESC
  `).all();
  res.json(reports);
});

router.put('/reports/:id/resolve', (req: Request, res: Response): void => {
  const reportId = req.params.id;
  const report = db.prepare('SELECT id FROM user_reports WHERE id = ?').get(reportId);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  db.prepare('UPDATE user_reports SET resolved = 1 WHERE id = ?').run(reportId);
  res.json({ message: 'Report resolved' });
});

router.get('/stats', (_req: Request, res: Response): void => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const totalUsers = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  const activeToday = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE last_active_at >= ?').get(todayMs) as { cnt: number }).cnt;
  const totalTasks = (db.prepare('SELECT COUNT(*) as cnt FROM tasks').get() as { cnt: number }).cnt;
  const tasksToday = (db.prepare('SELECT COUNT(*) as cnt FROM tasks WHERE created_at >= ?').get(todayMs) as { cnt: number }).cnt;
  res.json({ totalUsers, activeToday, totalTasks, tasksToday });
});

router.get('/feedback', (_req: Request, res: Response): void => {
  const rows = db.prepare(`
    SELECT f.id, f.subject, f.message, f.contact_ok, f.status, f.read_at, f.created_at,
           u.username, u.email
    FROM feedback_messages f
    JOIN users u ON u.id = f.user_id
    ORDER BY f.created_at DESC
  `).all();
  res.json(rows);
});

router.put('/feedback/:id/read', (req: Request, res: Response): void => {
  const fbId = req.params.id;
  const row = db.prepare('SELECT id FROM feedback_messages WHERE id = ?').get(fbId);
  if (!row) { res.status(404).json({ error: 'Feedback not found' }); return; }
  db.prepare('UPDATE feedback_messages SET read_at = ? WHERE id = ?').run(Date.now(), fbId);
  res.json({ message: 'Marked as read' });
});

router.patch('/feedback/:id/status', (req: Request, res: Response): void => {
  const fbId = req.params.id;
  const { status } = req.body;
  const VALID_STATUSES = new Set(['not_started', 'in_progress', 'completed', 'archived']);
  if (!status || !VALID_STATUSES.has(status)) {
    res.status(400).json({ error: 'status must be one of: not_started, in_progress, completed, archived' });
    return;
  }
  const row = db.prepare('SELECT id FROM feedback_messages WHERE id = ?').get(fbId);
  if (!row) { res.status(404).json({ error: 'Feedback not found' }); return; }
  const now = Date.now();
  if (status !== 'not_started') {
    db.prepare('UPDATE feedback_messages SET status = ?, read_at = COALESCE(read_at, ?) WHERE id = ?').run(status, now, fbId);
  } else {
    db.prepare('UPDATE feedback_messages SET status = ?, read_at = NULL WHERE id = ?').run(status, fbId);
  }
  res.json({ message: 'Status updated' });
});

router.post('/feedback/:id/reply', (req: Request, res: Response): void => {
  const fbId = req.params.id;
  const { message } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  if (message.length > 5000) {
    res.status(400).json({ error: 'message must not exceed 5000 characters' });
    return;
  }

  const fb = db.prepare('SELECT id, user_id FROM feedback_messages WHERE id = ?').get(fbId) as
    | { id: string; user_id: string }
    | undefined;

  if (!fb) { res.status(404).json({ error: 'Feedback not found' }); return; }

  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO user_alerts (id, user_id, message, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, fb.user_id, message.trim(), now);

  res.status(201).json({ message: 'Alert sent to user' });
});

// GET /api/admin/xp-events — list all configurable XP events
router.get('/xp-events', (_req: Request, res: Response): void => {
  const rows = db.prepare(
    'SELECT key, name, description, xp_value, enabled, updated_at FROM xp_events ORDER BY key ASC'
  ).all();
  res.json(rows);
});

// PATCH /api/admin/xp-events/:key — update the XP value or enabled flag for an event
router.patch('/xp-events/:key', (req: Request, res: Response): void => {
  const { key } = req.params;
  const { xp_value, enabled } = req.body;

  const row = db.prepare('SELECT key FROM xp_events WHERE key = ?').get(key);
  if (!row) {
    res.status(404).json({ error: 'XP event not found' });
    return;
  }

  const setClauses: string[] = [];
  const vals: (string | number)[] = [];

  if (xp_value !== undefined) {
    const parsed = parseInt(String(xp_value), 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      res.status(400).json({ error: 'xp_value must be a non-negative integer' });
      return;
    }
    setClauses.push('xp_value = ?');
    vals.push(parsed);
  }

  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean' && enabled !== 0 && enabled !== 1) {
      res.status(400).json({ error: '`enabled` must be a boolean' });
      return;
    }
    setClauses.push('enabled = ?');
    vals.push((enabled === false || enabled === 0) ? 0 : 1);
  }

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No valid fields to update (xp_value, enabled)' });
    return;
  }

  setClauses.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(key);

  db.prepare(`UPDATE xp_events SET ${setClauses.join(', ')} WHERE key = ?`).run(...vals);

  const updated = db.prepare(
    'SELECT key, name, description, xp_value, enabled, updated_at FROM xp_events WHERE key = ?'
  ).get(key);
  res.json(updated);
});

// ─── Collectible Categories ───────────────────────────────────────────────────

const ALLOWED_RARITIES = new Set(['common', 'rare', 'epic']);

// GET /api/admin/collectible-categories — list active categories
router.get('/collectible-categories', (_req: Request, res: Response): void => {
  const rows = db.prepare(
    'SELECT id, name, created_at FROM item_categories WHERE archived = 0 ORDER BY name ASC'
  ).all();
  res.json(rows);
});

// POST /api/admin/collectible-categories — create a new category
router.post('/collectible-categories', (req: Request, res: Response): void => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    'INSERT INTO item_categories (id, name, archived, created_at) VALUES (?, ?, 0, ?)'
  ).run(id, name.trim(), now);

  const created = db.prepare(
    'SELECT id, name, created_at FROM item_categories WHERE id = ?'
  ).get(id);
  res.status(201).json(created);
});

// PATCH /api/admin/collectible-categories/:id — update category name
router.patch('/collectible-categories/:id', (req: Request, res: Response): void => {
  const catId = req.params.id;
  const { name } = req.body;

  const cat = db.prepare(
    'SELECT id FROM item_categories WHERE id = ? AND archived = 0'
  ).get(catId);
  if (!cat) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  db.prepare('UPDATE item_categories SET name = ? WHERE id = ?').run(name.trim(), catId);

  const updated = db.prepare(
    'SELECT id, name, created_at FROM item_categories WHERE id = ?'
  ).get(catId);
  res.json(updated);
});

// DELETE /api/admin/collectible-categories/:id — soft delete (archived = 1)
router.delete('/collectible-categories/:id', (req: Request, res: Response): void => {
  const catId = req.params.id;

  const cat = db.prepare(
    'SELECT id FROM item_categories WHERE id = ? AND archived = 0'
  ).get(catId);
  if (!cat) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  db.prepare('UPDATE item_categories SET archived = 1 WHERE id = ?').run(catId);
  res.status(204).send();
});

// ─── Collectibles ─────────────────────────────────────────────────────────────

// GET /api/admin/collectibles/server-icons — list available PNG files in public/collectables/
// Optional query param: ?subfolder=<kebab-case-name>
// When provided, lists PNGs from public/collectables/<subfolder>/ and returns them as
// "<subfolder>/<filename>" so the caller can store the relative path directly.
router.get('/collectibles/server-icons', (req: Request, res: Response): void => {
  try {
    // Ensure the root directory exists; if not, return an empty list gracefully
    if (!fs.existsSync(COLLECTABLES_DIR)) {
      res.json([]);
      return;
    }

    const rawSubfolder = req.query.subfolder;
    if (rawSubfolder !== undefined) {
      // Validate subfolder: kebab-case slug only, no traversal
      const subfolder = typeof rawSubfolder === 'string' ? rawSubfolder.trim() : '';
      if (!subfolder || !/^[a-z0-9][a-z0-9-]*$/.test(subfolder) || subfolder.includes('..')) {
        res.status(400).json({ error: 'subfolder must be a non-empty kebab-case slug' });
        return;
      }
      const subdir = path.join(COLLECTABLES_DIR, subfolder);
      // Must still be inside COLLECTABLES_DIR
      if (!subdir.startsWith(COLLECTABLES_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid subfolder' });
        return;
      }
      if (!fs.existsSync(subdir)) {
        // Subfolder does not exist yet — return empty list (admin can create it manually)
        res.json([]);
        return;
      }
      const entries = fs.readdirSync(subdir);
      const pngs = entries
        .filter(f => /^[a-zA-Z0-9][a-zA-Z0-9_\-]*\.png$/i.test(f) && !f.includes('..'))
        .map(f => `${subfolder}/${f}`);
      res.json(pngs);
      return;
    }

    // No subfolder — list flat PNGs in the root collectables directory
    const entries = fs.readdirSync(COLLECTABLES_DIR);
    const pngs = entries.filter(f => /^[a-zA-Z0-9][a-zA-Z0-9_\-]*\.png$/i.test(f) && !f.includes('..'));
    res.json(pngs);
  } catch {
    res.status(500).json({ error: 'Could not read server icon directory' });
  }
});

// POST /api/admin/collectibles/upload-icon — upload a PNG icon for a collectible item
// Body: { name: string, categoryName: string, base64: string }
// The file is saved as <category-slug>/<item-slug>.png (or <item-slug>.png at root when no
// category name is provided).  The PNG must be strictly under 40 × 40 pixels.
router.post('/collectibles/upload-icon', (req: Request, res: Response): void => {
  const { name, categoryName, base64 } = req.body as {
    name?: unknown;
    categoryName?: unknown;
    base64?: unknown;
  };

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!base64 || typeof base64 !== 'string') {
    res.status(400).json({ error: 'base64 image data is required' });
    return;
  }

  // Decode base64 → Buffer
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    res.status(400).json({ error: 'Invalid base64 data' });
    return;
  }

  // Validate PNG signature (first 8 bytes)
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    res.status(400).json({ error: 'File must be a valid PNG image' });
    return;
  }

  // Read image dimensions from the IHDR chunk (bytes 16–19 = width, 20–23 = height)
  const width  = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width >= 40 || height >= 40) {
    res.status(400).json({ error: `Image must be under 40 × 40 px (got ${width}×${height})` });
    return;
  }

  // Derive a safe filename slug from the item name
  const nameSlug = (name as string).trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!nameSlug) {
    res.status(400).json({ error: 'Item name yields an empty filename slug' });
    return;
  }
  const filename = nameSlug + '.png';

  // Derive optional category subfolder slug
  let destRelative: string;
  if (categoryName && typeof categoryName === 'string' && (categoryName as string).trim()) {
    const catSlug = (categoryName as string).trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!catSlug || !/^[a-z0-9][a-z0-9-]*$/.test(catSlug)) {
      res.status(400).json({ error: 'Category name yields an invalid subfolder slug' });
      return;
    }
    const subdir = path.join(COLLECTABLES_DIR, catSlug);
    // Path-traversal guard
    if (!subdir.startsWith(COLLECTABLES_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid category subfolder' });
      return;
    }
    if (!fs.existsSync(subdir)) fs.mkdirSync(subdir, { recursive: true });
    destRelative = catSlug + '/' + filename;
  } else {
    destRelative = filename;
  }

  // Final path-traversal guard before writing
  const destAbs = path.join(COLLECTABLES_DIR, ...destRelative.split('/'));
  if (!destAbs.startsWith(COLLECTABLES_DIR + path.sep)) {
    res.status(400).json({ error: 'Invalid destination path' });
    return;
  }

  try {
    fs.writeFileSync(destAbs, buf);
    res.status(201).json({ path: destRelative });
  } catch {
    res.status(500).json({ error: 'Failed to save icon file' });
  }
});

// GET /api/admin/collectibles — list active collectibles with their category
router.get('/collectibles', (_req: Request, res: Response): void => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.description, c.rarity, c.icon_filename, c.archived, c.created_at,
           ic.id AS category_id, ic.name AS category_name
    FROM collectibles c
    JOIN item_categories ic ON ic.id = c.category_id
    WHERE c.archived = 0
    ORDER BY ic.name ASC, c.name ASC
  `).all();
  res.json(rows);
});

// POST /api/admin/collectibles — create a new collectible
router.post('/collectibles', (req: Request, res: Response): void => {
  const { name, description, categoryId, rarity, iconFilename } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!categoryId || typeof categoryId !== 'string') {
    res.status(400).json({ error: 'categoryId is required' });
    return;
  }
  if (!rarity || !ALLOWED_RARITIES.has(rarity)) {
    res.status(400).json({ error: 'rarity must be one of: common, rare, epic' });
    return;
  }

  // Validate optional icon filename if provided
  let safeIconFilename: string | null = null;
  if (iconFilename !== undefined && iconFilename !== null && iconFilename !== '') {
    safeIconFilename = validateIconFilename(iconFilename);
    if (safeIconFilename === null) {
      res.status(400).json({ error: 'iconFilename must be a valid .png filename present in the server collectables directory' });
      return;
    }
  }

  const cat = db.prepare(
    'SELECT id FROM item_categories WHERE id = ? AND archived = 0'
  ).get(categoryId);
  if (!cat) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO collectibles (id, name, description, category_id, rarity, icon_filename, archived, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, name.trim(), description?.trim() || null, categoryId, rarity, safeIconFilename, now);

  const created = db.prepare(`
    SELECT c.id, c.name, c.description, c.rarity, c.icon_filename, c.created_at,
           ic.id AS category_id, ic.name AS category_name
    FROM collectibles c
    JOIN item_categories ic ON ic.id = c.category_id
    WHERE c.id = ?
  `).get(id);
  res.status(201).json(created);
});

// PATCH /api/admin/collectibles/:id — update collectible fields
router.patch('/collectibles/:id', (req: Request, res: Response): void => {
  const itemId = req.params.id;
  const { name, description, categoryId, rarity, iconFilename } = req.body;

  const item = db.prepare(
    'SELECT id FROM collectibles WHERE id = ? AND archived = 0'
  ).get(itemId);
  if (!item) {
    res.status(404).json({ error: 'Collectible not found' });
    return;
  }

  const setClauses: string[] = [];
  const vals: (string | null)[] = [];

  if (name !== undefined) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name must be a non-empty string' });
      return;
    }
    setClauses.push('name = ?');
    vals.push(name.trim());
  }

  if (description !== undefined) {
    setClauses.push('description = ?');
    vals.push(description ? String(description).trim() : null);
  }

  if (categoryId !== undefined) {
    const cat = db.prepare(
      'SELECT id FROM item_categories WHERE id = ? AND archived = 0'
    ).get(categoryId);
    if (!cat) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    setClauses.push('category_id = ?');
    vals.push(categoryId);
  }

  if (rarity !== undefined) {
    if (!ALLOWED_RARITIES.has(rarity)) {
      res.status(400).json({ error: 'rarity must be one of: common, rare, epic' });
      return;
    }
    setClauses.push('rarity = ?');
    vals.push(rarity);
  }

  // iconFilename: null/empty string clears the icon; a non-empty string is validated
  if (iconFilename !== undefined) {
    if (iconFilename === null || iconFilename === '') {
      setClauses.push('icon_filename = ?');
      vals.push(null);
    } else {
      const safe = validateIconFilename(iconFilename);
      if (safe === null) {
        res.status(400).json({ error: 'iconFilename must be a valid .png filename present in the server collectables directory' });
        return;
      }
      setClauses.push('icon_filename = ?');
      vals.push(safe);
    }
  }

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No valid fields to update (name, description, categoryId, rarity, iconFilename)' });
    return;
  }

  vals.push(itemId);
  db.prepare(`UPDATE collectibles SET ${setClauses.join(', ')} WHERE id = ?`).run(...vals);

  const updated = db.prepare(`
    SELECT c.id, c.name, c.description, c.rarity, c.icon_filename, c.created_at,
           ic.id AS category_id, ic.name AS category_name
    FROM collectibles c
    JOIN item_categories ic ON ic.id = c.category_id
    WHERE c.id = ?
  `).get(itemId);
  res.json(updated);
});

// DELETE /api/admin/collectibles/:id — soft delete (archived = 1)
router.delete('/collectibles/:id', (req: Request, res: Response): void => {
  const itemId = req.params.id;

  const item = db.prepare(
    'SELECT id FROM collectibles WHERE id = ? AND archived = 0'
  ).get(itemId);
  if (!item) {
    res.status(404).json({ error: 'Collectible not found' });
    return;
  }

  db.prepare('UPDATE collectibles SET archived = 1 WHERE id = ?').run(itemId);
  res.status(204).send();
});

// ─── Bulk Seed ─────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/collectibles/seed
 * Bulk-creates categories and collectibles from a JSON payload.
 *
 * Body: an array of category objects:
 * [
 *   {
 *     "name": "Category Name",
 *     "items": [
 *       { "name": "Item Name", "description": "Optional description", "rarity": "common|rare|epic" }
 *     ]
 *   }
 * ]
 *
 * Categories that already exist (same name, case-insensitive) are reused.
 * Items that already exist (same name + category, case-insensitive) are skipped.
 * Returns a summary: { categoriesCreated, categoriesReused, itemsCreated, itemsSkipped }.
 */
router.post('/collectibles/seed', (req: Request, res: Response): void => {
  const payload = req.body;

  if (!Array.isArray(payload) || payload.length === 0) {
    res.status(400).json({ error: 'Body must be a non-empty array of category objects' });
    return;
  }

  let categoriesCreated = 0;
  let categoriesReused  = 0;
  let itemsCreated      = 0;
  let itemsSkipped      = 0;

  const now = Date.now();

  const seedTx = db.transaction(() => {
    for (const cat of payload) {
      if (!cat.name || typeof cat.name !== 'string' || !cat.name.trim()) continue;
      const catName = cat.name.trim();

      // Check for an existing (non-archived) category with this name (case-insensitive)
      let existing = db.prepare(
        'SELECT id FROM item_categories WHERE LOWER(name) = LOWER(?) AND archived = 0'
      ).get(catName) as { id: string } | undefined;

      let catId: string;
      if (existing) {
        catId = existing.id;
        categoriesReused++;
      } else {
        catId = randomUUID();
        db.prepare(
          'INSERT INTO item_categories (id, name, archived, created_at) VALUES (?, ?, 0, ?)'
        ).run(catId, catName, now);
        categoriesCreated++;
      }

      if (!Array.isArray(cat.items)) continue;

      for (const item of cat.items) {
        if (!item.name || typeof item.name !== 'string' || !item.name.trim()) continue;
        const itemName = item.name.trim();
        const rarity   = (item.rarity || 'common').toLowerCase();
        if (!ALLOWED_RARITIES.has(rarity)) continue;

        // Skip if an item with the same name already exists in this category
        const dup = db.prepare(
          'SELECT id FROM collectibles WHERE LOWER(name) = LOWER(?) AND category_id = ? AND archived = 0'
        ).get(itemName, catId);
        if (dup) {
          itemsSkipped++;
          continue;
        }

        const itemId = randomUUID();
        db.prepare(
          'INSERT INTO collectibles (id, name, description, category_id, rarity, archived, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
        ).run(itemId, itemName, item.description?.trim() || null, catId, rarity, now);
        itemsCreated++;
      }
    }
  });

  seedTx();

  res.status(201).json({ categoriesCreated, categoriesReused, itemsCreated, itemsSkipped });
});

// ─── Turnstile / CAPTCHA Settings ────────────────────────────────────────────

router.get('/turnstile', (_req: Request, res: Response): void => {
  const row = db.prepare('SELECT id, site_key, secret_key, enabled, updated_at FROM turnstile_settings WHERE id = 1').get() as Omit<{
    id: number;
    site_key: string;
    secret_key: string;
    enabled: number;
    updated_at: number;
  }, 'secret_key'> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Turnstile settings not found' });
    return;
  }
  // Never send the secret key to the client
  res.json({ id: row.id, site_key: row.site_key, enabled: row.enabled, updated_at: row.updated_at });
});

router.put('/turnstile', (req: Request, res: Response): void => {
  const { site_key, secret_key, enabled } = req.body;

  if (typeof site_key !== 'string' || typeof secret_key !== 'string') {
    res.status(400).json({ error: 'site_key and secret_key must be strings' });
    return;
  }

  db.prepare(`
    UPDATE turnstile_settings
    SET site_key = ?, secret_key = ?, enabled = ?, updated_at = ?
    WHERE id = 1
  `).run(
    site_key,
    secret_key,
    enabled ? 1 : 0,
    Date.now()
  );

  res.json({ message: 'Turnstile settings updated' });
});

// ─── Arcade Settings ─────────────────────────────────────────────────────────

router.get('/arcade-settings', (_req: Request, res: Response): void => {
  const row = db.prepare("SELECT value FROM site_settings WHERE key = 'arcade_daily_play_minutes'").get() as { value: string } | undefined;
  const minutes = row ? (parseInt(row.value, 10) || 5) : 5;
  res.json({ arcadeDailyPlayMinutes: minutes });
});

router.put('/arcade-settings', (req: Request, res: Response): void => {
  const raw = req.body?.arcadeDailyPlayMinutes;
  const minutes = parseInt(raw, 10);
  if (isNaN(minutes) || minutes < 1 || minutes > 180) {
    res.status(400).json({ error: 'arcadeDailyPlayMinutes must be an integer between 1 and 180' });
    return;
  }
  db.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('arcade_daily_play_minutes', ?)").run(String(minutes));
  db.prepare('UPDATE users SET daily_play_minutes = ?').run(minutes);
  res.json({ arcadeDailyPlayMinutes: minutes });
});

export default router;
