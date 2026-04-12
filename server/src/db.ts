import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DB_PATH as DB_PATH_OVERRIDE } from './config';
import { generateGroupName } from './wordlists';

const DB_PATH = DB_PATH_OVERRIDE || path.join(__dirname, '..', 'jobber.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
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

export default db;
