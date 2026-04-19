import Database from 'better-sqlite3-multiple-ciphers';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DB_PATH as DB_PATH_OVERRIDE, DB_ENCRYPTION_KEY } from './config';
import { generateGroupName } from './wordlists';

const DB_PATH = DB_PATH_OVERRIDE || path.join(__dirname, '..', 'jobber.db');

const db = new Database(DB_PATH);

// Enable SQLite3MultipleCiphers encryption when a key is configured.
// PRAGMA key must be the very first operation after opening the file.
// Use the x'...' raw-key form so the key bytes are passed directly without a
// KDF — hex digits [0-9a-f] cannot contain SQL metacharacters, so this is
// injection-safe regardless of the key content.
if (DB_ENCRYPTION_KEY) {
  const hexKey = Buffer.from(DB_ENCRYPTION_KEY, 'utf8').toString('hex');
  db.pragma(`key = "x'${hexKey}'"`);
}

try {
  db.pragma('journal_mode = WAL');
} catch (err: unknown) {
  if ((err as { code?: string }).code === 'SQLITE_NOTADB') {
    if (DB_ENCRYPTION_KEY) {
      console.error(
        `\nFATAL: DB_ENCRYPTION_KEY is set but the database at\n  ${DB_PATH}\n` +
        'cannot be decrypted with that key.\n\n' +
        'If this is an existing plaintext database that has not yet been\n' +
        'encrypted, migrate it first:\n\n' +
        '  node server/encrypt-db.js\n\n' +
        'Then replace the original database file with the encrypted output\n' +
        'and restart the server.\n',
      );
    } else {
      console.error(
        `\nFATAL: The database at\n  ${DB_PATH}\n` +
        'cannot be read as a plain SQLite database.\n\n' +
        'If the database has been encrypted, set DB_ENCRYPTION_KEY in\n' +
        'server/.env to the passphrase used when it was encrypted, then\n' +
        'restart the server.\n',
      );
    }
  }
  throw err;
}
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    shared_key TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS task_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_id TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    details TEXT,
    type_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    created_by TEXT NOT NULL,
    group_id TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (type_id) REFERENCES task_types(id)
  );

  CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (task_id, user_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS smtp_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    host TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 587,
    secure INTEGER NOT NULL DEFAULT 0,
    username TEXT NOT NULL DEFAULT '',
    pass TEXT NOT NULL DEFAULT '',
    from_addr TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS otp_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS magic_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    reported_id TEXT NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (reporter_id) REFERENCES users(id),
    FOREIGN KEY (reported_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id),
    FOREIGN KEY (blocked_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS task_notes (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS task_reminders_sent (
    task_id TEXT NOT NULL,
    reminder_type TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    PRIMARY KEY (task_id, reminder_type),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
  );

  CREATE TABLE IF NOT EXISTS group_invites (
    token TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    invited_email TEXT,
    multi_use INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS feedback_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    contact_ok INTEGER NOT NULL DEFAULT 0,
    read_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    read_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Gamification: per-user skill progress mapped from task_types
  CREATE TABLE IF NOT EXISTS user_skills (
    user_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, skill_name),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Gamification: master catalogue of available achievements
  CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Gamification: junction table of achievements unlocked by each user
  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, achievement_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (achievement_id) REFERENCES achievements(id)
  );
`);

// Runtime migrations — add columns if they don't exist yet
const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function columnExists(table: string, col: string): boolean {
  if (!VALID_IDENTIFIER.test(table) || !VALID_IDENTIFIER.test(col)) {
    throw new Error(`Invalid identifier: table="${table}", col="${col}"`);
  }
  const infos = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  return infos.some(r => r.name === col);
}
function addCol(table: string, col: string, def: string) {
  if (!VALID_IDENTIFIER.test(table) || !VALID_IDENTIFIER.test(col)) {
    throw new Error(`Invalid identifier: table="${table}", col="${col}"`);
  }
  if (!columnExists(table, col)) db.exec(`ALTER TABLE "${table}" ADD COLUMN ${col} ${def}`);
}

addCol('users', 'role', "TEXT NOT NULL DEFAULT 'user'");
addCol('users', 'failed_logins', 'INTEGER NOT NULL DEFAULT 0');
addCol('users', 'locked_until', 'INTEGER');
// email_verified defaults to 1 so existing users stay accessible; new registrations set it to 0 explicitly
addCol('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 1');
// locale defaults to en-GB (British English) for all users including existing accounts
addCol('users', 'locale', "TEXT NOT NULL DEFAULT 'en-GB'");
addCol('users', 'last_active_at', 'INTEGER');
addCol('tasks', 'due_date', 'INTEGER');
// invite_name is the auto-generated two-word CamelCase pair (e.g. FastAntelope) used for joining
addCol('groups', 'invite_name', "TEXT NOT NULL DEFAULT ''");
addCol('feedback_messages', 'status', "TEXT NOT NULL DEFAULT 'not_started'");
addCol('users', 'ics_token', 'TEXT');
addCol('tasks', 'recur_interval', 'INTEGER');
addCol('tasks', 'recur_unit', 'TEXT');
// Per-task notification preferences
// Email: master switch + per-timing flags
addCol('tasks', 'notify_email', 'INTEGER NOT NULL DEFAULT 1');
addCol('tasks', 'notify_7day', 'INTEGER NOT NULL DEFAULT 1');
addCol('tasks', 'notify_1day', 'INTEGER NOT NULL DEFAULT 1');
// notify_overdue is kept for schema compatibility but is no longer used by new tasks
addCol('tasks', 'notify_overdue', 'INTEGER NOT NULL DEFAULT 0');
addCol('tasks', 'notify_onday', 'INTEGER NOT NULL DEFAULT 1');
// Browser popup notification flags (off by default)
addCol('tasks', 'notify_popup_7day', 'INTEGER NOT NULL DEFAULT 0');
addCol('tasks', 'notify_popup_1day', 'INTEGER NOT NULL DEFAULT 0');
addCol('tasks', 'notify_popup_onday', 'INTEGER NOT NULL DEFAULT 0');
// purpose column on magic_tokens distinguishes login / verify / reset flows
addCol('magic_tokens', 'purpose', "TEXT NOT NULL DEFAULT 'login'");
// Gamification opt-in flag on user profiles (off by default)
addCol('users', 'gamification_enabled', 'INTEGER NOT NULL DEFAULT 0');
// Backfill existing groups: generate a proper unique invite word pair for any group that lacks one
{
  const ungrouped = db.prepare("SELECT id FROM groups WHERE invite_name = ''").all() as Array<{ id: string }>;
  const update = db.prepare('UPDATE groups SET invite_name = ? WHERE id = ?');
  for (const row of ungrouped) {
    let candidate: string;
    let attempts = 0;
    do {
      if (++attempts > 1000) throw new Error('Could not generate a unique invite_name after 1000 attempts');
      candidate = generateGroupName();
    } while (db.prepare('SELECT 1 FROM groups WHERE invite_name = ?').get(candidate));
    update.run(candidate, row.id);
  }
}

// Ensure smtp_settings has exactly one row (singleton pattern)
const smtpRow = db.prepare('SELECT id FROM smtp_settings WHERE id = 1').get();
if (!smtpRow) {
  db.prepare(`INSERT INTO smtp_settings (id, host, port, secure, username, pass, from_addr, enabled, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    process.env.SMTP_HOST || '',
    parseInt(process.env.SMTP_PORT || '587', 10),
    process.env.SMTP_SECURE === 'true' ? 1 : 0,
    process.env.SMTP_USER || '',
    process.env.SMTP_PASS || '',
    process.env.SMTP_FROM || process.env.SMTP_USER || '',
    0,
    Date.now()
  );
}

// Seed default task types if not present
const defaultTypes = [
  'Urgent', 'Routine', 'Hobby', 'Household',
  'Kids', 'Financial', 'Vehicle', 'Leisure',
];

const countRow = db.prepare('SELECT COUNT(*) as cnt FROM task_types WHERE group_id IS NULL').get() as { cnt: number };

if (countRow.cnt === 0) {
  const insert = db.prepare(
    'INSERT INTO task_types (id, name, group_id, created_by, created_at) VALUES (?, ?, NULL, NULL, ?)'
  );
  const now = Date.now();
  for (const name of defaultTypes) {
    insert.run(uuidv4(), name, now);
  }
}

// Seed default achievements catalogue if not present
const achievementCountRow = db.prepare('SELECT COUNT(*) as cnt FROM achievements').get() as { cnt: number };
if (achievementCountRow.cnt === 0) {
  const insertAchievement = db.prepare(
    'INSERT INTO achievements (id, key, name, description, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const now = Date.now();
  const defaultAchievements: Array<{ key: string; name: string; description: string }> = [
    { key: 'first_task',        name: 'First Steps',      description: 'Complete your first task.' },
    { key: 'task_10',           name: 'Getting Started',  description: 'Complete 10 tasks.' },
    { key: 'task_50',           name: 'On a Roll',        description: 'Complete 50 tasks.' },
    { key: 'task_100',          name: 'Centurion',        description: 'Complete 100 tasks.' },
    { key: 'task_500',          name: 'Task Master',      description: 'Complete 500 tasks.' },
    { key: 'detail_oriented',   name: 'Detail Oriented',  description: 'Add 50 progress notes across all tasks.' },
    { key: 'early_bird',        name: 'Early Bird',       description: 'Complete 10 tasks before their due date.' },
    { key: 'type_explorer',     name: 'Type Explorer',    description: 'Complete tasks across 5 different task types.' },
    { key: 'skill_level_5',     name: 'Specialist',       description: 'Reach level 5 in any skill.' },
    { key: 'skill_level_10',    name: 'Master of the Craft', description: 'Reach level 10 in any skill.' },
  ];
  for (const a of defaultAchievements) {
    insertAchievement.run(uuidv4(), a.key, a.name, a.description, now);
  }
}

export default db;
