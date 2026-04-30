# TaskIt! — Technical Reference Manual

**Version:** 1.12.1  
**Author:** J Rowson  
**Generated:** 2026-04-28

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [Runtime Architecture & Data Flow](#2-runtime-architecture--data-flow)
3. [Environment Variables & Configuration](#3-environment-variables--configuration)
4. [Database Schema](#4-database-schema)
   - 4.1 [Core Tables](#41-core-tables)
   - 4.2 [Authentication & Security Tables](#42-authentication--security-tables)
   - 4.3 [Social & Moderation Tables](#43-social--moderation-tables)
   - 4.4 [Gamification Tables](#44-gamification-tables)
   - 4.5 [Communication & Messaging Tables](#45-communication--messaging-tables)
   - 4.6 [Runtime Migrations (addCol)](#46-runtime-migrations-addcol)
   - 4.7 [Seeded Data](#47-seeded-data)
5. [Server — Node.js/Express](#5-server--nodejsexpress)
   - 5.1 [Entry Point](#51-entry-point-serverindexts)
   - 5.2 [Rate Limiters](#52-rate-limiters)
   - 5.3 [Middleware](#53-middleware)
   - 5.4 [API Route Map](#54-api-route-map)
   - 5.5 [Special HTTP Endpoints](#55-special-http-endpoints)
6. [Server Route Files — Functions & Variables](#6-server-route-files--functions--variables)
   - 6.1 [routes/auth.ts](#61-routesauthts)
   - 6.2 [routes/tasks.ts](#62-routestasksts)
   - 6.3 [routes/groups.ts](#63-routesgroupsts)
   - 6.4 [routes/taskTypes.ts](#64-routestasktypests)
   - 6.5 [routes/users.ts](#65-routesusersts)
   - 6.6 [routes/gamification.ts](#66-routesgamificationts)
   - 6.7 [routes/friends.ts](#67-routesfriendsts)
   - 6.8 [routes/admin.ts](#68-routesadmints)
7. [Services](#7-services)
   - 7.1 [services/gamification.ts](#71-servicesgamificationts)
   - 7.2 [services/mail.ts](#72-servicesmailts)
   - 7.3 [services/scheduler.ts](#73-servicesschedulerts)
8. [Middleware Files](#8-middleware-files)
   - 8.1 [middleware/auth.ts](#81-middlewareauthts)
   - 8.2 [middleware/admin.ts](#82-middlewareadmints)
9. [Configuration & Constants Files](#9-configuration--constants-files)
   - 9.1 [config.ts](#91-configts)
   - 9.2 [constants.ts](#92-constantsts)
   - 9.3 [wordlists.ts](#93-wordliststs)
10. [Frontend SPA — public/index.html](#10-frontend-spa--publicindexhtml)
    - 10.1 [Global State Variables](#101-global-state-variables)
    - 10.2 [Constants](#102-constants)
    - 10.3 [Function Catalogue](#103-function-catalogue)
    - 10.4 [Key HTML Element IDs](#104-key-html-element-ids)
    - 10.5 [Pages / Views](#105-pages--views)
    - 10.6 [Authentication & Session Flow](#106-authentication--session-flow)
    - 10.7 [Storage Keys](#107-storage-keys)
11. [Frontend JS Files (public/js/)](#11-frontend-js-files-publicjs)
12. [Service Worker (public/sw.js)](#12-service-worker-publicswjs)
13. [PWA Manifest (public/manifest.json)](#13-pwa-manifest-publicmanifestjson)
14. [Gamification Engine — Detailed Mechanics](#14-gamification-engine--detailed-mechanics)
    - 14.1 [XP Events Catalogue](#141-xp-events-catalogue)
    - 14.2 [Achievements Catalogue](#142-achievements-catalogue)
    - 14.3 [Level Formula](#143-level-formula)
    - 14.4 [Streak System](#144-streak-system)
    - 14.5 [Title Tiers](#145-title-tiers)
15. [Email / SMTP System](#15-email--smtp-system)
16. [Recurring Tasks — Spawn Logic](#16-recurring-tasks--spawn-logic)
17. [ICS Calendar Feed](#17-ics-calendar-feed)
18. [Android App](#18-android-app)
19. [Scripts Directory](#19-scripts-directory)
20. [Build System & NPM Scripts](#20-build-system--npm-scripts)
21. [Security Model Summary](#21-security-model-summary)
22. [Inter-component Data Flow Diagrams](#22-inter-component-data-flow-diagrams)

---

## 1. Repository Structure

```
TaskIt/
├── HOWTO.md                    # Deployment & ops guide
├── README.md                   # Project overview
├── USER_GUIDE.md               # End-user documentation
├── TECHNICAL_REFERENCE.md      # This file
│
├── server/                     # Node.js/Express backend (TypeScript)
│   ├── .env.example            # Environment variable template
│   ├── encrypt-db.js           # Offline DB encryption migration utility
│   ├── package.json            # Server dependencies & scripts
│   ├── package-lock.json
│   ├── tailwind.config.js      # Tailwind CSS config (for frontend CSS build)
│   ├── tsconfig.json           # TypeScript compiler config
│   └── src/
│       ├── index.ts            # Express app entry point
│       ├── config.ts           # Environment variable parsing & exports
│       ├── constants.ts        # Allowed BCP-47 locale tags
│       ├── db.ts               # SQLite init, schema, migrations, seed data
│       ├── wordlists.ts        # Word arrays + name generation helpers
│       ├── css/
│       │   └── input.css       # Tailwind CSS input (compiled → public/tailwind.css)
│       ├── middleware/
│       │   ├── auth.ts         # JWT verification middleware (authMiddleware)
│       │   └── admin.ts        # Role check middleware (adminMiddleware)
│       ├── routes/
│       │   ├── auth.ts         # /api/auth/* — registration, login, OTP, magic links
│       │   ├── tasks.ts        # /api/tasks/* — task CRUD, notes, status changes
│       │   ├── groups.ts       # /api/groups/* — group management, invites
│       │   ├── taskTypes.ts    # /api/task-types/* — task type CRUD
│       │   ├── users.ts        # /api/users/* — profile, blocks, alerts, ICS token
│       │   ├── gamification.ts # /api/gamification/* — profile, achievements, streaks
│       │   ├── friends.ts      # /api/friends/* — friend keys, invites, list
│       │   └── admin.ts        # /api/admin/* — SMTP, users, reports, xp-events
│       └── services/
│           ├── gamification.ts # XP engine, achievements, streak maths
│           ├── mail.ts         # Nodemailer transporter & email templates
│           └── scheduler.ts    # Cron job for reminders & streak resets
│
├── public/                     # Frontend SPA (static files served by Express)
│   ├── index.html              # Single-page application shell (HTML + all inline JS)
│   ├── app.css                 # Hand-written CSS (layout, components)
│   ├── tailwind.css            # Generated Tailwind CSS (built from server/src/css/input.css)
│   ├── sw.js                   # Service Worker (cache-first PWA)
│   ├── manifest.json           # PWA web app manifest
│   ├── favicon.png
│   ├── apple-touch-icon.png
│   ├── howto.html              # Static how-to page
│   ├── privacy-policy.html     # Static privacy policy page
│   ├── user-guide.html         # Static user guide page
│   └── js/
│       ├── version.js          # Fetches /api/version and populates .page-version elements
│       ├── qrcode.js           # QR code generator library
│       ├── game-hangman.js     # Hangman arcade mini-game (arcade unlock feature)
│       ├── game-wordsearch.js  # Wordsearch arcade mini-game
│       ├── game-code-breaker.js # Code Breaker arcade mini-game
│       └── game-whac-a-bug.js  # Whac-a-Bug arcade mini-game
│   └── icons/                  # PWA icons (72×72 to 512×512 PNG)
│
├── android/                    # Android WebView wrapper app (Gradle/Kotlin)
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties
│   ├── gradlew / gradlew.bat
│   ├── docs/                   # Android publishing docs
│   └── app/
│       ├── build.gradle
│       └── src/main/           # Kotlin source + AndroidManifest + resources
│
└── scripts/
    └── generate-icons.js       # Node script — generates all PWA icon sizes from source image
```

---

## 2. Runtime Architecture & Data Flow

```
Browser / Android WebView
        │
        │  HTTPS (same-origin or configured CORS_ORIGIN)
        ▼
┌─────────────────────────────────────────────────────┐
│  Express.js Server  (Node.js, port 3000 by default) │
│                                                     │
│  Middleware pipeline (in order):                    │
│    1. Trust proxy (app.set 'trust proxy', 1)        │
│    2. Inline CORS handler                           │
│    3. Helmet (CSP, security headers)                │
│    4. express.json() body parser                    │
│    5. Route-specific rate limiters                  │
│    6. authMiddleware (JWT on protected routes)      │
│    7. adminMiddleware (role check on /api/admin)    │
│                                                     │
│  Route handlers → better-sqlite3 (synchronous)     │
│                                                     │
│  Background:  node-cron scheduler (1× per hour)    │
│    • sendReminders() — email task alerts            │
│    • resetOverdueStreaks() — gamification maint.    │
└─────────────────────────────────────────────────────┘
        │
        │  better-sqlite3-multiple-ciphers
        ▼
┌─────────────────────┐
│  SQLite database    │
│  taskit.db          │
│  (optionally        │
│  AES-encrypted via  │
│  SQLCipher)         │
└─────────────────────┘

Mail path:
  Server ──Nodemailer──► SMTP server ──► User email inbox
  (reads settings from smtp_settings table at send time)
```

**Authentication flow:**
```
Register → POST /api/auth/register
         → DB: INSERT users (email_verified=0)
         → DB: INSERT magic_tokens (purpose='verify', 15 min TTL)
         → Email: verification link → BASE_URL?token=<hex>

Verify   → GET /api/auth/magic-link/verify?token=<hex>
         → DB: UPDATE users SET email_verified=1
         → Returns JWT

Password → POST /api/auth/login (email+password)
  Login    → DB: compare bcrypt hash
           → DB: INSERT otp_tokens (SHA-256 of 6-digit OTP, 10 min TTL)
           → Email: OTP code
         → POST /api/auth/verify-otp (sessionId+code)
           → timing-safe compare of SHA-256 hashes
           → Returns JWT (7d or 30d expiry)

Magic    → POST /api/auth/magic-link (email only)
  Link     → DB: INSERT magic_tokens (purpose='login', 15 min TTL)
           → Email: login link
         → GET /api/auth/magic-link/verify?token=<hex>
           → Returns JWT

All subsequent requests:
  Browser sends: Authorization: Bearer <JWT>
  authMiddleware: jwt.verify → re-checks user exists & not locked
                → updates last_active_at (once/day)
```

---

## 3. Environment Variables & Configuration

All variables are parsed in `server/src/config.ts` via `dotenv/config`.

| Variable | Type | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | string | `taskit-dev-secret-change-before-deploy` | HMAC-SHA256 key for JWT signing. **Must be set in production.** |
| `PORT` | integer | `3000` | TCP port for the Express server |
| `DB_PATH` | string | `server/taskit.db` | Override SQLite database file path |
| `DB_ENCRYPTION_KEY` | string | *(unset)* | SQLCipher passphrase — enables AES encryption at rest. Run `node server/encrypt-db.js` to encrypt an existing plaintext DB before setting this. |
| `MAX_LOGIN_ATTEMPTS` | integer | `5` | Failed login attempts before account lockout |
| `LOCKOUT_MINUTES` | integer | `30` | Duration in minutes of account lockout |
| `ADMIN_EMAIL` | string | *(unset)* | If set, the user who registers with this email receives the `admin` role automatically |
| `BASE_URL` | string | *(derived from Host header)* | Public-facing URL used in magic links, invite URLs, ICS feeds. E.g. `https://taskit.example.com` |
| `CORS_ORIGIN` | string (CSV) | *(derived from BASE_URL)* | Comma-separated list of allowed CORS origins. Defaults to `BASE_URL`; `false` if neither is set |
| `SMTP_HOST` | string | `''` | SMTP server hostname — seeds smtp_settings row on first run |
| `SMTP_PORT` | integer | `587` | SMTP port |
| `SMTP_SECURE` | `'true'` \| other | `false` | Use TLS (port 465) if `'true'`; use STARTTLS otherwise |
| `SMTP_USER` | string | `''` | SMTP authentication username |
| `SMTP_PASS` | string | `''` | SMTP authentication password |
| `SMTP_FROM` | string | *(SMTP_USER)* | From address for outgoing email |
| `SMTP_DEFAULT_FROM` | string | `noreply@taskit.jahosi.co.uk` | Fallback `From` when smtp_settings has no `from_addr` |
| `VAPID_PUBLIC_KEY` | string | `''` | VAPID public key for Web Push. Generate once with `npx web-push generate-vapid-keys`. If empty, push notifications are disabled. |
| `VAPID_PRIVATE_KEY` | string | `''` | VAPID private key for Web Push. Must match `VAPID_PUBLIC_KEY`. |
| `VAPID_SUBJECT` | string | `mailto:admin@<BASE_URL host>` | Contact URI embedded in push requests; falls back to `mailto:admin@localhost` when `BASE_URL` is unset. |

**Exported constants from `config.ts`:**

| Export | Type | Source |
|---|---|---|
| `JWT_SECRET` | `string` | `process.env.JWT_SECRET` |
| `PORT` | `number` | `process.env.PORT` |
| `DB_PATH` | `string \| undefined` | `process.env.DB_PATH` |
| `DB_ENCRYPTION_KEY` | `string \| undefined` | `process.env.DB_ENCRYPTION_KEY` |
| `MAX_LOGIN_ATTEMPTS` | `number` | `process.env.MAX_LOGIN_ATTEMPTS` |
| `LOCKOUT_MINUTES` | `number` | `process.env.LOCKOUT_MINUTES` |
| `ADMIN_EMAIL` | `string \| null` | `process.env.ADMIN_EMAIL` |
| `APP_VERSION` | `string` | `package.json.version` |
| `BASE_URL` | `string \| null` | `process.env.BASE_URL` (trailing `/` stripped) |
| `CORS_ORIGIN` | `string \| string[] \| false` | Derived (see above) |
| `SMTP` | `object` | `{ host, port, secure, user, pass, from }` |
| `VAPID` | `object` | `{ publicKey, privateKey, subject }` — empty strings when not configured |

---

## 4. Database Schema

**Engine:** `better-sqlite3-multiple-ciphers` (SQLite 3 + SQLCipher)  
**Default path:** `server/taskit.db`  
**Pragmas set at startup:** `journal_mode = WAL`, `foreign_keys = ON`  
**Key type convention:** All primary keys are UUID (TEXT) except `smtp_settings.id` (INTEGER = 1, singleton) and junction table composite PKs.  
**Timestamp convention:** All `*_at` columns store Unix milliseconds (JavaScript `Date.now()`).

---

### 4.1 Core Tables

#### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `username` | TEXT UNIQUE NOT NULL | Max 50 chars |
| `email` | TEXT UNIQUE NOT NULL | Normalised to lowercase |
| `password_hash` | TEXT NOT NULL | bcryptjs, 10 rounds |
| `created_at` | INTEGER NOT NULL | Unix ms |
| `role` | TEXT NOT NULL DEFAULT `'user'` | `'user'` or `'admin'` (migration) |
| `failed_logins` | INTEGER NOT NULL DEFAULT 0 | Reset on successful login (migration) |
| `locked_until` | INTEGER | Epoch ms; NULL = not locked (migration) |
| `email_verified` | INTEGER NOT NULL DEFAULT 1 | 0 = unverified; new registrations start at 0; default 1 for legacy rows (migration) |
| `locale` | TEXT NOT NULL DEFAULT `'en-GB'` | BCP-47 tag for date/time formatting (migration) |
| `last_active_at` | INTEGER | Updated at most once/day by authMiddleware (migration) |
| `ics_token` | TEXT | 64-char hex secret for the ICS calendar feed (migration) |
| `gamification_enabled` | INTEGER NOT NULL DEFAULT 0 | Opt-in gamification flag (migration) |
| `freeze_credits` | INTEGER NOT NULL DEFAULT 0 | Streak-freeze currency (migration) |
| `friend_key` | TEXT | CamelCase two-word pair e.g. `BraveOcean` (migration) |
| `arcade_tokens` | INTEGER NOT NULL DEFAULT 0 | Arcade Token balance — spendable to play mini-games (migration) |
| `daily_play_minutes` | INTEGER NOT NULL DEFAULT 15 | Digital-wellbeing daily arcade play limit in minutes (1–180) (migration) |

#### `groups`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Group display name |
| `shared_key` | TEXT UNIQUE NOT NULL | Auto-generated word+3digits e.g. `brave123` |
| `created_by` | TEXT NOT NULL | FK → users.id |
| `created_at` | INTEGER NOT NULL | Unix ms |
| `invite_name` | TEXT NOT NULL DEFAULT `''` | Auto-generated CamelCase pair e.g. `BoldAntelope` (migration) |
| `gamification_enhanced` | INTEGER NOT NULL DEFAULT 0 | Enables per-task XP multiplier feature (migration) |

#### `group_members`
| Column | Type | Notes |
|---|---|---|
| `group_id` | TEXT NOT NULL | FK → groups.id |
| `user_id` | TEXT NOT NULL | FK → users.id |
| `role` | TEXT NOT NULL DEFAULT `'member'` | `'admin'` or `'member'` |
| `joined_at` | INTEGER NOT NULL | Unix ms |
| `xp_share` | INTEGER NOT NULL DEFAULT 1 | Per-membership XP sharing preference (migration) |
| PK | (`group_id`, `user_id`) | |

#### `task_types`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | e.g. `Urgent`, `Routine`, `Hobby` |
| `group_id` | TEXT | NULL = global default type; FK → groups.id for group-specific types |
| `created_by` | TEXT | NULL for system defaults |
| `created_at` | INTEGER NOT NULL | Unix ms |

**Default seeded types (group_id = NULL):**  
`Urgent`, `Routine`, `Hobby`, `Household`, `Kids`, `Financial`, `Vehicle`, `Leisure`

#### `tasks`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `title` | TEXT NOT NULL | Max no DB limit (UI typically 200 chars) |
| `details` | TEXT | Optional long-form description |
| `type_id` | TEXT NOT NULL | FK → task_types.id |
| `status` | TEXT NOT NULL DEFAULT `'not_started'` | One of: `not_started`, `started`, `complete` |
| `created_by` | TEXT NOT NULL | FK → users.id |
| `group_id` | TEXT | NULL = personal task; FK → groups.id |
| `archived` | INTEGER NOT NULL DEFAULT 0 | Soft-delete flag (0 or 1) |
| `created_at` | INTEGER NOT NULL | Unix ms |
| `updated_at` | INTEGER NOT NULL | Unix ms — updated on every PATCH |
| `due_date` | INTEGER | Optional deadline (Unix ms) (migration) |
| `recur_interval` | INTEGER | NULL = non-recurring; number of units (migration) |
| `recur_unit` | TEXT | `days`, `weeks`, `months`, `years` (migration) |
| `notify_email` | INTEGER NOT NULL DEFAULT 1 | Master email notification switch (migration) |
| `notify_7day` | INTEGER NOT NULL DEFAULT 1 | Email 7-day reminder (migration) |
| `notify_1day` | INTEGER NOT NULL DEFAULT 1 | Email 1-day reminder (migration) |
| `notify_overdue` | INTEGER NOT NULL DEFAULT 0 | Legacy column (kept for schema compat, unused) (migration) |
| `notify_onday` | INTEGER NOT NULL DEFAULT 1 | Email on-day reminder (migration) |
| `notify_popup_7day` | INTEGER NOT NULL DEFAULT 0 | Browser push 7-day (migration) |
| `notify_popup_1day` | INTEGER NOT NULL DEFAULT 0 | Browser push 1-day (migration) |
| `notify_popup_onday` | INTEGER NOT NULL DEFAULT 0 | Browser push on-day (migration) |
| `completed_at` | INTEGER | Timestamp when status → 'complete' (migration) |
| `completed_by` | TEXT | user.id who completed (migration) |
| `streak_current` | INTEGER NOT NULL DEFAULT 0 | Current consecutive on-time count (migration) |
| `streak_longest` | INTEGER NOT NULL DEFAULT 0 | All-time best streak for this recurrence chain (migration) |
| `streak_frozen` | INTEGER NOT NULL DEFAULT 0 | 1 = Freeze credit applied, absorbs next miss (migration) |
| `xp_multiplier` | REAL NOT NULL DEFAULT 1.0 | XP award multiplier (group gamification-enhanced only) (migration) |
| `original_due_date` | INTEGER | Immutable snapshot of the due date set at task creation — used for anti-farming XP guard (migration) |
| `xp_claimed` | INTEGER NOT NULL DEFAULT 0 | 1 once XP has been awarded for this task; prevents re-award on edits (migration) |
| `is_sporadic` | INTEGER NOT NULL DEFAULT 0 | 1 = sporadic (maintenance) task; excluded from active task list ordering (migration) |
| `last_completed_at` | INTEGER | Epoch ms of the most recent sporadic completion (migration) |
| `is_long_term_goal` | INTEGER NOT NULL DEFAULT 0 | 1 = long-term goal; excluded from the main active task list until converted (migration) |

#### `task_assignees`
| Column | Type | Notes |
|---|---|---|
| `task_id` | TEXT NOT NULL | FK → tasks.id |
| `user_id` | TEXT NOT NULL | FK → users.id |
| PK | (`task_id`, `user_id`) | |

---

### 4.2 Authentication & Security Tables

#### `otp_tokens`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID — also used as `sessionId` in login flow |
| `user_id` | TEXT NOT NULL | FK → users.id |
| `code` | TEXT NOT NULL | SHA-256 hex of the 6-digit OTP (never stored plaintext) |
| `expires_at` | INTEGER NOT NULL | 10 minutes from creation (Unix ms) |
| `used` | INTEGER NOT NULL DEFAULT 0 | 1 after verified |
| `created_at` | INTEGER NOT NULL | Unix ms |

#### `magic_tokens`
| Column | Type | Notes |
|---|---|---|
| `token` | TEXT PK | 32-byte cryptographically random hex (64 chars) |
| `user_id` | TEXT NOT NULL | FK → users.id |
| `expires_at` | INTEGER NOT NULL | 15 minutes from creation (Unix ms) |
| `used` | INTEGER NOT NULL DEFAULT 0 | 1 after consumed |
| `created_at` | INTEGER NOT NULL | Unix ms |
| `purpose` | TEXT NOT NULL DEFAULT `'login'` | `'login'`, `'verify'`, or `'reset'` (migration) |

---

### 4.3 Social & Moderation Tables

#### `user_reports`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `reporter_id` | TEXT NOT NULL | FK → users.id |
| `reported_id` | TEXT NOT NULL | FK → users.id |
| `reason` | TEXT | Optional free text |
| `created_at` | INTEGER NOT NULL | Unix ms |
| `resolved` | INTEGER NOT NULL DEFAULT 0 | Admin toggles to 1 |

#### `user_blocks`
| Column | Type | Notes |
|---|---|---|
| `blocker_id` | TEXT NOT NULL | FK → users.id |
| `blocked_id` | TEXT NOT NULL | FK → users.id |
| `created_at` | INTEGER NOT NULL | Unix ms |
| PK | (`blocker_id`, `blocked_id`) | |

#### `user_friends`
| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT NOT NULL | FK → users.id |
| `friend_id` | TEXT NOT NULL | FK → users.id |
| `created_at` | INTEGER NOT NULL | Unix ms |
| PK | (`user_id`, `friend_id`) | Both directions (A,B) and (B,A) are stored |

#### `friend_invites`
| Column | Type | Notes |
|---|---|---|
| `token` | TEXT PK | 32-byte random hex |
| `user_id` | TEXT NOT NULL | FK → users.id (sender) |
| `expires_at` | INTEGER NOT NULL | 7 days from creation |
| `used` | INTEGER NOT NULL DEFAULT 0 | 1 after accepted |
| `created_at` | INTEGER NOT NULL | Unix ms |

#### `group_invites`
| Column | Type | Notes |
|---|---|---|
| `token` | TEXT PK | 32-byte random hex |
| `group_id` | TEXT NOT NULL | FK → groups.id |
| `invited_email` | TEXT | Optional email lock — if set, only that email can accept |
| `multi_use` | INTEGER NOT NULL DEFAULT 0 | 1 = reusable link (e.g. QR code) |
| `created_by` | TEXT NOT NULL | FK → users.id |
| `expires_at` | INTEGER NOT NULL | 7 days from creation |
| `used` | INTEGER NOT NULL DEFAULT 0 | 1 for single-use tokens after first accept |
| `created_at` | INTEGER NOT NULL | Unix ms |

---

### 4.4 Gamification Tables

#### `user_skills`
| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT NOT NULL | FK → users.id |
| `skill_name` | TEXT NOT NULL | Mirrors `task_types.name` for task-completion XP; `'Activity'` for event XP |
| `xp` | INTEGER NOT NULL DEFAULT 0 | Cumulative XP for this skill |
| `level` | INTEGER NOT NULL DEFAULT 1 | Derived from `xp` using `computeLevel()` |
| PK | (`user_id`, `skill_name`) | |

#### `achievements`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Same as `key` (deterministic) |
| `key` | TEXT UNIQUE NOT NULL | Machine-readable identifier (see §14.2) |
| `name` | TEXT NOT NULL | Display name |
| `description` | TEXT NOT NULL | Unlock condition text |
| `created_at` | INTEGER NOT NULL | Unix ms |

#### `user_achievements`
| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT NOT NULL | FK → users.id |
| `achievement_id` | TEXT NOT NULL | FK → achievements.id |
| `unlocked_at` | INTEGER NOT NULL | Unix ms when first unlocked |
| PK | (`user_id`, `achievement_id`) | |

#### `xp_events`
| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | Machine-readable event key (see §14.1) |
| `name` | TEXT NOT NULL | Admin display name |
| `description` | TEXT NOT NULL | Description of when XP is awarded |
| `xp_value` | INTEGER NOT NULL DEFAULT 0 | Admin-configurable XP amount |
| `enabled` | INTEGER NOT NULL DEFAULT 1 | 0 = disabled, events award 0 XP |
| `updated_at` | INTEGER NOT NULL DEFAULT 0 | Unix ms of last admin update |

#### `item_categories`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Display name for the category (e.g. `Animals`, `Vehicles`) |
| `archived` | INTEGER NOT NULL DEFAULT 0 | Soft-delete flag — archived categories and their items are hidden from players |
| `created_at` | INTEGER NOT NULL | Unix ms |

#### `collectibles`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Display name of the collectible item |
| `description` | TEXT | Optional flavour text |
| `category_id` | TEXT NOT NULL | FK → item_categories.id |
| `rarity` | TEXT NOT NULL | One of: `common`, `rare`, `epic` |
| `icon_filename` | TEXT | Optional filename of a PNG in `public/collectables/` that replaces the rarity emoji in the UI. Only bare filenames are stored; validated server-side to prevent path traversal. |
| `archived` | INTEGER NOT NULL DEFAULT 0 | Soft-delete flag — archived items are excluded from loot drops and the catalogue |
| `created_at` | INTEGER NOT NULL | Unix ms |

**Drop probability by rarity:**
| Rarity | Weight | Effective chance* |
|---|---|---|
| `common` | 70 | 70% of drops |
| `rare` | 25 | 25% of drops |
| `epic` | 5 | 5% of drops |

*Once a drop is rolled (see §14 Loot Drop Engine), the rarity tier is chosen with these weights.

#### `user_inventory`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_id` | TEXT NOT NULL | FK → users.id |
| `collectible_id` | TEXT NOT NULL | FK → collectibles.id |
| `acquired_at` | INTEGER NOT NULL | Unix ms when the item was claimed |

---

### 4.5 Communication & Messaging Tables

#### `smtp_settings`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK CHECK(id=1) | Singleton row — always id=1 |
| `host` | TEXT NOT NULL DEFAULT `''` | SMTP server hostname |
| `port` | INTEGER NOT NULL DEFAULT 587 | SMTP port |
| `secure` | INTEGER NOT NULL DEFAULT 0 | 1 = TLS, 0 = STARTTLS |
| `username` | TEXT NOT NULL DEFAULT `''` | SMTP auth username |
| `pass` | TEXT NOT NULL DEFAULT `''` | SMTP auth password (stored plaintext in DB) |
| `from_addr` | TEXT NOT NULL DEFAULT `''` | From address for outbound mail |
| `enabled` | INTEGER NOT NULL DEFAULT 0 | 0 = mail disabled globally |
| `updated_at` | INTEGER NOT NULL DEFAULT 0 | Unix ms |

#### `task_reminders_sent`
| Column | Type | Notes |
|---|---|---|
| `task_id` | TEXT NOT NULL | FK → tasks.id |
| `reminder_type` | TEXT NOT NULL | `'7_day'`, `'1_day'`, `'on_day'` |
| `sent_at` | INTEGER NOT NULL | Unix ms when sent |
| PK | (`task_id`, `reminder_type`) | Prevents duplicate sends |

#### `task_notes`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `task_id` | TEXT NOT NULL | FK → tasks.id |
| `user_id` | TEXT NOT NULL | FK → users.id |
| `note` | TEXT NOT NULL | Free text progress note |
| `created_at` | INTEGER NOT NULL | Unix ms |

#### `task_subtasks`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `task_id` | TEXT NOT NULL | FK → tasks.id |
| `title` | TEXT NOT NULL | Sub-task description, max 255 chars |
| `completed` | INTEGER NOT NULL DEFAULT 0 | 0 = pending, 1 = done |
| `completed_by` | TEXT | FK → users.id; NULL until ticked |
| `completed_at` | INTEGER | Unix ms; NULL until ticked |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | Ascending display order |
| `created_at` | INTEGER NOT NULL | Unix ms |

#### `feedback_messages`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_id` | TEXT NOT NULL | FK → users.id |
| `subject` | TEXT NOT NULL | Max 200 chars |
| `message` | TEXT NOT NULL | Max 4000 chars |
| `contact_ok` | INTEGER NOT NULL DEFAULT 0 | 1 = user consented to follow-up contact |
| `read_at` | INTEGER | NULL = unread; set when admin views |
| `created_at` | INTEGER NOT NULL | Unix ms |
| `status` | TEXT NOT NULL DEFAULT `'not_started'` | `'not_started'`, `'in_progress'`, `'completed'`, `'archived'` (migration) |

#### `user_alerts`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_id` | TEXT NOT NULL | FK → users.id |
| `message` | TEXT NOT NULL | Short notification text |
| `read_at` | INTEGER | NULL = unread |
| `created_at` | INTEGER NOT NULL | Unix ms |

#### `push_subscriptions`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_id` | TEXT NOT NULL | FK → users.id |
| `endpoint` | TEXT NOT NULL | Push service URL (HTTPS); unique index prevents duplicate registrations |
| `keys_p256dh` | TEXT NOT NULL | Browser-generated EC public key (base64url) |
| `keys_auth` | TEXT NOT NULL | Browser-generated auth secret (base64url) |
| `created_at` | INTEGER NOT NULL | Unix ms |

Stale rows (push service returned 410/404) are deleted automatically by the scheduler when a delivery attempt fails.

---

### 4.6 Runtime Migrations (addCol)

These `ALTER TABLE … ADD COLUMN` statements run on every server start but only take effect when the column does not yet exist:

| Table | Column | Definition |
|---|---|---|
| `users` | `role` | `TEXT NOT NULL DEFAULT 'user'` |
| `users` | `failed_logins` | `INTEGER NOT NULL DEFAULT 0` |
| `users` | `locked_until` | `INTEGER` |
| `users` | `email_verified` | `INTEGER NOT NULL DEFAULT 1` |
| `users` | `locale` | `TEXT NOT NULL DEFAULT 'en-GB'` |
| `users` | `last_active_at` | `INTEGER` |
| `users` | `ics_token` | `TEXT` |
| `users` | `gamification_enabled` | `INTEGER NOT NULL DEFAULT 0` |
| `users` | `freeze_credits` | `INTEGER NOT NULL DEFAULT 0` |
| `users` | `friend_key` | `TEXT` |
| `users` | `arcade_tokens` | `INTEGER NOT NULL DEFAULT 0` |
| `users` | `daily_play_minutes` | `INTEGER NOT NULL DEFAULT 15` |
| `tasks` | `due_date` | `INTEGER` |
| `tasks` | `recur_interval` | `INTEGER` |
| `tasks` | `recur_unit` | `TEXT` |
| `tasks` | `notify_email` | `INTEGER NOT NULL DEFAULT 1` |
| `tasks` | `notify_7day` | `INTEGER NOT NULL DEFAULT 1` |
| `tasks` | `notify_1day` | `INTEGER NOT NULL DEFAULT 1` |
| `tasks` | `notify_overdue` | `INTEGER NOT NULL DEFAULT 0` |
| `tasks` | `notify_onday` | `INTEGER NOT NULL DEFAULT 1` |
| `tasks` | `notify_popup_7day` | `INTEGER NOT NULL DEFAULT 0` |
| `tasks` | `notify_popup_1day` | `INTEGER NOT NULL DEFAULT 0` |
| `tasks` | `notify_popup_onday` | `INTEGER NOT NULL DEFAULT 0` |
| `tasks` | `completed_at` | `INTEGER` |
| `tasks` | `completed_by` | `TEXT` |
| `tasks` | `streak_current` | `INTEGER NOT NULL DEFAULT 0` |
| `tasks` | `streak_longest` | `INTEGER NOT NULL DEFAULT 0` |
| `tasks` | `streak_frozen` | `INTEGER NOT NULL DEFAULT 0` |
| `tasks` | `xp_multiplier` | `REAL NOT NULL DEFAULT 1.0` |
| `tasks` | `original_due_date` | `INTEGER` |
| `tasks` | `xp_claimed` | `INTEGER NOT NULL DEFAULT 0` |
| `tasks` | `is_sporadic` | `INTEGER NOT NULL DEFAULT 0` |
| `tasks` | `last_completed_at` | `INTEGER` |
| `tasks` | `is_long_term_goal` | `INTEGER NOT NULL DEFAULT 0` |
| `groups` | `invite_name` | `TEXT NOT NULL DEFAULT ''` |
| `groups` | `gamification_enhanced` | `INTEGER NOT NULL DEFAULT 0` |
| `group_members` | `xp_share` | `INTEGER NOT NULL DEFAULT 1` |
| `magic_tokens` | `purpose` | `TEXT NOT NULL DEFAULT 'login'` |
| `feedback_messages` | `status` | `TEXT NOT NULL DEFAULT 'not_started'` |

**Backfill logic** also runs on startup:
- Any `users` row with a NULL/empty `friend_key` gets a new generated key.
- Any `groups` row with an empty `invite_name` gets a new unique word pair.

---

### 4.7 Seeded Data

On first run (or when the relevant tables are empty):

**`task_types`** (global, `group_id = NULL`):  
`Urgent`, `Routine`, `Hobby`, `Household`, `Kids`, `Financial`, `Vehicle`, `Leisure`

**`smtp_settings`** (id=1 singleton):  
Seeded from `SMTP_*` env vars.

**`achievements`** (INSERT OR IGNORE, idempotent):  
See §14.2 for full list.

**`xp_events`** (INSERT OR IGNORE, idempotent):  
See §14.1 for full list.

---

## 5. Server — Node.js/Express

### 5.1 Entry Point (`server/src/index.ts`)

**Imports:**
- `express`, `helmet`, `fs`, `path`
- `rateLimit`, `ipKeyGenerator` from `express-rate-limit`
- `jwt` from `jsonwebtoken`
- `db` from `./db` (initialises database on import)
- `APP_VERSION`, `BASE_URL`, `CORS_ORIGIN`, `JWT_SECRET`, `PORT` from `./config`
- `startScheduler` from `./services/scheduler`
- All 8 route modules

**Key local variables:**
- `app` — Express application instance
- `generalLimiter` — 200 req / 15 min (IP-based)
- `authLimiter` — 20 req / 15 min (IP-based, applied to `/api/auth`)
- `authenticatedLimiter` — 2000 req / 15 min (per-user JWT ID, fallback to IP)
- `swContent` — Service Worker file content with `__APP_VERSION__` replaced

**Startup sequence:**
1. Import `db` → runs all schema creation, migrations, backfills, seeds
2. Configure Express (trust proxy, rate limiters, CORS, Helmet, JSON parser)
3. Register health-check: `GET /readyz`
4. Register version: `GET /api/version`
5. Register ICS feed: `GET /calendar/:token/tasks.ics`
6. Register 8 API route groups
7. Serve `/sw.js` dynamically (version-injected)
8. Serve static files from `public/`
9. SPA fallback: `GET *` → `public/index.html`
10. Call `startScheduler()`
11. `app.listen(PORT)`

---

### 5.2 Rate Limiters

| Limiter | Window | Max | Applied to | Key |
|---|---|---|---|---|
| `generalLimiter` | 15 min | 200 | Static files, ICS feed, SPA fallback | IP |
| `authLimiter` | 15 min | 20 | `/api/auth/*` | IP |
| `authenticatedLimiter` | 15 min | 2000 | All other `/api/*` routes | JWT user ID (fallback: IP) |

---

### 5.3 Middleware

| Middleware | File | Description |
|---|---|---|
| `authMiddleware` | `middleware/auth.ts` | Verifies `Authorization: Bearer <JWT>`, attaches `req.user`, updates `last_active_at` |
| `adminMiddleware` | `middleware/admin.ts` | Reads `users.role` from DB; 403 if not `'admin'` |

**`AuthPayload` interface** (extended onto `Request`):
```typescript
interface AuthPayload {
  id: string;
  username: string;
  email: string;
  role?: string;
}
```
Attached to `req.user` by `authMiddleware`.

---

### 5.4 API Route Map

| Method | Path | Auth | Rate | Handler |
|---|---|---|---|---|
| `GET` | `/readyz` | None | None | Health check |
| `GET` | `/api/version` | None | None | Returns `{ version }` |
| `GET` | `/calendar/:token/tasks.ics` | Token in URL | general | ICS feed |
| `POST` | `/api/auth/register` | None | auth | Register user |
| `POST` | `/api/auth/login` | None | auth | Password + OTP step 1 |
| `POST` | `/api/auth/verify-otp` | None | auth | OTP step 2 → JWT |
| `POST` | `/api/auth/magic-link` | None | auth | Request magic link |
| `GET` | `/api/auth/magic-link/verify` | None | auth | Consume magic link → JWT |
| `POST` | `/api/auth/forgot-password` | None | auth | Request password reset |
| `POST` | `/api/auth/reset-password` | None | auth | Consume reset token |
| `GET` | `/api/tasks` | JWT | authed | List tasks (filtered; excludes sporadic and long-term goals) |
| `POST` | `/api/tasks` | JWT | authed | Create task |
| `GET` | `/api/tasks/sporadic` | JWT | authed | List sporadic (maintenance) tasks |
| `POST` | `/api/tasks/create-sporadic` | JWT | authed | Create sporadic task |
| `PUT` | `/api/tasks/:id/complete-sporadic` | JWT | authed | Mark sporadic task done (resets status, stamps last_completed_at) |
| `GET` | `/api/tasks/long-term-goals` | JWT | authed | List long-term goals |
| `POST` | `/api/tasks/create-long-term-goal` | JWT | authed | Create long-term goal |
| `PATCH` | `/api/tasks/:id` | JWT | authed | Update task fields (supports `isLongTermGoal` to convert goal → task) |
| `PATCH` | `/api/tasks/:id/status` | JWT | authed | Change task status (triggers gamification on complete) |
| `PATCH` | `/api/tasks/:id/archive` | JWT | authed | Toggle archive flag |
| `PATCH` | `/api/tasks/:id/defer` | JWT | authed | Change due date |
| `PATCH` | `/api/tasks/:id/fast-forward` | JWT | authed | Advance recurring task's due date |
| `DELETE` | `/api/tasks/:id` | JWT | authed | Delete task (spawns next recurrence if recurring) |
| `GET` | `/api/tasks/:id/notes` | JWT | authed | List task notes |
| `POST` | `/api/tasks/:id/notes` | JWT | authed | Add progress note |
| `GET` | `/api/tasks/:id/subtasks` | JWT | authed | List sub-tasks for a task |
| `POST` | `/api/tasks/:id/subtasks` | JWT | authed | Create a sub-task |
| `PATCH` | `/api/tasks/:id/subtasks/:subId` | JWT | authed | Update sub-task (title and/or completed); sets parent to 'started' on first tick; awards XP |
| `DELETE` | `/api/tasks/:id/subtasks/:subId` | JWT | authed | Delete a sub-task |
| `GET` | `/api/groups` | JWT | authed | List user's groups |
| `POST` | `/api/groups` | JWT | authed | Create group |
| `GET` | `/api/groups/invite/:token` | None | authed | Look up invite info |
| `GET` | `/api/groups/:id` | JWT | authed | Get group details |
| `PUT` | `/api/groups/:id` | JWT | authed | Rename group |
| `DELETE` | `/api/groups/:id` | JWT | authed | Delete group |
| `GET` | `/api/groups/:id/members` | JWT | authed | List group members |
| `POST` | `/api/groups/:id/join` | JWT | authed | Join by invite name + shared key |
| `POST` | `/api/groups/:id/invite` | JWT | authed | Generate invite token |
| `POST` | `/api/groups/:id/invite/email` | JWT | authed | Send email invite |
| `POST` | `/api/groups/:id/invite/qr` | JWT | authed | Generate QR code invite |
| `POST` | `/api/groups/invite/:token/accept` | JWT | authed | Accept invite token |
| `PATCH` | `/api/groups/:id/members/:userId/role` | JWT | authed | Change member role |
| `DELETE` | `/api/groups/:id/members/:userId` | JWT | authed | Remove member |
| `PATCH` | `/api/groups/:id/gamification` | JWT | authed | Toggle group gamification enhanced |
| `PATCH` | `/api/groups/:id/members/me/xp-share` | JWT | authed | Toggle XP share for self |
| `GET` | `/api/task-types` | JWT | authed | List task types |
| `POST` | `/api/task-types` | JWT | authed | Create task type |
| `DELETE` | `/api/task-types/:id` | JWT | authed | Delete task type |
| `PATCH` | `/api/users/me/locale` | JWT | authed | Update locale |
| `PATCH` | `/api/users/me/password` | JWT | authed | Change password |
| `DELETE` | `/api/users/me` | JWT | authed | Delete own account (cascade) |
| `POST` | `/api/users/:id/report` | JWT | authed | Report a user |
| `POST` | `/api/users/:id/block` | JWT | authed | Block a user |
| `DELETE` | `/api/users/:id/block` | JWT | authed | Unblock a user |
| `GET` | `/api/users/blocks` | JWT | authed | List blocked users |
| `POST` | `/api/users/me/feedback` | JWT | authed | Submit feedback |
| `GET` | `/api/users/me/alerts` | JWT | authed | List user alerts (max 50) |
| `PATCH` | `/api/users/me/alerts/:id/read` | JWT | authed | Mark alert as read |
| `GET` | `/api/users/me/ics-token` | JWT | authed | Get/create ICS token |
| `POST` | `/api/users/me/ics-token/rotate` | JWT | authed | Rotate ICS token |
| `GET` | `/api/gamification/profile` | JWT | authed | Full gamification profile |
| `PATCH` | `/api/gamification/opt-in` | JWT | authed | Enable/disable gamification |
| `GET` | `/api/gamification/achievements` | JWT | authed | Achievements catalogue with unlock status |
| `GET` | `/api/gamification/streaks` | JWT | authed | All recurring task streaks |
| `GET` | `/api/gamification/leaderboard/group/:groupId` | JWT | authed | Group XP leaderboard |
| `GET` | `/api/gamification/leaderboard/friends` | JWT | authed | Friends XP leaderboard |
| `POST` | `/api/gamification/streaks/:taskId/freeze` | JWT | authed | Apply streak freeze |
| `GET` | `/api/gamification/catalogue` | JWT | authed | Full active collectibles catalogue |
| `GET` | `/api/gamification/inventory` | JWT | authed | Authenticated user's owned collectible inventory |
| `POST` | `/api/gamification/inventory/claim` | JWT | authed | Claim pending loot drop → persisted to inventory |
| `POST` | `/api/gamification/inventory/recycle` | JWT | authed | Discard pending drop for XP consolation bonus |
| `PATCH` | `/api/gamification/arcade/daily-limit` | JWT | authed | Set daily arcade play limit (minutes) |
| `POST` | `/api/gamification/arcade/spend-token` | JWT | authed | Atomically deduct 1 arcade token |
| `GET` | `/api/friends` | JWT | authed | List friends |
| `DELETE` | `/api/friends/:friendId` | JWT | authed | Remove friend |
| `GET` | `/api/friends/my-key` | JWT | authed | Get own friend key |
| `POST` | `/api/friends/add-by-key` | JWT | authed | Add friend by username+key |
| `POST` | `/api/friends/invite` | JWT | authed | Generate friend invite link |
| `GET` | `/api/friends/invite/:token` | None | authed | Look up invite sender |
| `POST` | `/api/friends/invite/:token/accept` | JWT | authed | Accept friend invite |
| `GET` | `/api/admin/smtp` | JWT+Admin | authed | Get SMTP settings |
| `PUT` | `/api/admin/smtp` | JWT+Admin | authed | Update SMTP settings |
| `GET` | `/api/admin/users` | JWT+Admin | authed | List all users |
| `GET` | `/api/admin/locked` | JWT+Admin | authed | List locked accounts |
| `POST` | `/api/admin/users/:id/unlock` | JWT+Admin | authed | Unlock account |
| `PUT` | `/api/admin/users/:id/role` | JWT+Admin | authed | Change user role |
| `GET` | `/api/admin/reports` | JWT+Admin | authed | List user reports |
| `PUT` | `/api/admin/reports/:id/resolve` | JWT+Admin | authed | Resolve report |
| `GET` | `/api/admin/stats` | JWT+Admin | authed | Dashboard stats |
| `GET` | `/api/admin/feedback` | JWT+Admin | authed | List feedback messages |
| `PUT` | `/api/admin/feedback/:id/read` | JWT+Admin | authed | Mark feedback as read |
| `PATCH` | `/api/admin/feedback/:id/status` | JWT+Admin | authed | Update feedback status |
| `POST` | `/api/admin/feedback/:id/reply` | JWT+Admin | authed | Reply to feedback (creates user_alert) |
| `GET` | `/api/admin/xp-events` | JWT+Admin | authed | List XP event catalogue |
| `PATCH` | `/api/admin/xp-events/:key` | JWT+Admin | authed | Update XP event value/enabled |
| `GET` | `/api/admin/collectible-categories` | JWT+Admin | authed | List active collectible categories |
| `POST` | `/api/admin/collectible-categories` | JWT+Admin | authed | Create collectible category |
| `PATCH` | `/api/admin/collectible-categories/:id` | JWT+Admin | authed | Rename collectible category |
| `DELETE` | `/api/admin/collectible-categories/:id` | JWT+Admin | authed | Soft-delete collectible category |
| `GET` | `/api/admin/collectibles` | JWT+Admin | authed | List active collectible items (includes `icon_filename`) |
| `POST` | `/api/admin/collectibles` | JWT+Admin | authed | Create collectible item (optional `iconFilename` field) |
| `PATCH` | `/api/admin/collectibles/:id` | JWT+Admin | authed | Update collectible item fields (optional `iconFilename`; `null`/`""` clears icon) |
| `DELETE` | `/api/admin/collectibles/:id` | JWT+Admin | authed | Soft-delete collectible item |
| `POST` | `/api/admin/collectibles/seed` | JWT+Admin | authed | Bulk-seed categories and items from JSON |
| `GET` | `/api/admin/collectibles/server-icons` | JWT+Admin | authed | List PNG filenames available in `public/collectables/` for use as item icons |
| `GET` | `/api/push/vapid-public-key` | None | authed | Returns `{ publicKey }` — 503 if VAPID not configured |
| `POST` | `/api/push/subscribe` | JWT | authed | Upsert a Web Push subscription (endpoint + p256dh + auth keys) |
| `DELETE` | `/api/push/subscribe` | JWT | authed | Remove a push subscription by endpoint |

---

### 5.5 Special HTTP Endpoints

| Endpoint | Description |
|---|---|
| `GET /readyz` | Health check — returns `{ ok: true, service: 'taskit', version, timestamp }` |
| `GET /api/version` | Returns `{ version }` — used by `public/js/version.js` |
| `GET /sw.js` | Serves Service Worker with `__APP_VERSION__` replaced at runtime |
| `GET /calendar/:token/tasks.ics` | Private ICS calendar feed — 64-char hex token required |
| `GET *` (fallback) | Returns `public/index.html` for SPA client-side routing |

---

## 6. Server Route Files — Functions & Variables

### 6.1 `routes/auth.ts`

**Local helpers:**
| Name | Type | Description |
|---|---|---|
| `getBaseUrl(req)` | function | Returns `BASE_URL ?? req.protocol://req.host` |
| `isValidEmail(email)` | function | Non-regex email validation (ReDoS-safe) |
| `MAX_USERNAME_LEN` | const | `50` |
| `MAX_EMAIL_LEN` | const | `254` (RFC 5321) |
| `MAX_PASSWORD_LEN` | const | `128` |
| `UserRow` | interface | `{ id, username, email, password_hash, role, failed_logins, locked_until, email_verified, locale }` |

**Route handlers:**
| Handler | Description |
|---|---|
| `POST /register` | Creates user (email_verified=0), sends verification magic link, awards `signup` XP |
| `POST /login` | Validates bcrypt hash, tracks failed logins, generates OTP (SHA-256 stored), sends email |
| `POST /verify-otp` | Timing-safe hash compare, marks OTP used, issues JWT |
| `POST /magic-link` | Generates `purpose='login'` magic token, sends email (always returns 200) |
| `GET /magic-link/verify` | Marks token used, sets email_verified=1, issues JWT |
| `POST /forgot-password` | Generates `purpose='reset'` token, sends email (always returns 200) |
| `POST /reset-password` | Validates reset token, updates bcrypt hash, clears lockout |

---

### 6.2 `routes/tasks.ts`

**Local helpers:**
| Name | Type | Description |
|---|---|---|
| `ALLOWED_STATUSES` | Set | `{ 'not_started', 'started', 'complete' }` |
| `ALLOWED_RECUR_UNITS` | Set | `{ 'days', 'weeks', 'months', 'years' }` |
| `URGENT_TASK_TYPE` | const | `'urgent'` — used in ORDER BY clause |
| `hasTaskAccess(task, userId)` | function | Returns true if userId === task.created_by OR is a group member |
| `computeNextDue(dueDateMs, interval, unit)` | function | Computes next occurrence date; uses `Date` methods for days/weeks/months/years |

**Route handlers:**
| Handler | Description |
|---|---|
| `GET /` | Lists tasks with filters (groupId, assignedToMe, status, archived, typeId); excludes `is_sporadic=1` and `is_long_term_goal=1`; attaches assignees |
| `POST /` | Creates task, awards `create_task` XP, inserts assignees, creates assignment alerts |
| `GET /sporadic` | Lists all non-archived sporadic tasks for the user with friendly last-completed timestamps |
| `POST /create-sporadic` | Creates a sporadic task (`is_sporadic=1`, no due date) |
| `PUT /:id/complete-sporadic` | Resets sporadic task to `not_started`, stamps `last_completed_at`, awards XP |
| `GET /long-term-goals` | Lists all non-archived long-term goals for the user |
| `POST /create-long-term-goal` | Creates a long-term goal (`is_long_term_goal=1`, no due date); supports optional xpMultiplier |
| `PATCH /:id` | Updates any task field; supports `isLongTermGoal` to clear the flag and convert a goal to a regular task; re-validates assignees; preserves completed_at/by sync |
| `PATCH /:id/status` | Changes status; on `complete`: spawns next recurrence (if any), awards XP/freeze, checks achievements |
| `PATCH /:id/defer` | Updates due_date only |
| `PATCH /:id/fast-forward` | Advances recurring due_date by one interval; clears reminder sent records |
| `PATCH /:id/archive` | Toggles `archived` flag |
| `DELETE /:id` | Cascade-deletes assignees, notes, reminders; spawns recurrence first if recurring |
| `GET /:id/notes` | Returns notes with author username |
| `POST /:id/notes` | Adds note, calls `checkAndGrantAchievements` |

**XP/gamification calls on status → complete:**
1. `awardTaskXp(userId, typeId, xpMultiplier)` — skill XP
2. `awardFreezeCredit(userId)` — +1 freeze credit
3. `consumeFreezeCredit(userId)` — if freeze was consumed this completion
4. `checkAndGrantAchievements(userId)` — achievement unlock check

---

### 6.3 `routes/groups.ts`

**Local helpers:**
| Name | Type | Description |
|---|---|---|
| `getBaseUrl(req)` | function | Same as auth.ts |
| `isValidEmail(email)` | function | Same as auth.ts |

**Route handlers (selected):**
| Handler | Description |
|---|---|
| `GET /invite/:token` | Public — returns group name for pre-login invite display |
| `GET /` | Lists user's groups with member count |
| `POST /` | Creates group; generates unique `invite_name` (loop up to 1000 attempts); awards `create_group` XP |
| `POST /:id/join` | Joins by `invite_name` + `shared_key` (case-insensitive match) |
| `POST /:id/invite` | Generates single-use invite token; awards `send_group_invite` XP |
| `POST /:id/invite/email` | Sends email invite via `sendGroupInvite()`; awards `send_group_invite` XP |
| `POST /:id/invite/qr` | Generates multi-use invite; returns URL for QR rendering |
| `POST /invite/:token/accept` | Validates token, adds user as member |
| `PATCH /:id/gamification` | Toggles `gamification_enhanced` on the group (admin only) |
| `PATCH /:id/members/me/xp-share` | Toggles `xp_share` for current user in the group |

---

### 6.4 `routes/taskTypes.ts`

Three handlers:
- `GET /` — Returns all types visible to the user (global + any group-specific types for their groups)
- `POST /` — Creates a new type (optionally scoped to a `groupId`)
- `DELETE /:id` — Deletes a type (only if no tasks reference it, or only by creator/group admin)

---

### 6.5 `routes/users.ts`

| Handler | Description |
|---|---|
| `PATCH /me/locale` | Validates against `ALLOWED_LOCALES`, updates DB |
| `POST /:id/report` | Inserts `user_reports` row |
| `POST /:id/block` | Idempotent insert into `user_blocks` |
| `DELETE /:id/block` | Removes block row |
| `GET /blocks` | Returns list of blocked users |
| `POST /me/feedback` | Inserts `feedback_messages` (max 4000 chars) |
| `PATCH /me/password` | bcrypt compare then bcrypt hash new password |
| `DELETE /me` | Full account cascade delete in a transaction |
| `GET /me/alerts` | Returns last 50 `user_alerts` |
| `PATCH /me/alerts/:id/read` | Sets `read_at` |
| `GET /me/ics-token` | Returns existing or generates new 32-byte hex ICS token |
| `POST /me/ics-token/rotate` | Always generates a new 32-byte hex ICS token |

---

### 6.6 `routes/gamification.ts`

| Handler | Description |
|---|---|
| `GET /profile` | Calls `getGamificationProfile(userId)` |
| `PATCH /opt-in` | Sets `gamification_enabled`; on first enable calls `checkAndGrantAchievements` |
| `GET /achievements` | Full catalogue with `unlockedAt` per user |
| `GET /streaks` | Calls `getStreaksForUser(userId)` |
| `GET /leaderboard/group/:groupId` | Aggregated XP by group member |
| `GET /leaderboard/friends` | Aggregated XP for user + friends |
| `POST /streaks/:taskId/freeze` | Calls `applyStreakFreeze(userId, taskId)` |
| `GET /catalogue` | Returns all active (non-archived) collectibles joined with category; no ownership filter — used to render unowned silhouettes |
| `GET /inventory` | Returns full `user_inventory` joined with collectible and category details, ordered by `acquired_at DESC` |
| `POST /inventory/claim` | Calls `getPendingDrop()` (non-destructive check), validates collectible still active, then atomically `claimPendingDrop()` + INSERT `user_inventory`; 404 if no pending drop; 410 if dropped item was archived |
| `POST /inventory/recycle` | Calls `getPendingDrop()`, consumes it via `claimPendingDrop()`, awards `recycle_drop` XP via `awardEventXp()`; 404 if no pending drop |
| `PATCH /arcade/daily-limit` | Validates `minutes` is integer 1–180; UPDATE `users.daily_play_minutes` |
| `POST /arcade/spend-token` | Atomic DB transaction: `UPDATE users SET arcade_tokens = arcade_tokens - 1 WHERE id = ? AND arcade_tokens > 0`; returns new balance; 400 if no tokens |

---

### 6.7 `routes/friends.ts`

| Handler | Description |
|---|---|
| `GET /invite/:token` | Public — returns sender name |
| `GET /my-key` | Returns `{ username, friend_key }` |
| `POST /add-by-key` | Timing-safe key match; creates bidirectional friendship; creates alert for target |
| `POST /invite` | Invalidates old invite, creates new 7-day invite token; awards `send_app_invite` XP |
| `POST /invite/:token/accept` | Creates bidirectional friendship; marks invite used; creates alert for sender |
| `GET /` | Lists friends with `friends_since` |
| `DELETE /:friendId` | Removes both directions from `user_friends` |

---

### 6.8 `routes/admin.ts`

Requires both `authMiddleware` + `adminMiddleware`.

**Local helpers:**
| Name | Type | Description |
|---|---|---|
| `getOriginalAdminId()` | function | Lazily resolves (and caches) the founding admin user ID — prefers `ADMIN_EMAIL` match, falls back to earliest `created_at` |
| `isOriginalAdmin(userId)` | function | Returns `true` if userId matches the founding admin (who cannot be demoted) |
| `_originalAdminId` | `string \| null \| undefined` | Module-level cache; `undefined` = not yet resolved |
| `ALLOWED_RARITIES` | Set | `{ 'common', 'rare', 'epic' }` — validated on collectible create/update |

| Handler | Description |
|---|---|
| `GET /smtp` | Returns SMTP settings (omits `pass`) |
| `PUT /smtp` | Updates SMTP settings (empty pass = keep existing) |
| `GET /users` | All users ordered by `created_at`; response includes `is_locked`, `open_reports`, `is_original_admin` |
| `GET /locked` | Users with `locked_until > now` |
| `POST /users/:id/unlock` | Clears `failed_logins` and `locked_until` |
| `PUT /users/:id/role` | Changes role to `'admin'` or `'user'` (cannot self-change; original admin cannot be demoted) |
| `GET /reports` | All user reports with reporter/reported names |
| `PUT /reports/:id/resolve` | Marks report resolved |
| `GET /stats` | Returns `{ totalUsers, activeToday, totalTasks, tasksToday }` |
| `GET /feedback` | All feedback messages with user details |
| `PUT /feedback/:id/read` | Sets `read_at` |
| `PATCH /feedback/:id/status` | Updates workflow status |
| `POST /feedback/:id/reply` | Creates `user_alerts` row for the submitter |
| `GET /xp-events` | Lists all XP events |
| `PATCH /xp-events/:key` | Updates `xp_value` and/or `enabled` |
| `GET /collectible-categories` | Lists non-archived `item_categories` ordered by name |
| `POST /collectible-categories` | Creates a new `item_categories` row; 201 with new row |
| `PATCH /collectible-categories/:id` | Renames a category; 404 if not found or archived |
| `DELETE /collectible-categories/:id` | Soft-deletes (sets `archived=1`); 204 No Content |
| `GET /collectibles/server-icons` | Returns array of `.png` filenames available in `public/collectables/` for use as collectible icons |
| `GET /collectibles` | Lists non-archived collectibles joined with category (includes `icon_filename`); ordered by category then name |
| `POST /collectibles` | Creates a new collectible (name, categoryId, rarity required; description, iconFilename optional); validates rarity, category, and icon filename; 201 |
| `PATCH /collectibles/:id` | Partial update of name/description/categoryId/rarity/iconFilename; validates all provided fields; pass `iconFilename: null` or `""` to clear the icon |
| `DELETE /collectibles/:id` | Soft-deletes collectible (`archived=1`); 204 No Content |
| `POST /collectibles/seed` | Bulk-seed: accepts JSON array of `{ name, items: [{ name, description?, rarity }] }`; existing entries (matched by name) are skipped; returns `{ categoriesCreated, categoriesReused, itemsCreated, itemsSkipped }` |

---

### 6.9 `routes/push.ts`

Handles Web Push subscription management. VAPID keys must be set in `.env` for push to function.

**Constants:**
| Name | Value | Description |
|---|---|---|
| `BASE64URL_RE` | `/^[A-Za-z0-9\-_]+={0,2}$/` | Validates p256dh and auth key material |
| `P256DH_MAX_LEN` | `200` | Max chars for the p256dh key |
| `AUTH_MAX_LEN` | `50` | Max chars for the auth key |

| Handler | Description |
|---|---|
| `GET /vapid-public-key` | Public (no auth). Returns `{ publicKey }` if VAPID is configured; 503 otherwise. |
| `POST /subscribe` | Upsert push subscription. Validates endpoint (must be HTTPS URL) and key format. If the endpoint already belongs to another user, silently returns 200 without altering ownership. Inserts a new row or refreshes keys for an existing row. |
| `DELETE /subscribe` | Removes the subscription matching the given endpoint for the authenticated user only. |

---

## 7. Services

### 7.1 `services/gamification.ts`

All public functions:

| Function | Signature | Description |
|---|---|---|
| `xpThresholdForLevel(level)` | `(number) → number` | Cumulative XP needed to reach `level`. Formula: `100 * (level-1) * level / 2` |
| `computeLevel(totalXp)` | `(number) → number` | Derives level from XP. Formula: `floor((1 + sqrt(1 + 4*xp/50)) / 2)` |
| `BASE_TASK_XP` | `const = 50` | Fallback XP per task completion |
| `getXpEventValue(key)` | `(string) → number` | Reads `xp_events` table; returns 0 if disabled |
| `awardEventXp(userId, eventKey)` | `(string, string) → SkillRow \| null` | Awards XP to the `'Activity'` skill regardless of opt-in status |
| `computeDynamicTitle(userId)` | `(string) → string \| null` | Returns highest-skill title string |
| `awardTaskXp(userId, typeId, xpMultiplier?)` | `(string, string, number?) → SkillRow \| null` | Awards task-completion XP to skill matching type name; checks gamification_enabled |
| `checkAndGrantAchievements(userId)` | `(string) → string[]` | Evaluates all achievement rules; inserts newly earned rows; returns newly unlocked keys |
| `getGamificationProfile(userId)` | `(string) → GamificationProfile` | Full profile: enabled, title, totalXp, freezeCredits, skills[], achievements[] |
| `computeNewStreakValues(...)` | `(curr, longest, frozen, completedAt, dueDate) → {newStreak, newLongest, freezeConsumed}` | Pure function (no DB) — calculates streak result after a completion |
| `awardFreezeCredit(userId)` | `(string) → void` | +1 `freeze_credits` if gamification enabled |
| `consumeFreezeCredit(userId)` | `(string) → void` | MAX(0, freeze_credits - 1) |
| `applyStreakFreeze(userId, taskId)` | `(string, string) → string \| null` | Atomic deduct credit + set `streak_frozen=1`; returns error string or null |
| `getStreaksForUser(userId)` | `(string) → StreakRow[]` | Returns active recurring tasks with streak data |
| `resetOverdueStreaks()` | `() → void` | Called by scheduler hourly; handles frozen and unfrozen overdue tasks |
| `rollLootDrop(userId, xpGained)` | `(string, number) → LootDropResult \| null` | **(private)** Rolls for a loot drop based on XP gained; stores result in `pendingDrops` cache; returns null if RNG misses, no active collectibles, or user already has an unclaimed drop |
| `claimPendingDrop(userId)` | `(string) → LootDropResult \| null` | Atomically removes and returns the pending drop from the in-memory cache; returns null if none or expired |
| `getPendingDrop(userId)` | `(string) → LootDropResult \| null` | Non-destructively peeks at the pending drop; returns null if none or expired |

**`GamificationProfile` interface:**
```typescript
interface GamificationProfile {
  enabled: boolean;
  title: string | null;
  totalXp: number;
  freezeCredits: number;
  skills: Array<{ skill_name: string; xp: number; level: number; xpForNextLevel: number }>;
  achievements: Array<{
    id: string; key: string; name: string; description: string; unlockedAt: number | null;
  }>;
}
```

**`LootDropResult` interface:**
```typescript
interface LootDropResult {
  collectibleId: string;
  collectibleName: string;
  rarity: string;        // 'common' | 'rare' | 'epic'
  categoryName: string;
  iconFilename: string | null;  // PNG filename from public/collectables/, or null
}
```

**Loot Drop Engine constants:**
| Constant | Value | Description |
|---|---|---|
| `PENDING_DROP_TTL_MS` | `600 000` (10 min) | How long a pending drop stays claimable before it expires |
| `BASE_DROP_RATE_PER_50_XP` | `0.25` | 25% drop chance per 50 XP earned |
| `MAX_DROP_CHANCE` | `0.75` | Drop probability cap (75%) |
| `XP_SCALE_FACTOR` | `50` | XP unit used to scale drop probability |
| `TOTAL_RARITY_WEIGHT` | `100` | Sum of all `RARITY_WEIGHTS` entries |
| `RARITY_WEIGHTS` | `[common:70, rare:25, epic:5]` | Weighted rarity distribution |

**`TITLE_TIERS` constant:**
| minLevel | prefix |
|---|---|
| 10 | `'Guru of'` |
| 7 | `'Master'` |
| 5 | `'Expert'` |
| 3 | `'Skilled'` |
| 1 | `'Apprentice'` |

---

### 7.2 `services/mail.ts`

**Constants:**
| Name | Value |
|---|---|
| `DEFAULT_FROM` | `process.env.SMTP_DEFAULT_FROM \|\| 'noreply@taskit.jahosi.co.uk'` |

**Functions:**
| Function | Description |
|---|---|
| `getTransporter()` | Reads `smtp_settings` from DB; returns Nodemailer transporter or `null` if disabled |
| `sendMagicLink(to, token, baseUrl, purpose)` | Sends magic link for `'login'` or `'verify'` purpose; link = `${baseUrl}?token=${token}` |
| `sendOTP(to, code)` | Sends 6-digit 2FA code; expires in 10 min |
| `sendGroupInvite(to, groupName, inviteUrl, inviterName?)` | Sends group invitation email |
| `sendPasswordReset(to, token, baseUrl)` | Link = `${baseUrl}?resetToken=${token}` |
| `sendTaskReminder(to, task, reminderLabel?)` | Overdue or upcoming reminder; uses `task.due_date` |

All functions fall back gracefully when SMTP is not configured (`console.warn` + `console.info` the link/code to server log).

---

### 7.3 `services/scheduler.ts`

**Constants:**
```
REMINDER_WINDOWS = [
  { type: '7_day',  minMs: 6d,   maxMs: 8d,   label: '7 days' },
  { type: '1_day',  minMs: 22h,  maxMs: 50h,  label: '1 day'  },
  { type: 'on_day', minMs: 0,    maxMs: 25h,  label: 'today'  },
]
```
Windows overlap intentionally to handle scheduler drift; `task_reminders_sent` deduplicates actual sends.

**Functions:**
| Function | Description |
|---|---|
| `sendPushNotificationsForUser(userId, taskId, taskTitle, windowLabel)` | Sends a Web Push payload to all subscriptions for the user; removes stale subscriptions (410/404); returns `true` if at least one delivery succeeded |
| `sendReminders()` | Async; queries tasks in each reminder window where email or popup notifications are configured; sends email (when `notify_email` and per-window email flag are set) and/or push (when per-window push flag is set) to creator and assignees; records in `task_reminders_sent` |
| `startScheduler()` | Registers `node-cron` expression `'0 * * * *'` (top of every hour); calls `sendReminders()` and `resetOverdueStreaks()` |

The scheduler resolves both email and push applicability independently per task and per timing window:
- **Email applicable**: `notify_email = 1` AND the window-specific email flag (e.g. `notify_7day = 1`).
- **Push applicable**: the window-specific push flag (e.g. `notify_popup_7day = 1`), independent of email settings.

Tasks with any applicable channel are fetched; tasks where neither channel applies for the current window are skipped.

---

## 8. Middleware Files

### 8.1 `middleware/auth.ts`

```
authMiddleware(req, res, next):
  1. Extract 'Bearer <token>' from Authorization header
  2. jwt.verify(token, JWT_SECRET) → payload: AuthPayload
  3. DB lookup: users WHERE id = payload.id → { last_active_at, locked_until }
  4. If user not found → 401
  5. If locked_until > now → 423
  6. Attach payload to req.user
  7. If last_active_at < today start → UPDATE last_active_at = now
  8. next()
```

### 8.2 `middleware/admin.ts`

```
adminMiddleware(req, res, next):
  1. req.user?.id must be present
  2. DB: SELECT role FROM users WHERE id = req.user.id
  3. If role !== 'admin' → 403
  4. next()
```

---

## 9. Configuration & Constants Files

### 9.1 `config.ts`

Loads `.env` via `dotenv/config`. All exports are module-level `const`s — see §3 for the full table.

### 9.2 `constants.ts`

Exports:
- `ALLOWED_LOCALES: ReadonlySet<string>` — 40 BCP-47 locale tags accepted for user locale preference.

### 9.3 `wordlists.ts`

**Exported arrays:**
| Export | Size | Use |
|---|---|---|
| `ADJECTIVES` | ~160 words | First word of group `invite_name` and `friend_key` |
| `VERBS` | ~160 words | (Available but not currently used in production name generation) |
| `ANIMALS` | ~80 words | Second word of group `invite_name` |
| `NOUNS` | ~80 words | Second word of `friend_key` |

**Internal array:**
| Name | Size | Use |
|---|---|---|
| `PASSWORD_WORDS` | ~120 words | Word component of `shared_key` |

**Exported functions:**
| Function | Returns | Format |
|---|---|---|
| `generateGroupName()` | string | `ADJECTIVES[rand] + ANIMALS[rand]` e.g. `"BoldAntelope"` |
| `generateSharedKey()` | string | `PASSWORD_WORDS[rand] + 3-digit-number` e.g. `"brave123"` |
| `generateFriendKey()` | string | `ADJECTIVES[rand] + NOUNS[rand]` e.g. `"BraveOcean"` |

**Internal helper:**
- `pick<T>(arr: T[]): T` — `arr[Math.floor(Math.random() * arr.length)]`

---

## 10. Frontend SPA — `public/index.html`

The entire application UI and all client-side logic is contained in a single HTML file. All JavaScript is inline (`<script>` tag). CSS comes from `app.css` and `tailwind.css`. The file is ~4000 lines.

---

### 10.1 Global State Variables

| Variable | Type | Initial value | Description |
|---|---|---|---|
| `token` | string | localStorage/sessionStorage `taskitToken` or `''` | Current JWT |
| `currentUser` | object\|null | localStorage/sessionStorage `taskitUser` or `null` | `{ id, username, email, role, locale }` |
| `taskTypes` | array | `[]` | Cached task types from `/api/task-types` |
| `groups` | array | `[]` | Cached groups from `/api/groups` |
| `tasksMap` | Map | `new Map()` | `task.id → task` for O(1) lookup by ID |
| `currentFilter` | object | `{ status:'', groupId:'', typeId:'', archived:false, assignedToMe:false, showGroupTasks:true }` | Active task list filters |
| `currentDetailTask` | object\|null | `null` | Task currently open in the detail modal |
| `blockedUserIds` | Set | `new Set()` | Set of user IDs the current user has blocked |
| `gamificationEnabled` | boolean | `false` | Mirrors `currentUser.gamification_enabled` in-memory |
| `unlockedArcadeKeys` | Set | `new Set()` | Tracks which arcade badges have been unlocked |
| `loginMode` | string | `'magic'` | `'magic'` or `'password'` — auth form mode |
| `_otpSessionId` | string\|null | `null` | OTP session ID from `/api/auth/login` response |
| `_resetToken` | string\|null | `null` | Password reset token from URL |
| `currentGroupId` | string\|null | `null` | Currently active group context |

---

### 10.2 Constants

| Constant | Value | Description |
|---|---|---|
| `POPUP_WINDOW_7D_MIN_MS` | `6 * 24 * 3600000` | Browser popup notification 7-day window min |
| `POPUP_WINDOW_7D_MAX_MS` | `8 * 24 * 3600000` | Browser popup notification 7-day window max |
| `POPUP_WINDOW_1D_MIN_MS` | `22 * 3600000` | Browser popup notification 1-day window min |
| `POPUP_WINDOW_1D_MAX_MS` | `50 * 3600000` | Browser popup notification 1-day window max |
| `POPUP_WINDOW_0D_MIN_MS` | `0` | Browser popup notification on-day window min |
| `POPUP_WINDOW_0D_MAX_MS` | `25 * 3600000` | Browser popup notification on-day window max |

---

### 10.3 Function Catalogue

#### Utility / Core
| Function | Description |
|---|---|
| `userLocale()` | Returns `currentUser.locale` or `'en-GB'` |
| `fmtDate(ts)` | `toLocaleDateString(userLocale())` |
| `fmtDateTime(ts)` | `toLocaleString(userLocale())` |
| `api(method, path, body)` | Wrapper for `fetch('/api' + path)` with JWT auth header; throws on non-OK |
| `toast(msg, type)` | Creates and auto-removes a toast notification (success/error/info) |
| `escHtml(str)` | HTML-escapes a string (replaces `&`, `<`, `>`, `"`, `'`) |
| `copyToClipboard(text)` | `navigator.clipboard.writeText` with textarea fallback |
| `fallbackCopy(text)` | Textarea-based copy for browsers without clipboard API |

#### Auth & Session
| Function | Description |
|---|---|
| `toggleLoginMode()` | Switches between magic-link and password login UI |
| `handleMagicLinkSend(e)` | POST `/auth/magic-link` |
| `handlePasswordLogin()` | POST `/auth/login`; on success shows OTP modal |
| `handleOTPVerify()` | POST `/auth/verify-otp`; calls `storeAuth()` |
| `cancelOTP()` | Hides OTP modal, clears `_otpSessionId` |
| `handleLogin(e)` | Legacy combined login handler (delegates to magic/password) |
| `showTab(tab)` | Switches between Login and Register tabs |
| `handleRegister(e)` | POST `/auth/register` |
| `storeAuth(data, rememberMe)` | Stores JWT and user in localStorage or sessionStorage |
| `logout()` | Clears storage, resets state, shows landing page |
| `goToAuth(tab)` | Shows auth page, sets active tab |
| `showForgotPassword()` / `hideForgotPassword()` | Toggle forgot-password UI |
| `handleForgotPassword()` | POST `/auth/forgot-password` |
| `handleResetPassword()` | POST `/auth/reset-password` using `_resetToken` |
| `toggleChangePassword()` | Toggle change-password form in profile |
| `handleChangePassword()` | PATCH `/users/me/password` |
| `initApp()` | Main app initialisation: loads data, handles URL params (invite tokens, reset tokens) |

#### Navigation
| Function | Description |
|---|---|
| `showPage(page)` | Shows one of `tasks`, `groups`, `progress`, `profile`, `admin`; updates nav active state |

#### Task Types
| Function | Description |
|---|---|
| `loadTypes()` | GET `/task-types`; populates `taskTypes` and filter/form selects |
| `handleTypeSelectChange()` | Handles "Add new type…" option in task form dropdown |
| `confirmAddNewType()` | POST `/task-types` |
| `cancelAddNewType()` | Resets the type select to previous value |

#### Groups
| Function | Description |
|---|---|
| `loadGroups()` | GET `/api/groups`; populates `groups` and filter select |
| `renderGroups()` | Renders group cards in the Groups view |
| `openCreateGroupModal()` / `closeCreateGroupModal()` | Modal visibility |
| `handleCreateGroup(e)` | POST `/api/groups` |
| `openJoinGroupModal()` / `closeJoinGroupModal()` | Modal visibility |
| `handleJoinGroup(e)` | POST `/api/groups/:id/join` via invite_name lookup |
| `openGroupMembers(groupId)` | GET `/api/groups/:id/members`; renders members modal |
| `sendEmailInvite()` | POST `/api/groups/:id/invite/email` |
| `generateGroupQR()` | POST `/api/groups/:id/invite/qr`; renders QR code |
| `renameGroup()` | PUT `/api/groups/:id` |
| `toggleGroupGamification(enabled)` | PATCH `/api/groups/:id/gamification` |
| `updateMyXpShare(enabled)` | PATCH `/api/groups/:id/members/me/xp-share` |
| `deleteGroup()` | DELETE `/api/groups/:id` |
| `changeMemberRole(userId, newRole)` | PATCH `/api/groups/:id/members/:userId/role` |
| `reportUser(userId, username)` | POST `/api/users/:id/report` |
| `blockUser(userId, groupId)` | POST `/api/users/:id/block` |
| `unblockUser(userId, groupId)` | DELETE `/api/users/:id/block` |

#### Tasks
| Function | Description |
|---|---|
| `loadTasks()` | GET `/api/tasks` with current filter params; populates `tasksMap` |
| `renderTasks(tasks)` | Renders task cards sorted by urgency/due-date |
| `statusMeta(status)` | Returns `{ label, cls }` for a status string |
| `toggleFilterPanel()` | Expands/collapses filter panel |
| `updateFilterBadge()` | Updates active-filter count badge |
| `setFilter(key, value)` | Updates `currentFilter` and calls `loadTasks()` |
| `applyFilters()` | Reads all filter form controls into `currentFilter` and calls `loadTasks()` |
| `openTaskModal(task?)` | Opens create (null) or edit (task) modal; populates form fields; collapses Notes panel (auto-expands if task has existing notes); hides assignee row |
| `closeTaskModal()` | Hides task modal |
| `loadGroupMembersForTask(selectedIds?)` | Populates assignee checkboxes for selected group; shows/hides `assigneeRow` depending on whether a group is selected |
| `handleTaskSubmit(e)` | POST or PATCH `/api/tasks[/:id]`; builds request body including all notification flags |
| `openDetailById(id)` | Looks up task in `tasksMap` and calls `openDetail()` |
| `openDetail(task)` | Renders task detail modal |
| `loadTaskNotes(taskId)` | GET `/api/tasks/:id/notes`; renders note list |
| `toggleAddNoteForm()` | Shows/hides add-note input |
| `submitNote()` | POST `/api/tasks/:id/notes` |
| `closeDetailModal()` | Hides detail modal |
| `quickStatus(status)` | PATCH `/api/tasks/:id/status` from detail view |
| `editCurrentTask()` | Opens edit modal pre-filled with `currentDetailTask` |
| `archiveCurrentTask()` | PATCH `/api/tasks/:id/archive` |
| `toggleDeferSection()` | Shows/hides defer-date form |
| `confirmDefer()` | PATCH `/api/tasks/:id/defer` |
| `deleteCurrentTask()` | DELETE `/api/tasks/:id` |
| `renderStreakInDetail(task)` | Renders streak section in detail modal |
| `handleApplyFreeze()` | POST `/api/gamification/streaks/:taskId/freeze` |
| `stopRecurring()` | PATCH to clear `recur_interval`/`recur_unit` |
| `toggleRecurChangeForm()` | Shows/hides recurrence-change UI |
| `saveRecurChange()` | PATCH recurrence fields |
| `toggleRecurFields()` | Shows/hides recur interval/unit fields based on checkbox |
| `setNotesPanel(open)` | Opens or closes the collapsible Notes panel; updates `aria-expanded` and toggle icon |
| `toggleNotesPanel()` | Toggles the Notes panel open/closed; focuses the textarea when opening |

#### Gamification
| Function | Description |
|---|---|
| `loadGamificationProfile()` | GET `/api/gamification/profile`; updates strip and full profile |
| `renderGamifStrip(profile, streaks)` | Updates the compact XP strip at top of Tasks view |
| `renderGamificationProfile(profile, streaks)` | Full Progress page render |
| `handleGamifToggle(checked)` | PATCH `/api/gamification/opt-in` |
| `toggleGroupLeaderboard()` | Toggle between friends/group leaderboard |
| `renderLeaderboardTable(rows, myId)` | Renders leaderboard HTML table |
| `loadFriendMyKey()` | GET `/api/friends/my-key` |
| `addFriendByKey()` | POST `/api/friends/add-by-key` |
| `generateFriendInvite()` | POST `/api/friends/invite`; renders QR |
| `loadFriendsLeaderboard()` | GET `/api/gamification/leaderboard/friends` |
| `removeFriend(friendId, username)` | DELETE `/api/friends/:friendId` |
| `loadGroupLeaderboards()` | GET leaderboard for each group with gamification_enhanced |
| `maybeShowGamifOptIn()` | Shows opt-in prompt if not yet opted in and has tasks |
| `handleGamifOptInYes()` | PATCH opt-in true |
| `handleGamifOptInNo()` | Dismisses prompt |

#### Notifications
| Function | Description |
|---|---|
| `toggleNotifModal()` | Shows/hides alerts modal |
| `refreshNotifications()` | GET `/api/users/me/alerts`; renders unread count badge |
| `dismissAlert(alertId)` | PATCH `/api/users/me/alerts/:id/read` |

#### Admin
| Function | Description |
|---|---|
| `loadAdminStats()` | GET `/api/admin/stats`; updates stat counters |
| `showAdminTab(tab)` | Switches admin sub-tabs (`smtp`, `users`, `gamify`, `feedback`) |
| `loadAdminPage()` | Loads all admin data sections |
| `handleSmtpSave(e)` | PUT `/api/admin/smtp` |
| `loadLockedAccounts()` | GET `/api/admin/locked` — results rendered inline within the Users tab |
| `unlockAccount(userId)` | POST `/api/admin/users/:id/unlock` |
| `loadUserReports()` | GET `/api/admin/reports` — results rendered inline within the Users tab |
| `resolveReport(reportId)` | PUT `/api/admin/reports/:id/resolve` |
| `loadAdminFeedback()` | GET `/api/admin/feedback` |
| `setFeedbackStatus(id, status)` | PATCH `/api/admin/feedback/:id/status` |
| `sendFeedbackReply(id)` | POST `/api/admin/feedback/:id/reply` |
| `loadXpEvents()` | GET `/api/admin/xp-events` — rendered in Gamify tab |
| `saveXpEvent(key)` | PATCH `/api/admin/xp-events/:key` |

#### Profile / Settings
| Function | Description |
|---|---|
| `saveLocale()` | PATCH `/api/users/me/locale` |
| `submitFeedback()` | POST `/api/users/me/feedback` |
| `confirmDeleteAccount()` | Double-confirmation then DELETE `/api/users/me` |
| `copyInviteLink()` | Copies app share link to clipboard |
| `loadBlockedUsers()` | GET `/api/users/blocks` |
| `loadIcsLink()` | GET `/api/users/me/ics-token`; renders ICS URL |
| `copyIcsLink()` | Copies ICS calendar URL to clipboard |
| `rotateIcsToken()` | POST `/api/users/me/ics-token/rotate` |
| `initCookieNotice()` | Shows cookie notice if not dismissed |
| `dismissCookieNotice()` | Sets `localStorage.taskitCookieDismissed` |

#### PWA / Service Worker
| Function | Description |
|---|---|
| `performAppUpdate()` | Calls `registration.update()` then `window.location.reload()` |
| `checkVersion()` | GET `/api/version`; if mismatch shows update banner |

#### Arcade
| Function | Description |
|---|---|
| `openArcade(badgeKey)` | Opens arcade modal; renders game based on badge key (hangman → `first_task`, wordsearch → `task_10`, whac-a-bug → `task_50`, code-breaker → `task_100`); calls `POST /api/gamification/arcade/spend-token` before launching |
| `closeArcade()` | Hides arcade modal |

---

### 10.4 Key HTML Element IDs

| ID | Element | Purpose |
|---|---|---|
| `toastContainer` | div | Toast notification container |
| `update-banner` | div | "New version" update prompt |
| `landingPage` | div | Landing/marketing page |
| `authPage` | div | Auth form page |
| `appPage` | div | Main app container |
| `tasksPage` | div | Tasks view |
| `groupsPage` | div | Groups view |
| `progressPage` | div | Gamification/Progress view |
| `profilePage` | div | User profile/settings view |
| `adminPage` | div | Admin panel view |
| `taskGrid` | div | Task card list |
| `filterPanel` | div | Collapsible task filters |
| `filterActiveBadge` | span | Count of active filters |
| `filterToggleBtn` | button | Filter panel toggle |
| `filterAll/NotStarted/Started/Complete` | buttons | Status filter chips |
| `filterGroup` | select | Group filter dropdown |
| `filterType` | select | Type filter dropdown |
| `filterArchived` | checkbox | Show archived toggle |
| `filterAssignedToMe` | checkbox | Assigned-to-me filter |
| `tasksGamifStrip` | div | Gamification XP strip |
| `stripSkillName` | span | Top skill name in strip |
| `stripSkillBadge` | span | Level badge in strip |
| `stripBarFill` | div | XP progress bar fill |
| `stripXpSub` | div | XP subtitle text |
| `stripStreak` | div | Streak count in strip |
| `stripAchBadge` | div | Achievement unlock indicator |
| `taskModal` | div | Create/edit task modal |
| `taskEditId` | input | Hidden edit task ID |
| `taskType` | select | Type select in task form |
| `taskGroup` | select | Group select in task form |
| `taskDueDate` | input | Due date input |
| `taskRecurEnabled` | checkbox | Enable recurrence checkbox |
| `taskXpMultiplierRow` | div | XP multiplier row (group-only) |
| `taskXpMultiplier` | input | XP multiplier value |
| `assigneeRow` | div | "Assign To" form row — hidden until a group is selected |
| `assigneeContainer` | div | Assignee checkboxes container (inside `assigneeRow`) |
| `notesToggleBtn` | button | Notes collapsible toggle button |
| `notesToggleIcon` | span | Arrow icon inside notes toggle (▶ / ▼) |
| `notesPanel` | div | Collapsible notes panel (hidden by default; auto-expanded when editing a task with existing notes) |
| `loginForm` | form | Login form |
| `registerForm` | form | Register form |
| `loginEmail` | input | Login email |
| `loginPassword` | input | Login password |
| `regUsername` | input | Registration username |
| `regEmail` | input | Registration email |
| `regPassword` | input | Registration password |
| `regConfirmPassword` | input | Registration confirm password |
| `regLocale` | select | Registration locale |
| `rememberMeMagic` | checkbox | Remember me (magic link) |
| `rememberMePassword` | checkbox | Remember me (password) |
| `otpCode` | input | 2FA OTP code input |
| `forgotEmail` | input | Forgot password email input |
| `resetNewPassword` | input | New password in reset form |
| `resetConfirmPassword` | input | Confirm password in reset form |
| `profileLocale` | select | Locale setting in profile |
| `currentPassword` | input | Current password in change form |
| `newPassword` | input | New password in change form |
| `confirmNewPassword` | input | Confirm new password |
| `changePasswordForm` | div | Change password form container |
| `changePasswordSection` | div | Change password toggle button |
| `groupList` | div | Group cards container |
| `createGroupModal` | div | Create group modal |
| `createGroupName` | input | New group name input |
| `joinGroupModal` | div | Join group modal |
| `joinGroupName` | input | Group invite name to join |
| `joinGroupKey` | input | Group shared key |
| `joinGroupXpShare` | checkbox | XP share preference on join |
| `notifyEmail7day` | checkbox | Email 7-day reminder toggle |
| `notifyEmail1day` | checkbox | Email 1-day reminder toggle |
| `notifyEmailOnday` | checkbox | Email on-day reminder toggle |
| `fabNewTask` | button | Floating action button (new task) |
| `feedbackMessage` | textarea | Feedback message input |
| `feedbackContactOk` | checkbox | Feedback contact consent |
| `cookieNotice` | div | Cookie consent banner |
| `navTasks/Groups/Progress/Profile/Admin` | buttons | Bottom navigation buttons |
| `authFooterVersion` | span | Version string in auth footer |

---

### 10.5 Pages / Views

The SPA has 5 main pages toggled by `showPage(page)`:

| `page` arg | Main div ID | Loaded by |
|---|---|---|
| `'tasks'` | `tasksPage` | `loadTasks()`, `loadGamificationProfile()` |
| `'groups'` | `groupsPage` | `loadGroups()` |
| `'progress'` | `progressPage` | `loadGamificationProfile()` |
| `'profile'` | `profilePage` | `loadBlockedUsers()`, `loadIcsLink()`, `refreshNotifications()` |
| `'admin'` | `adminPage` | `loadAdminPage()` (only if `currentUser.role === 'admin'`) |

Additionally there are overlay pages: `landingPage`, `authPage`.

---

### 10.6 Authentication & Session Flow

**Token storage:**
- `rememberMe = true` → `localStorage` (persists across browser sessions)
- `rememberMe = false` → `sessionStorage` (cleared on browser close)

**Keys used:**
| Key | Storage | Content |
|---|---|---|
| `taskitToken` | localStorage / sessionStorage | JWT string |
| `taskitUser` | localStorage / sessionStorage | JSON `{ id, username, email, role, locale }` |
| `taskitCookieDismissed` | localStorage | `'1'` when cookie notice dismissed |
| `pendingInvite` | sessionStorage | Group invite token for post-login join |
| `pendingFriendInvite` | sessionStorage | Friend invite token for post-login accept |

**JWT payload:**
```json
{ "id": "<uuid>", "username": "...", "email": "...", "role": "user|admin", "locale": "en-GB" }
```
Expiry: 7 days (normal) or 30 days (`rememberMe = true`).

---

### 10.7 Storage Keys

| Key | Type | Purpose |
|---|---|---|
| `taskitToken` | localStorage / sessionStorage | JWT authentication token |
| `taskitUser` | localStorage / sessionStorage | Serialised user object |
| `taskitCookieDismissed` | localStorage | Cookie banner dismiss flag |
| `pendingInvite` | sessionStorage | Group invite token awaiting post-login use |
| `pendingFriendInvite` | sessionStorage | Friend invite token awaiting post-login use |

---

## 11. Frontend JS Files (`public/js/`)

| File | Description |
|---|---|
| `version.js` | Fetches `/api/version`, populates all `.page-version` elements with the version string |
| `qrcode.js` | Third-party QR code generator library — exposes global `QRCode` constructor |
| `game-hangman.js` | Hangman mini-game implementation (loaded lazily when arcade is opened with a hangman badge) |
| `game-wordsearch.js` | Word search mini-game implementation (loaded lazily for wordsearch badge) |
| `game-code-breaker.js` | Code Breaker mini-game — number-guessing puzzle with colour-coded hints (loaded lazily for code-breaker badge) |
| `game-whac-a-bug.js` | Whac-a-Bug mini-game — timed reaction game; tap bugs before they disappear (loaded lazily for whac-a-bug badge) |

---

## 12. Service Worker (`public/sw.js`)

**Constant:**
- `CACHE_NAME` — Set to `'taskit-__APP_VERSION__'` in source; the server replaces `__APP_VERSION__` with the real version string at runtime (via `/sw.js` dynamic endpoint).

**Precached static assets:**
```
'/', '/app.css', '/tailwind.css', '/manifest.json',
'/js/version.js', '/js/qrcode.js',
'/privacy-policy.html', '/user-guide.html', '/howto.html'
```

**Cache strategy:**
| Request | Strategy |
|---|---|
| `/api/*` | Network-first; returns `503` JSON on network failure |
| `/calendar/*` | Network-first |
| SPA navigate (not static pages) | Serve precached root shell (`/`) |
| Static info pages | Cache-first from SW cache |
| Other static assets | Cache-first; falls through to network |

**Lifecycle:**
- `install` — Opens `CACHE_NAME` cache, adds all static assets, `skipWaiting()`
- `activate` — Deletes all caches not matching `CACHE_NAME`, `clients.claim()`

---

## 13. PWA Manifest (`public/manifest.json`)

| Field | Value |
|---|---|
| `name` | `"TaskIt! – Task Management"` |
| `short_name` | `"TaskIt!"` |
| `start_url` | `"/"` |
| `display` | `"standalone"` |
| `orientation` | `"any"` |
| `background_color` | `"#f5f3ff"` |
| `theme_color` | `"#7c3aed"` |
| `lang` | `"en-GB"` |
| `categories` | `["productivity", "utilities"]` |
| `icons` | 72×72 through 512×512 (maskable + any purpose) from `/icons/` |
| `shortcuts` | "My Tasks" → `/?page=tasks` |

---

## 14. Gamification Engine — Detailed Mechanics

### 14.1 XP Events Catalogue

These are stored in `xp_events` and admin-configurable:

| Key | Default XP | Description |
|---|---|---|
| `signup` | 100 | Awarded on first registration |
| `create_task` | 10 | Awarded when a task is created |
| `create_group` | 25 | Awarded when a group is created |
| `send_app_invite` | 15 | Awarded when a friend invite link is generated |
| `send_group_invite` | 15 | Awarded when a group invite is sent |
| `complete_task` | 50 | Base XP per task completion (before multiplier) |
| `recycle_drop` | 15 | Awarded when the user recycles (discards) a pending loot drop |
| `complete_subtask` | 5 | Awarded each time a sub-task checklist item is ticked off |

All event XP goes to the `'Activity'` skill via `awardEventXp()`.  
Task-completion XP goes to the skill matching the task type name via `awardTaskXp()`.

---

### 14.2 Achievements Catalogue

| Key | Name | Condition | Arcade Game |
|---|---|---|---|
| `first_task` | First Steps | Complete 1 task | Hangman |
| `task_10` | Getting Started | Complete 10 tasks | Wordsearch |
| `task_50` | On a Roll | Complete 50 tasks | Whac-a-Bug |
| `task_100` | Centurion | Complete 100 tasks | Code Breaker |
| `task_500` | Task Master | Complete 500 tasks | *(in development)* |
| `detail_oriented` | Detail Oriented | Add 50 progress notes | *(in development)* |
| `early_bird` | Early Bird | Complete 10 tasks before due date | *(in development)* |
| `type_explorer` | Type Explorer | Complete tasks across 5 different types | *(in development)* |
| `skill_level_5` | Specialist | Reach level 5 in any skill | *(in development)* |
| `skill_level_10` | Master of the Craft | Reach level 10 in any skill | *(in development)* |
| `streak_3` | Hat Trick | Recurring task streak of 3 | Hat Trick *(in development)* |
| `streak_7` | Lucky Streak | Recurring task streak of 7 | Lucky Draw *(in development)* |
| `streak_30` | Unstoppable | Recurring task streak of 30 | *(in development)* |

Games are assigned to achievements in earliest-unlock order: Hangman, Wordsearch, Whac-a-Bug, Code Breaker unlock at the 1st, 2nd, 3rd, and 4th achievements respectively.  
Each achievement card displays the associated game title so users know what they are working toward.

Achievement IDs are identical to their keys (deterministic across restarts).  
Checking is triggered by: task completion, note creation, gamification opt-in.

---

### 14.3 Level Formula

```
xpThresholdForLevel(n) = 100 × (n-1) × n / 2

Level 1: 0 XP required
Level 2: 100 XP (cumulative)
Level 3: 300 XP
Level 4: 600 XP
Level 5: 1000 XP
Level n: 50 × n × (n-1)

computeLevel(xp) = max(1, floor( (1 + sqrt(1 + 4×xp/50)) / 2 ))
```

`xpForNextLevel` returned in the profile = `xpThresholdForLevel(level + 1) - currentXp`

---

### 14.4 Streak System

**Tracking:** `streak_current`, `streak_longest`, `streak_frozen` columns on `tasks`.

**On task completion (`PATCH /:id/status` with `status='complete'`):**
1. `computeNewStreakValues(current, longest, frozen, completedAt, dueDate)` is called (pure, no DB).
2. If completed on time (`completedAt <= dueDate`) → `newStreak = current + 1`
3. If late but `streakFrozen = true` → freeze absorbs the miss; `newStreak = current + 1`, `freezeConsumed = true`
4. If late and not frozen → `newStreak = 0`
5. `newLongest = max(longest, newStreak)`
6. New occurrence inherits `streak_current = newStreak`, `streak_longest = newLongest`, `streak_frozen = 0`

**Hourly scheduler (`resetOverdueStreaks()`):**
- Frozen overdue tasks: clears `streak_frozen` (freeze absorbs the miss)
- Unfrozen overdue tasks: sets `streak_current = 0`

**Freeze credits:**
- +1 awarded per task completion (if gamification enabled)
- Spending 1 freeze: atomic DB transaction: `freeze_credits - 1` + `streak_frozen = 1`

---

### 14.5 Title Tiers

Dynamic title = highest-level skill + tier prefix:

| Skill level | Title format |
|---|---|
| ≥ 10 | `"Guru of <SkillName>"` |
| ≥ 7 | `"Master <SkillName>"` |
| ≥ 5 | `"Expert <SkillName>"` |
| ≥ 3 | `"Skilled <SkillName>"` |
| ≥ 1 | `"Apprentice <SkillName>"` |

Returned as `null` if the user has no skills yet or gamification is disabled.

---

## 15. Email / SMTP System

Mail configuration is stored in the `smtp_settings` table (singleton, id=1). Settings are read **at send time** (not cached), so changes via the admin UI take effect immediately.

**Mail functions called and when:**

| Function | Triggered by |
|---|---|
| `sendMagicLink(to, token, baseUrl, 'verify')` | POST `/api/auth/register` |
| `sendMagicLink(to, token, baseUrl, 'login')` | POST `/api/auth/magic-link` |
| `sendOTP(to, code)` | POST `/api/auth/login` (step 1) |
| `sendPasswordReset(to, token, baseUrl)` | POST `/api/auth/forgot-password` |
| `sendGroupInvite(to, groupName, inviteUrl, inviterName)` | POST `/api/groups/:id/invite/email` |
| `sendTaskReminder(to, task, label)` | Hourly scheduler |

**Fallback behaviour:** When SMTP is not configured or `enabled = 0`, all send functions silently skip the actual send and log the link/code to the server console at `info` level. This means magic links still "work" in development — the admin just needs to check the server logs.

---

## 16. Recurring Tasks — Spawn Logic

When a recurring task is completed (`PATCH /:id/status` with `status='complete'`):

1. `computeNextDue(task.due_date, task.recur_interval, task.recur_unit)` calculates the next due date.
2. A **new task row** is INSERTed with:
   - Same `title`, `details`, `type_id`, `created_by`, `group_id`
   - Same notification flags
   - `status = 'not_started'`
   - `archived = 0`
   - `due_date = nextDue`
   - `streak_current`, `streak_longest` from `computeNewStreakValues()`
   - `streak_frozen = 0`
   - Same `xp_multiplier`
3. All assignees from the completed task are copied to the new task.
4. All **sub-tasks** from the completed task are copied to the new task with `completed = 0`, `completed_by = NULL`, `completed_at = NULL` — so the checklist is ready to be worked through again in the next recurrence.
5. The **original task** is archived (`archived = 1`).
6. This is done in a single `db.transaction()`.

When a recurring task is **deleted** (by creator or group admin), the same spawn logic runs first (copying assignees and sub-tasks to the new occurrence with reset completion state, then preserving the schedule), then the original row is deleted.

The `PATCH /:id/fast-forward` endpoint advances the due date by one interval **without** completing the task — useful for skipping an occurrence while preserving the task's active status. It also clears `task_reminders_sent` for the task so reminders re-fire against the new date.

**`computeNextDue(dueDateMs, interval, unit)` behaviour:**
| unit | operation |
|---|---|
| `'days'` | `d.setDate(d.getDate() + interval)` |
| `'weeks'` | `d.setDate(d.getDate() + interval * 7)` |
| `'months'` | `d.setMonth(d.getMonth() + interval)` |
| `'years'` | `d.setFullYear(d.getFullYear() + interval)` |

---

## 17. ICS Calendar Feed

**URL format:** `GET /calendar/<ics_token>/tasks.ics`

- `ics_token` is a 64-char lowercase hex string (32 random bytes) stored in `users.ics_token`.
- No JWT required — the token acts as the secret.
- The token can be rotated via `POST /api/users/me/ics-token/rotate`.
- Returns a `text/calendar` response conforming to iCalendar RFC 5545.
- Includes all non-archived tasks with a `due_date` that the user owns, is assigned to, or can access via group membership.
- VEVENT fields: `UID`, `SUMMARY` (with group prefix), `DESCRIPTION` (details, type, group, status), `DTSTART`, `DTEND`, `DTSTAMP`, `CREATED`.
- Long lines are folded at 75 chars per RFC 5545 §3.1.
- `PRODID: -//TaskIt!//TaskIt! Task Manager//EN`
- `X-WR-CALNAME: TaskIt! – <username>`
- UID domain: `<task.id>@<BASE_URL hostname>` (falls back to `taskit.jahosi.co.uk`)
- Cache-Control: `no-store, no-cache, must-revalidate`

---

## 18. Android App

Location: `android/`

The Android app is a minimal WebView wrapper. It loads the TaskIt! web app in a full-screen WebView component.

| File | Description |
|---|---|
| `settings.gradle` | Gradle project settings |
| `build.gradle` | Top-level build config |
| `gradle.properties` | Gradle JVM args |
| `app/build.gradle` | App module build config (applicationId, SDK versions, dependencies) |
| `app/src/main/` | Kotlin source, AndroidManifest.xml, resources (layouts, icons, strings) |
| `android/docs/` | Publishing documentation |

The app does not contain any native backend logic — all data is fetched from the configured server URL.

---

## 19. Scripts Directory

| File | Description |
|---|---|
| `scripts/generate-icons.js` | Node.js script — reads a source image and generates all 8 PWA icon sizes (72×72 through 512×512 PNG) into `public/icons/`. Run manually when updating the app icon. |

---

## 20. Build System & NPM Scripts

All scripts are defined in `server/package.json`:

| Script | Command | Description |
|---|---|---|
| `build:css` | `tailwindcss -i src/css/input.css -o ../public/tailwind.css --minify` | Compiles and minifies Tailwind CSS |
| `build` | `npm run build:css && tsc` | Full production build: CSS then TypeScript |
| `start` | `node dist/index.js` | Start compiled production server |
| `dev:css` | `tailwindcss ... --watch` | Watch mode for Tailwind CSS |
| `dev` | `tsx watch src/index.ts` | Development server with hot-reload via tsx |

**TypeScript output:** `server/dist/` (`.js` files, configured in `tsconfig.json`)

**Production runtime dependencies:**

| Package | Version | Purpose |
|---|---|---|
| `bcryptjs` | ^2.4.3 | Password hashing (10 rounds) |
| `better-sqlite3-multiple-ciphers` | ^12.8.0 | Synchronous SQLite with optional encryption |
| `dotenv` | ^17.4.1 | Environment variable loading |
| `express` | ^4.18.3 | HTTP server framework |
| `express-rate-limit` | ^8.3.2 | IP/user-based rate limiting |
| `helmet` | ^8.1.0 | Security HTTP headers |
| `jsonwebtoken` | ^9.0.2 | JWT sign/verify |
| `node-cron` | ^4.2.1 | Cron scheduler (1× hourly) |
| `nodemailer` | ^8.0.5 | SMTP email sending |

---

## 21. Security Model Summary

| Layer | Mechanism |
|---|---|
| Passwords | bcryptjs, 10 rounds; max 128 chars to prevent bcrypt truncation exploitation |
| OTP codes | SHA-256 hashed before storage; timing-safe comparison on verify |
| JWT | HMAC-SHA256 (`HS256`); 7-day or 30-day expiry; re-verified against DB on every request |
| Magic tokens | 32 cryptographically random bytes (hex); 15-min TTL; single-use; `purpose` field prevents cross-purpose reuse |
| Friend keys | Timing-safe comparison; whitespace and case normalised before compare |
| Account lockout | After `MAX_LOGIN_ATTEMPTS` (default 5) failures; `LOCKOUT_MINUTES` (default 30) duration |
| Database encryption | Optional AES via SQLCipher (`DB_ENCRYPTION_KEY`); raw-key form (`x'hex'`) avoids KDF |
| SQL injection | All user input passed as `?` parameters; SQL structure never interpolated from user data (column/table names validated against `VALID_IDENTIFIER` regex before ALTER TABLE in migrations) |
| Rate limiting | 3-tier: auth (20/15min), general (200/15min), authenticated (2000/15min per user ID) |
| CORS | Explicit allowlist; wildcard (`*`) disallows credentials; `Vary: Origin` header set |
| CSP | Via Helmet; `'unsafe-inline'` retained for scripts (inline SPA architecture) |
| ICS token | 32 random bytes; acts as bearer secret; rotatable |
| SMTP password | Stored plaintext in `smtp_settings.pass` (admin-only accessible table) |
| Email enumeration | Magic link, forgot-password, and OTP endpoints always return `200` regardless of whether the email exists |

---

## 22. Inter-component Data Flow Diagrams

### Task Creation Flow

```
User fills task form in SPA
        │ POST /api/tasks
        ▼
handleTaskSubmit() in index.html
  → api('POST', '/tasks', { title, typeId, groupId, assigneeIds, dueDate,
                             recurInterval, recurUnit, notify*, xpMultiplier })
        │
        ▼
tasks.ts POST / handler (authMiddleware → user verified)
  1. Validate typeId exists
  2. Validate groupId membership (if provided)
  3. Validate xpMultiplier (group gamification_enhanced required)
  4. INSERT tasks row
  5. awardEventXp(userId, 'create_task') → user_skills 'Activity'
  6. INSERT task_assignees (validated IDs only)
  7. INSERT user_alerts for each assignee ≠ creator
  8. SELECT back the new task
        │
        ▼
201 JSON { task + assignees }
        │
        ▼
loadTasks() → renderTasks()
```

### Task Completion Flow (Recurring)

```
User taps Complete in SPA
  → quickStatus('complete')
  → api('PATCH', '/tasks/:id/status', { status: 'complete' })
        │
        ▼
tasks.ts PATCH /:id/status
  1. Validate access (creator / assignee / group member)
  2. UPDATE tasks SET status='complete', completed_at=now, completed_by=userId
  3. Load full task from DB
  4. If recur_interval set:
     a. computeNewStreakValues() (pure)
     b. computeNextDue() → nextDue
     c. TRANSACTION:
        - INSERT new task with next due, streak values, xp_multiplier
        - Copy assignees
        - UPDATE old task SET archived=1
  5. Gamification (non-critical try/catch):
     a. awardTaskXp(userId, typeId, xpMultiplier) → user_skills[typeName]
     b. awardFreezeCredit(userId) → users.freeze_credits +1
     c. consumeFreezeCredit(userId) if freeze was consumed
     d. checkAndGrantAchievements(userId) → user_achievements
        │
        ▼
200 JSON { updated task }
        │
        ▼
SPA: loadTasks() + loadGamificationProfile() → renderGamifStrip()
```

### Authentication Flow (Password + OTP)

```
1. User enters email + password
   → POST /api/auth/login
   → bcrypt.compareSync(password, hash)
   → Generate 6-digit OTP; store SHA-256 in otp_tokens; email via sendOTP()
   ← { status: 'otp_required', sessionId: <uuid> }

2. SPA stores sessionId in _otpSessionId; shows OTP input modal

3. User enters OTP
   → POST /api/auth/verify-otp { sessionId, code, rememberMe }
   → SHA-256(submitted code) timingSafeEqual stored hash
   → Mark otp_tokens.used = 1
   → jwt.sign({ id, username, email, role, locale })
   ← { token, user, rememberMe }

4. SPA calls storeAuth() → localStorage/sessionStorage
5. initApp() loads data, shows tasks page
```

### Hourly Scheduler Flow

```
node-cron: '0 * * * *'
        │
        ├─► sendReminders()
        │     For each REMINDER_WINDOW:
        │       Query tasks with due_date in window,
        │       not complete, not archived,
        │       notify_email=1, no reminder sent yet
        │       For each task:
        │         Collect creator + assignees
        │         sendTaskReminder() via SMTP
        │         INSERT task_reminders_sent
        │
        └─► resetOverdueStreaks()
              UPDATE tasks SET streak_frozen=0
                WHERE overdue AND frozen (freeze absorbs miss)
              UPDATE tasks SET streak_current=0
                WHERE overdue AND not frozen AND streak_current > 0
```

---

*End of Technical Reference Manual — TaskIt! v1.12.0*
