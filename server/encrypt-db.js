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
// used by the server in src/db.ts.
const hexKey = Buffer.from(encryptionKey, 'utf8').toString('hex');

// ── Run the migration ────────────────────────────────────────────────────────

console.log(`Source:      ${sourcePath}`);
console.log(`Destination: ${destPath}`);
console.log('Migrating …');

let db;
try {
  db = new Database(sourcePath, { readonly: true });

  // ATTACH the destination database and set its key via PRAGMA before export.
  // The x'hex' form is the SQLCipher raw-key syntax; hex digits cannot contain
  // SQL metacharacters, so this is injection-safe regardless of passphrase content.
  db.exec(`ATTACH DATABASE '${destPath.replace(/'/g, "''")}' AS encrypted KEY "x'${hexKey}'";`);
  db.exec(`SELECT sqlcipher_export('encrypted');`);
  db.exec(`DETACH DATABASE encrypted;`);

  console.log('Done.');
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Verify the encrypted database opens correctly:`);
  console.log(`       node -e "const D=require('better-sqlite3-multiple-ciphers'); const db=new D('${destPath}'); db.pragma(\\"key = \\\\"x'${hexKey}'\\\\"\\"); console.log(db.prepare('SELECT count(*) as n FROM sqlite_master').get());"`);
  console.log(`  2. Back up your original: cp ${sourcePath} ${sourcePath}.bak`);
  console.log(`  3. Replace the database:  mv ${destPath} ${sourcePath}`);
  console.log(`  4. Ensure DB_ENCRYPTION_KEY is set in server/.env, then restart the server.`);
} catch (err) {
  console.error('Migration failed:', err.message);
  // Remove a partially written destination file to avoid leaving corrupt data.
  if (fs.existsSync(destPath)) {
    try { fs.unlinkSync(destPath); } catch (_) {}
    console.error('Partial destination file removed.');
  }
  process.exit(1);
} finally {
  if (db) db.close();
}
