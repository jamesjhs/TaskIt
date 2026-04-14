#!/usr/bin/env node
/**
 * encrypt-db.js
 *
 * Migrates an existing plaintext Jobber SQLite database to an encrypted one
 * using SQLCipher (via better-sqlite3-multiple-ciphers).
 *
 * Usage (run from the project root or the server/ directory):
 *
 *   node server/encrypt-db.js [source] [destination]
 *
 * Arguments (both optional):
 *   source       – path to the existing plaintext database
 *                  (default: server/jobber.db)
 *   destination  – path for the new encrypted database
 *                  (default: server/jobber-encrypted.db)
 *
 * The DB_ENCRYPTION_KEY value is read from server/.env (or the environment).
 *
 * After a successful run:
 *   1. Verify the encrypted database starts correctly.
 *   2. Replace server/jobber.db with server/jobber-encrypted.db.
 *   3. Ensure DB_ENCRYPTION_KEY is set in server/.env.
 *   4. Restart the server.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// Resolve paths relative to this script's directory so the script works
// whether invoked from the project root or from server/.
const serverDir = __dirname;

// Load .env from server/.env before reading any env vars.
const dotenvPath = path.join(serverDir, '.env');
if (fs.existsSync(dotenvPath)) {
  require('dotenv').config({ path: dotenvPath });
} else {
  console.warn(`Warning: no .env file found at ${dotenvPath}`);
}

const Database = require('better-sqlite3-multiple-ciphers');

// ── Resolve source and destination paths ────────────────────────────────────

const defaultSource = path.join(serverDir, 'jobber.db');
const defaultDest   = path.join(serverDir, 'jobber-encrypted.db');

const sourcePath = path.resolve(process.argv[2] || defaultSource);
const destPath   = path.resolve(process.argv[3] || defaultDest);

// ── Validate inputs ──────────────────────────────────────────────────────────

const encryptionKey = process.env.DB_ENCRYPTION_KEY;
if (!encryptionKey) {
  console.error('Error: DB_ENCRYPTION_KEY is not set in the environment or server/.env.');
  console.error('Set it to the passphrase you want to use for encryption before running this script.');
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) {
  console.error(`Error: source database not found: ${sourcePath}`);
  process.exit(1);
}

if (fs.existsSync(destPath)) {
  console.error(`Error: destination file already exists: ${destPath}`);
  console.error('Remove or rename it before running this script.');
  process.exit(1);
}

// Convert the passphrase to hex — this matches the x'...' raw-key format
// used by the server in src/db.ts.  Buffer.from(...).toString('hex') produces
// only lowercase [0-9a-f] characters, so the result is safe to interpolate
// into both the SQL KEY clause and the x'...' pragma value.
const hexKey = Buffer.from(encryptionKey, 'utf8').toString('hex');
if (!/^[0-9a-f]+$/.test(hexKey)) {
  // Defensive guard — should never trigger given the Buffer conversion above.
  console.error('Error: hex key contains unexpected characters. Aborting.');
  process.exit(1);
}

// ── Run the migration ────────────────────────────────────────────────────────

console.log(`Source:      ${sourcePath}`);
console.log(`Destination: ${destPath}`);
console.log('Migrating …');

let db;
try {
  db = new Database(sourcePath, { readonly: true });

  // ATTACH the destination database and set its key via PRAGMA before export.
  // hexKey contains only [0-9a-f] characters (validated above), so it cannot
  // contain SQL metacharacters and is safe to interpolate into the KEY clause.
  db.exec(`ATTACH DATABASE '${destPath.replace(/'/g, "''")}' AS encrypted KEY "x'${hexKey}'";`);
  db.exec(`SELECT sqlcipher_export('encrypted');`);
  db.exec(`DETACH DATABASE encrypted;`);

  // Shell-quote a path for safe inclusion in printed commands.
  // Wraps the path in single quotes and escapes any embedded single quotes.
  const sq = (p) => `'${p.replace(/'/g, "'\\''")}'`;

  console.log('Done.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Verify the encrypted database opens correctly:');
  // hexKey is [0-9a-f] only (validated above) so no shell escaping needed for it.
  console.log(`       node -e "const D=require('better-sqlite3-multiple-ciphers'); const db=new D(${sq(destPath)}); db.pragma(\\"key = \\\\"x'${hexKey}'\\\\"\\"); console.log(db.prepare('SELECT count(*) as n FROM sqlite_master').get());"`);
  console.log(`  2. Back up your original: cp ${sq(sourcePath)} ${sq(sourcePath + '.bak')}`);
  console.log(`  3. Replace the database:  mv ${sq(destPath)} ${sq(sourcePath)}`);
  console.log('  4. Ensure DB_ENCRYPTION_KEY is set in server/.env, then restart the server.');
} catch (err) {
  console.error('Migration failed:', err.message);
  // Remove a partially written destination file to avoid leaving corrupt data.
  if (fs.existsSync(destPath)) {
    try {
      fs.unlinkSync(destPath);
      console.error('Partial destination file removed.');
    } catch (unlinkErr) {
      if (unlinkErr.code !== 'ENOENT') {
        console.error('Could not remove partial destination file:', unlinkErr.message);
      }
    }
  }
  process.exit(1);
} finally {
  if (db) db.close();
}
