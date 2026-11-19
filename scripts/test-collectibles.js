// Run after building the server. All database fixtures live in memory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.DB_PATH = ':memory:';
process.env.DB_ENCRYPTION_KEY = '';
process.env.JWT_SECRET = 'collectible-regression-test-only';
const db = require('../server/dist/db').default;
const loot = require('../server/dist/services/gamification');
const express = require('express');
const jwt = require('jsonwebtoken');
const originalRandom = Math.random;
let server;

async function main() {
  const now = Date.now();
  db.prepare(`INSERT INTO users (id, username, email, password_hash, created_at, gamification_enabled)
    VALUES ('collector', 'collector', 'collector@example.com', 'unused', ?, 1)`).run(now);
  db.prepare("INSERT INTO item_categories (id, name, created_at) VALUES ('category', 'Category', ?)").run(now);
  const addItem = (id, rarity) => db.prepare(`INSERT INTO collectibles (id, name, category_id, rarity, created_at)
    VALUES (?, ?, 'category', ?, ?)`).run(id, id, rarity, now);
  const own = id => db.prepare(`INSERT INTO user_inventory (id, user_id, collectible_id, acquired_at)
    VALUES (?, 'collector', ?, ?)`).run('owned-' + id, id, now);
  addItem('owned-common', 'common');
  addItem('new-common', 'common');
  addItem('new-epic', 'epic');
  own('owned-common');
  Math.random = () => 0; // Always pass the drop roll and select the common tier.

  const first = loot.awardEventXp('collector', 'create_task').drop;
  assert.equal(first.collectibleId, 'new-common', 'Owned items must be excluded from the rolled tier');
  assert.equal(loot.awardEventXp('collector', 'complete_subtask').drop, null, 'Pending reward must not be overwritten');

  const app = express();
  app.use(express.json());
  app.use('/api/gamification', require('../server/dist/routes/gamification').default);
  app.use((error, req, res, next) => res.status(500).json({ error: 'Test write failed' }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/gamification`;
  const token = jwt.sign({ id: 'collector', token_version: 0 }, process.env.JWT_SECRET);
  const request = (url, method = 'GET') => fetch(base + url, { method, headers: { Authorization: 'Bearer ' + token } });
  assert.equal((await fetch(base + '/inventory/pending')).status, 401);
  let response = await request('/inventory/pending');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).drop.collectibleId, first.collectibleId, 'Ignored event drops must be recoverable');
  assert.equal((await request('/inventory/claim', 'POST')).status, 201);
  assert.equal((await request('/inventory/claim', 'POST')).status, 404, 'Repeated claims cannot add copies');

  const fallback = loot.awardEventXp('collector', 'complete_subtask').drop;
  assert.equal(fallback.collectibleId, 'new-epic', 'Exhausted tier must fall back to an unowned item');
  assert.equal(fallback.rarity, 'epic', 'Fallback must report the actual rarity');
  own('new-epic'); // Simulate ownership changing between selection and claim.
  assert.equal((await request('/inventory/claim', 'POST')).status, 404);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_inventory WHERE collectible_id = 'new-epic'").get().n, 1);
  assert.equal(loot.getPendingDrop('collector'), null, 'A rejected duplicate claim must clear its blocker');
  assert.equal(loot.awardEventXp('collector', 'create_task').drop, null, 'A complete catalogue must produce no duplicates');
  addItem('retryable', 'common');
  loot.awardEventXp('collector', 'create_task');
  db.exec(`CREATE TRIGGER reject_test_claim BEFORE INSERT ON user_inventory
    BEGIN SELECT RAISE(ABORT, 'Test write failed'); END`);
  assert.equal((await request('/inventory/claim', 'POST')).status, 500);
  assert.equal(loot.getPendingDrop('collector').collectibleId, 'retryable', 'Failed writes must retain the pending reward');
  db.exec('DROP TRIGGER reject_test_claim');
  assert.equal((await request('/inventory/claim', 'POST')).status, 201, 'A failed write can be retried');

  // Exercise the actual shared browser wrapper and recovery/claim handlers.
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8').replace(/\r\n/g, '\n');
  const extract = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  const timers = new Map();
  let timerId = 0;
  let pending = first;
  let displayed = null;
  let claimFails = false;
  let resolvePending;
  let delayPending = false;
  const context = vm.createContext({
    token: 'browser-token', console, RECYCLE_CONFIRM_RARITIES: new Set(['epic']),
    window: { confirm: () => true }, gamificationEnabled: false,
    toast() {}, escHtml: s => s, loadInventory() {}, logout() {},
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => {
      if (url.endsWith('/inventory/pending')) {
        const snapshot = pending;
        if (delayPending) await new Promise(resolve => { resolvePending = resolve; });
        return { status: 200, ok: true, json: async () => ({ drop: snapshot }) };
      }
      if (url.endsWith('/inventory/claim')) {
        if (claimFails) return { status: 500, ok: false, json: async () => ({ error: 'Retry claim' }) };
        pending = null;
      }
      if (url.endsWith('/inventory/recycle')) pending = fallback;
      return { status: 200, ok: true, json: async () => ({}) };
    },
  });
  vm.runInContext(extract('async function api(method, path, body)', '// ========== Toast'), context);
  vm.runInContext(extract('let _pendingDrop = null;', '/**\n * Populates and opens the loot-drop modal.'), context);
  vm.runInContext(`function openLootDropModal(drop) { _pendingDrop = drop; displayed(drop); }
    function closeLootDropModal() { _pendingDrop = null; displayed(null); }`, context);
  context.displayed = drop => { displayed = drop; };
  vm.runInContext(extract('async function keepDrop()', '// ========== Collectibles Inventory'), context);
  const flush = async () => {
    const scheduled = [...timers.values()]; timers.clear();
    for (const fn of scheduled) await fn();
  };
  const run = source => vm.runInContext(source, context);
  // All XP-producing routes use this wrapper, even when their handlers ignore drops.
  for (const url of ['/tasks', '/tasks/id/subtasks/sub', '/tasks/id/complete-sporadic', '/groups']) {
    displayed = null;
    await run(`api('POST', '${url}', {})`);
    await flush();
    assert.equal(displayed.collectibleId, first.collectibleId, url + ' must surface pending loot');
  }
  await run('closeLootDropModal(); schedulePendingDropRefresh()');
  await flush();
  assert.equal(displayed.collectibleId, first.collectibleId, 'Reload/startup recovery must restore dismissed loot');
  claimFails = true;
  await run('keepDrop()'); await flush();
  assert.equal(displayed.collectibleId, first.collectibleId, 'Failed claims must remain retryable');
  claimFails = false;
  delayPending = true;
  const staleRefresh = run('refreshPendingDrop()');
  await run('keepDrop()');
  resolvePending(); await staleRefresh;
  assert.equal(displayed, null, 'An old recovery response must not reopen claimed loot');
  delayPending = false;
  await flush();
  assert.equal(displayed, null);
  pending = first;
  await run('refreshPendingDrop();');
  await run('recycleDrop()'); await flush();
  assert.equal(displayed.collectibleId, fallback.collectibleId, 'Recycle XP drops must also be surfaced');
  console.log('Collectible regression checks passed (selection, claims, recovery, browser actions and races).');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  Math.random = originalRandom;
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
