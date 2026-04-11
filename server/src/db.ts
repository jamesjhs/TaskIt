import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'jobber.db');

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
`);

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
    const { v4: uuidv4 } = require('uuid');
    insert.run(uuidv4(), name, now);
  }
}

export default db;
