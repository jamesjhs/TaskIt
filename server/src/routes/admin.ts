import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import db from '../db';

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
  res.json(row);
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

router.get('/users', (_req: Request, res: Response): void => {
  const users = db.prepare(
    'SELECT id, username, email, role, failed_logins, locked_until, created_at FROM users ORDER BY created_at ASC'
  ).all();
  res.json(users);
});

router.get('/locked', (_req: Request, res: Response): void => {
  const now = Date.now();
  const users = db.prepare(
    'SELECT id, username, email, role, failed_logins, locked_until, created_at FROM users WHERE locked_until > ? ORDER BY locked_until ASC'
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

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
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

// GET /api/admin/collectibles — list active collectibles with their category
router.get('/collectibles', (_req: Request, res: Response): void => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.description, c.rarity, c.archived, c.created_at,
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
  const { name, description, categoryId, rarity } = req.body;

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
    INSERT INTO collectibles (id, name, description, category_id, rarity, archived, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, name.trim(), description?.trim() || null, categoryId, rarity, now);

  const created = db.prepare(`
    SELECT c.id, c.name, c.description, c.rarity, c.created_at,
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
  const { name, description, categoryId, rarity } = req.body;

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

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No valid fields to update (name, description, categoryId, rarity)' });
    return;
  }

  vals.push(itemId);
  db.prepare(`UPDATE collectibles SET ${setClauses.join(', ')} WHERE id = ?`).run(...vals);

  const updated = db.prepare(`
    SELECT c.id, c.name, c.description, c.rarity, c.created_at,
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

export default router;
