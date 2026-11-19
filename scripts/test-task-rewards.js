// Simulate real completion/claim requests without touching the application database.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

process.env.DB_PATH = ':memory:';
process.env.DB_ENCRYPTION_KEY = '';
process.env.JWT_SECRET = 'task-reward-simulation-only';
const db = require('../server/dist/db').default;
const loot = require('../server/dist/services/gamification');
const express = require('express');
const jwt = require('jsonwebtoken');
const originalRandom = Math.random;
const originalNow = Date.now;
let server;

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', require('../server/dist/routes/tasks').default);
  app.use('/api/gamification', require('../server/dist/routes/gamification').default);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const now = Date.now();
  Date.now = () => now; // Keep the reward eligibility boundary exact during requests.
  db.prepare("INSERT INTO item_categories (id, name, created_at) VALUES ('rewards', 'Rewards', ?)").run(now);
  for (let i = 0; i < 6; i++) {
    db.prepare(`INSERT INTO collectibles (id, name, category_id, rarity, created_at)
      VALUES (?, ?, 'rewards', 'common', ?)`).run('reward-' + i, 'Reward ' + i, now);
  }
  const types = db.prepare('SELECT id, name FROM task_types ORDER BY name').all();
  const addUser = (enabled = 1) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO users (id, username, email, password_hash, created_at, gamification_enabled)
      VALUES (?, ?, ?, 'unused', ?, ?)`).run(id, id, id + '@example.test', now, enabled);
    return id;
  };
  const request = async (user, url, method = 'GET', body) => {
    const token = jwt.sign({ id: user, token_version: 0 }, process.env.JWT_SECRET);
    const response = await fetch(base + url, {
      method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.ok, true, `${method} ${url}: ${JSON.stringify(data)}`);
    return data;
  };
  const addTask = (creator, type, options = {}) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO tasks
      (id, title, type_id, created_by, group_id, created_at, updated_at, recur_interval, recur_unit, is_sporadic, is_long_term_goal)
      VALUES (?, 'Simulation task', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, type, creator, options.group || null, now - (options.ageMs ?? (options.fresh ? 0 : 20000)), now,
        options.recurring ? 1 : null, options.recurring ? 'days' : null,
        options.sporadic ? 1 : 0, options.goal ? 1 : 0);
    return id;
  };
  const xp = user => db.prepare('SELECT COALESCE(SUM(xp), 0) AS n FROM user_skills WHERE user_id = ?').get(user).n;
  const inventory = user => db.prepare('SELECT collectible_id FROM user_inventory WHERE user_id = ?').all(user);
  const simulateFive = async (label, options = {}) => {
    const creator = addUser(options.enabled ?? 1);
    let user = creator;
    let group;
    if (options.group) {
      group = randomUUID();
      user = addUser();
      db.prepare("INSERT INTO groups (id, name, shared_key, created_by, created_at) VALUES (?, 'Simulation', ?, ?, ?)")
        .run(group, group, creator, now);
      for (const member of [creator, user]) {
        db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(group, member, now);
      }
    }
    Math.random = () => options.miss ? 0.999 : 0;
    for (let i = 0; i < 5; i++) {
      const task = addTask(creator, types[i % types.length].id, { ...options, group });
      if (group) db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)').run(task, user);
      if (options.timed) await request(user, `/tasks/${task}/status`, 'PATCH', { status: 'started', timeLimitMinutes: 5 });
      const result = await request(user, options.sporadic ? `/tasks/${task}/complete-sporadic` : `/tasks/${task}/status`,
        options.sporadic ? 'PUT' : 'PATCH', options.sporadic ? {} : { status: 'complete' });
      const earns = options.enabled !== 0 && Boolean(
        (options.ageMs ?? (options.fresh ? 0 : 20000)) >= 20000 || options.recurring || options.sporadic);
      const drops = earns && !options.miss && !options.empty;
      assert.equal(Boolean(result.drop), drops, label + ': completion response');
      const pending = await request(user, '/gamification/inventory/pending');
      assert.equal(Boolean(pending.drop), drops, label + ': recoverable reward');
      if (drops) {
        await request(user, '/gamification/inventory/claim', 'POST');
        assert.equal(loot.getPendingDrop(user), null);
      }
      if (!options.sporadic) {
        const before = xp(user);
        const repeated = await request(user, `/tasks/${task}/status`, 'PATCH', { status: 'complete' });
        assert.equal(xp(user), before, label + ': repeat completion must not award XP');
        assert.equal(Boolean(repeated.drop), false, label + ': repeat completion must not drop loot');
      }
    }
    const earns = options.enabled !== 0 && Boolean(
      (options.ageMs ?? (options.fresh ? 0 : 20000)) >= 20000 || options.recurring || options.sporadic);
    assert.equal(xp(user), earns ? (options.timed ? 500 : 250) : 0, label + ': XP total');
    const owned = inventory(user);
    assert.equal(owned.length, earns && !options.miss && !options.empty ? 5 : 0, label + ': inventory');
    assert.equal(new Set(owned.map(item => item.collectible_id)).size, owned.length);
    if (group) assert.equal(xp(creator), 0, 'Group rewards belong to the completing assignee');
    console.log(`${label}: 5 completions, ${xp(user)} XP, ${owned.length} collectibles claimed`);
  };

  await simulateFive('Fresh non-recurring tasks (reported failure)', { fresh: true });
  await simulateFive('Non-recurring tasks just before 20 seconds', { ageMs: 19999 });
  await simulateFive('Non-recurring tasks at exactly 20 seconds', { ageMs: 20000 });
  await simulateFive('Eligible mixed task categories');
  await simulateFive('Fresh recurring tasks', { recurring: true, fresh: true });
  await simulateFive('Sporadic tasks', { sporadic: true, fresh: true });
  await simulateFive('Long-term goals', { goal: true });
  await simulateFive('Timed tasks', { timed: true });
  await simulateFive('Group tasks completed by assignee', { group: true });
  await simulateFive('Gamification disabled', { enabled: 0 });
  await simulateFive('Eligible tasks with five random misses', { miss: true });
  // Exercise every seeded category, including those outside the mixed five above.
  for (const type of types) {
    const user = addUser();
    Math.random = () => 0;
    const task = addTask(user, type.id);
    const result = await request(user, `/tasks/${task}/status`, 'PATCH', { status: 'complete' });
    assert.ok(result.drop, type.name + ' must support collectibles');
    await request(user, '/gamification/inventory/claim', 'POST');
    assert.equal(inventory(user).length, 1);
  }
  console.log(`All ${types.length} seeded task categories support acquisition.`);
  db.prepare('UPDATE item_categories SET archived = 1').run();
  await simulateFive('No active catalogue', { empty: true });
  console.log('Task completion reward simulations passed. Random rolls are controlled; no live data changed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  Math.random = originalRandom;
  Date.now = originalNow;
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
