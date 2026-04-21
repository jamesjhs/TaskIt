#!/usr/bin/env node
/**
 * activate-admin.js
 *
 * Emergency CLI tool to activate an admin account when SMTP is not yet
 * configured and you cannot receive the email verification or 2FA OTP codes
 * needed to sign in for the first time.
 *
 * What it does:
 *   1. Locates the target user (by --email, or the first admin, or the first
 *      registered user if no admin exists yet).
 *   2. Marks the account as email-verified and clears any login lockout.
 *   3. Generates a one-time magic-login token (valid for 15 minutes) and
 *      prints the URL to paste into your browser — no email required.
 *
 * Usage (run from the project root or the server/ directory):
 *
 *   node server/activate-admin.js [options]
 *
 * Options:
 *   --email <address>    Target a specific account by email address.
 *                        Defaults to the first admin user in the database,
 *                        or the first registered user if none have the admin
 *                        role yet.
 *
 *   --base-url <url>     Base URL of your TaskIt! instance, e.g.
 *                        https://taskit.example.com
 *                        Defaults to the BASE_URL env var, or
 *                        http://localhost:3000 if neither is set.
 *
 * Environment / .env:
 *   DB_PATH              Path to the SQLite database file.
 *                        Defaults to server/taskit.db (relative to this
 *                        script's directory).
 *   DB_ENCRYPTION_KEY    Decryption passphrase, when the database is
 *                        encrypted with server/encrypt-db.js.
 *   BASE_URL             Fallback base URL (overridden by --base-url).
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

// ── Resolve the server directory ────────────────────────────────────────────

const serverDir = __dirname;

// ── Load .env ────────────────────────────────────────────────────────────────

const dotenvPath = path.join(serverDir, '.env');
if (fs.existsSync(dotenvPath)) {
  require('dotenv').config({ path: dotenvPath });
} else {
  console.warn(`Warning: no .env file found at ${dotenvPath}`);
}

// ── Parse CLI arguments ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
let targetEmail = null;
let baseUrlArg  = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email' && args[i + 1]) {
    targetEmail = args[++i].trim().toLowerCase();
  } else if (args[i] === '--base-url' && args[i + 1]) {
    baseUrlArg = args[++i].replace(/\/$/, '');
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(
      'Usage: node server/activate-admin.js [--email <address>] [--base-url <url>]\n' +
      '\n' +
      '  --email <address>   Target a specific account (default: first admin user)\n' +
      '  --base-url <url>    Base URL of the TaskIt! instance\n' +
      '                      (default: BASE_URL env var, or http://localhost:3000)\n'
    );
    process.exit(0);
  }
}

const baseUrl = baseUrlArg
  || (process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : null)
  || 'http://localhost:3000';

// ── Open the database ────────────────────────────────────────────────────────

const Database = require('better-sqlite3-multiple-ciphers');

const dbPath = process.env.DB_PATH || path.join(serverDir, 'taskit.db');

if (!fs.existsSync(dbPath)) {
  console.error(`Error: database file not found: ${dbPath}`);
  console.error('Start the server at least once to initialise the database, then run this script.');
  process.exit(1);
}

let db;
try {
  db = new Database(dbPath);

  const encryptionKey = process.env.DB_ENCRYPTION_KEY;
  if (encryptionKey) {
    const hexKey = Buffer.from(encryptionKey, 'utf8').toString('hex');
    db.pragma(`key = "x'${hexKey}'"`);
  }

  // Confirm the database is readable
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.error('Error: could not open the database:', err.message);
  if (process.env.DB_ENCRYPTION_KEY) {
    console.error('Check that DB_ENCRYPTION_KEY is correct.');
  } else {
    console.error('If the database is encrypted, set DB_ENCRYPTION_KEY in server/.env.');
  }
  process.exit(1);
}

// ── Find the target user ─────────────────────────────────────────────────────

let user;

if (targetEmail) {
  user = db.prepare(
    'SELECT id, username, email, role FROM users WHERE email = ?'
  ).get(targetEmail);

  if (!user) {
    console.error(`Error: no user found with email "${targetEmail}".`);
    process.exit(1);
  }
} else {
  // Default: first admin user, falling back to the first registered user
  user = db.prepare(
    "SELECT id, username, email, role FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1"
  ).get();

  if (!user) {
    user = db.prepare(
      'SELECT id, username, email, role FROM users ORDER BY created_at ASC LIMIT 1'
    ).get();
  }

  if (!user) {
    console.error('Error: no users found in the database.');
    console.error('Register an account through the app first, then run this script.');
    process.exit(1);
  }
}

// ── Activate the account ─────────────────────────────────────────────────────

// Mark email as verified and clear any lockout so the login can proceed
db.prepare(
  'UPDATE users SET email_verified = 1, failed_logins = 0, locked_until = NULL WHERE id = ?'
).run(user.id);

// ── Generate a one-time magic login token ─────────────────────────────────────

// 32 random bytes = 256 bits of entropy; collision probability is negligible.
// The token is passed as a URL query parameter (?token=…), consistent with how
// the application's own magic-link emails work.  As with any magic-link flow,
// be aware that the token may appear in browser history and server access logs —
// open the link in a private/incognito window and close it promptly after use.
const token     = crypto.randomBytes(32).toString('hex');
const now       = Date.now();
const expiresAt = now + 15 * 60 * 1000; // 15 minutes

try {
  db.prepare(
    'INSERT INTO magic_tokens (token, user_id, expires_at, used, created_at, purpose) VALUES (?, ?, ?, 0, ?, ?)'
  ).run(token, user.id, expiresAt, now, 'login');
} catch (insertErr) {
  console.error('Error: failed to create a login token:', insertErr.message);
  console.error('Ensure the database schema is up to date by starting the server at least once.');
  db.close();
  process.exit(1);
}

db.close();

// ── Print the result ─────────────────────────────────────────────────────────

const loginUrl = `${baseUrl}/?token=${token}`;

console.log('');
console.log('✅  Account activated successfully!');
console.log('');
console.log(`    Username : ${user.username}`);
console.log(`    Email    : ${user.email}`);
console.log(`    Role     : ${user.role}`);
console.log('');
console.log('One-time login link (valid for 15 minutes):');
console.log('');
console.log(`    ${loginUrl}`);
console.log('');
console.log('Paste the URL above into your browser to sign in.');
console.log('Once logged in, go to Admin → SMTP Settings to configure email.');
console.log('');
