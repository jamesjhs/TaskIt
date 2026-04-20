#!/usr/bin/env node
/**
 * encrypt-db.js
 *
 * Migrates an existing plaintext Crystallise SQLite database to an encrypted one
 * using SQLCipher (via better-sqlite3-multiple-ciphers).
 *
 * Usage (run from the project root or the server/ directory):
 *
 *   node server/encrypt-db.js [source] [destination]
 *
 * Arguments (both optional):
 *   source       – path to the existing plaintext database
 *                  (default: server/crystallise.db)
 *   destination  – path for the new encrypted database
 *                  (default: server/crystallise-encrypted.db)
 *
 * The DB_ENCRYPTION_KEY value is read from server/.env (or the environment).
 *
 * After a successful run:
 *   1. Verify the encrypted database starts correctly.
 *   2. Replace server/crystallise.db with server/crystallise-encrypted.db.
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

const defaultSource = path.join(serverDir, 'crystallise.db');
const defaultDest   = path.join(serverDir, 'crystallise-encrypted.db');

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

// Shell-quote a path for safe inclusion in printed commands.
// Wraps the path in single quotes and escapes any embedded single quotes.
const sq = (p) => `'${p.replace(/'/g, "'\\''")}'`;

// Use the SQLite online backup API to create an exact copy of the source, then
// apply rekey() to encrypt the copy in-place.  This avoids sqlcipher_export,
// which is a pure-SQLCipher C function not provided by SQLite3MultipleCiphers.

// Remove the (possibly partial) destination file on error, ignoring ENOENT.
function removeDestOnError() {
  try {
    fs.unlinkSync(destPath);
    console.error('Partial destination file removed.');
  } catch (unlinkErr) {
    if (unlinkErr.code !== 'ENOENT') {
      console.error('Could not remove partial destination file:', unlinkErr.message);
    }
  }
}

(async () => {
  let src;
  try {
    src = new Database(sourcePath);
    await src.backup(destPath);
  } catch (err) {
    console.error('Migration failed:', err.message);
    removeDestOnError();
    process.exit(1);
  } finally {
    if (src) src.close();
  }

  // The backup is now a plaintext copy.  Encrypt it in-place with rekey().
  // rekey() calls sqlite3_rekey() with the raw key bytes, which is equivalent
  // to PRAGMA rekey = "x'hexKey'" — matching exactly how db.ts opens the
  // database with PRAGMA key = "x'hexKey'".
  let dest;
  try {
    dest = new Database(destPath);
    // Use PRAGMA rekey with the x'...' raw-key format so the encrypted database
    // can be opened by db.ts using PRAGMA key = "x'hexKey'" (same raw-key path,
    // no KDF).  rekey(Buffer) would instead apply a KDF and produce an
    // incompatible database.
    dest.pragma(`rekey = "x'${hexKey}'"`);
  } catch (err) {
    console.error('Migration failed:', err.message);
    removeDestOnError();
    process.exit(1);
  } finally {
    if (dest) dest.close();
  }

  console.log('Done.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Verify the encrypted database opens correctly:');
  // hexKey is [0-9a-f] only (validated above) so no shell escaping needed for it.
  console.log(`       node -e "const D=require('better-sqlite3-multiple-ciphers'); const db=new D(${sq(destPath)}); db.pragma(\\"key = \\\\"x'${hexKey}'\\\\"\\"); console.log(db.prepare('SELECT count(*) as n FROM sqlite_master').get());"`);
  console.log(`  2. Back up your original: cp ${sq(sourcePath)} ${sq(sourcePath + '.bak')}`);
  console.log(`  3. Replace the database:  mv ${sq(destPath)} ${sq(sourcePath)}`);
  console.log('  4. Ensure DB_ENCRYPTION_KEY is set in server/.env, then restart the server.');
})();
