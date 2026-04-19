# Jobber – Task Management App

**Version 1.3.1** | Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)

A cross-platform task management application with a Node.js/TypeScript server, web frontend, and Android app.

## Features

- User registration with email verification
- Magic-link and password login with two-factor authentication (OTP)
- **Forgot password** — self-service password reset via email link
- **Change password** — users can update their password from the Profile page
- Account lockout protection
- Create and manage tasks with types, notes, and status tracking
- Task statuses: Not Started → Started → Complete
- Recurring tasks — automatically create the next occurrence when complete
- Task deferral — reschedule due date from the detail panel
- Custom task types per user and per group
- Archive and delete tasks
- Group collaboration with invite word pairs and shared secret keys
- Email invites and QR code / shareable invite links for groups
- Assign tasks to group members
- Progress notes on tasks
- In-app alerts for overdue and due-soon tasks
- **Per-task notification preferences** — choose whether to receive email reminders and/or browser popup notifications for each task, with a grid selecting 7-day, 1-day, and on-the-day timing
- Group member access control — any group member can edit all task fields (title, due date, recurrence, notes, status, defer, archive); only the task creator or a group admin can delete a task
- Calendar integration — private ICS feed for any calendar app
- Date & time locale preference per user
- User reporting and blocking
- User feedback submission with in-app admin replies
- Self-service account deletion (GDPR right to erasure)
- Admin panel: stats dashboard, SMTP configuration, locked accounts, user reports, feedback management
- **Database encryption** — full SQLite file encryption at rest via SQLCipher (set `DB_ENCRYPTION_KEY` env var)
- **Gamification Engine** — opt-in XP system, skill trees, dynamic titles, personal achievements, streak tracking, and freeze mechanic (see below)

## Gamification Engine

Jobber includes a fully opt-in gamification system that rewards consistent productivity. It activates per-user and never affects the core task management experience for those who prefer it off.

### Skill Trees & XP

Every time you complete a task, you earn **50 XP** in the skill matching the task type (e.g. completing a *Household* task earns Household XP). XP accumulates to increase your skill level using a triangular progression curve:

| Level | Cumulative XP required |
|-------|------------------------|
| 1     | 0 XP                   |
| 2     | 100 XP                 |
| 3     | 300 XP                 |
| 4     | 600 XP                 |
| 5     | 1,000 XP               |
| n     | 50 × n × (n−1) XP      |

### Dynamic Titles

Your highest-level skill earns you a title that appears on your profile:

| Skill Level | Title prefix  | Example               |
|-------------|---------------|-----------------------|
| 10+         | Guru of       | Guru of Household     |
| 7–9         | Master        | Master of Routine     |
| 5–6         | Expert        | Expert at Hobby       |
| 3–4         | Skilled       | Skilled in Finance    |
| 1–2         | Apprentice    | Apprentice of Urgent  |

### Achievements

| Key              | Name                 | How to earn                                    |
|------------------|----------------------|------------------------------------------------|
| `first_task`     | First Steps          | Complete your first task                       |
| `task_10`        | Getting Started      | Complete 10 tasks                              |
| `task_50`        | On a Roll            | Complete 50 tasks                              |
| `task_100`       | Centurion            | Complete 100 tasks                             |
| `task_500`       | Task Master          | Complete 500 tasks                             |
| `detail_oriented`| Detail Oriented      | Add 50 progress notes                          |
| `early_bird`     | Early Bird           | Complete 10 tasks before their due date        |
| `type_explorer`  | Type Explorer        | Complete tasks across 5 different task types   |
| `skill_level_5`  | Specialist           | Reach level 5 in any skill                     |
| `skill_level_10` | Master of the Craft  | Reach level 10 in any skill                    |
| `streak_3`       | Hat Trick            | Keep a recurring task streak of 3              |
| `streak_7`       | Lucky Streak         | Keep a recurring task streak of 7              |
| `streak_30`      | Unstoppable          | Keep a recurring task streak of 30             |

### Streaks & Freeze Credits

Recurring tasks track a **streak** — how many consecutive times you have completed them on or before the due date. Streaks survive as a running count on each task series.

- **Streak current** — consecutive on-time completions so far
- **Streak longest** — all-time best for that task series
- **Freeze Credits** — earned by completing any task (1 credit per completion), spendable to protect a streak from a single missed deadline (`POST /api/gamification/streaks/:taskId/freeze`)

When a frozen task is missed, the freeze absorbs the miss and the streak is preserved. The hourly scheduler resets unfrozen overdue streaks and clears consumed freezes.

## Stack

| Layer    | Technology                                               |
|----------|----------------------------------------------------------|
| Server   | Node.js, TypeScript, Express                             |
| Database | SQLite via `better-sqlite3-multiple-ciphers` (SQLCipher) |
| Auth     | JWT + bcryptjs + SQLCipher encryption at rest            |
| Frontend | Vanilla JS, Tailwind CSS (build-time), `qrcode-generator` (client-side QR) |
| Android  | Kotlin, Retrofit, DataStore                              |

## Changelog

### v1.3.1

- **⭐ Progress tab** — dedicated bottom-navigation tab housing the full gamification dashboard (Skills, Achievements, Streaks). Gamification content moved from the Profile page to Progress for better discoverability.
- **Persistent XP/streak strip** — a slim interactive banner at the top of My Tasks shows the user's top skill name, level badge, XP progress bar, and best active streak count. Tapping it navigates to the Progress tab. Only visible when gamification is enabled.
- **Floating Action Button (FAB)** — a large `+` button fixed at the bottom-right of the Tasks page replaces the in-header "New Task" button, positioning the primary action where thumbs naturally rest.
- **Collapsible filter panel** — all task filters are now hidden behind a single `⚙️ Filters` chip. An active-filter count badge highlights the chip when filters are applied. Recovers vertical space on the Tasks page.
- **Gamification opt-in prompt** — first-time users who haven't been asked are shown a bottom-sheet modal offering to enable gamification. Shown once per device; remembered in `localStorage`.
- **Informational storage notice** — a dismissable banner appears on the landing/auth pages for first-time visitors, explaining that Jobber uses only essential `localStorage` (no tracking cookies). Dismissed state persisted in `localStorage`.
- **Privacy policy v1.1.0** — Section 3 extended with rows for Preferences, Calendar Integration, Feedback, and Gamification data. Section 6 (Retention) extended with Feedback, Gamification data, and ICS token retention periods. Section 10 (Browser Storage) fully rewritten: enumerates all six `localStorage` keys with purpose and legal basis, and confirms no HTTP cookies are used.
- **Landing page** — phone mockups updated to show the new five-item navigation bar (Tasks, Groups, Alerts, ⭐ Progress, Profile).

### v1.2.1

- **Dependency reduction** — removed `uuid`, `cors`, `qrcode`, `@types/qrcode`, `@types/uuid`, `@types/cors`, `@types/express-rate-limit`, and `@types/helmet` from `package.json`. Total package count reduced from 279 to 243 (−36 packages, −13%).
  - UUIDs are now generated with Node's built-in `crypto.randomUUID()` — no external package needed.
  - CORS headers are handled by a small inline middleware in `index.ts` — identical behaviour to the `cors` package.
  - QR code generation moved entirely to the browser using the bundled `qrcode-generator` library (`public/js/qrcode.js`). The `/api/groups/:id/qr` endpoint now returns `{ invite_url, expires_at }` only; the client generates the QR image locally. This eliminates the `qrcode`, `yargs`, `dijkstrajs`, `pngjs`, and related packages from the server.
  - `helmet` v8 and `express-rate-limit` v8 ship their own TypeScript declarations — the separate `@types/` stubs are no longer needed.
- **Service worker** — `qrcode.js` added to `STATIC_ASSETS` for precaching alongside other static scripts.

### v1.1.0

- Gamification engine — opt-in XP system, skill trees, dynamic titles, achievements, streak tracking, and freeze mechanic.
- Per-task notification preferences grid (email + popup × 7-day / 1-day / on-day).
- ICS calendar feed (private token-based URL).
- Task fast-forward, defer, recurrence.
- Database encryption via SQLCipher.
- Admin panel: stats, SMTP, locked accounts, user reports, feedback management.
- Group QR invite links, email invites, invite word-pair join flow.

## Setup

### Server

```bash
cd server
npm install
npm run dev       # development (tsx watch)
npm run build     # compile TypeScript + CSS
npm start         # run compiled output
```

The server runs on **port 3000** by default (set `PORT` env var to override).  
The web frontend is served from the `public/` directory at the root URL.

### Web Frontend

Open `http://localhost:3000` after starting the server. No separate build step needed.

### Android

1. Open the `android/` folder in Android Studio.
2. Sync Gradle.
3. Run on an emulator (the app points to `http://10.0.2.2:3000` — the host machine's localhost).
4. To use a physical device, update `BASE_URL` in `ApiClient.kt` to your machine's LAN IP.

## API Endpoints

### Auth
| Method | Path                           | Description                              |
|--------|--------------------------------|------------------------------------------|
| POST   | /api/auth/register             | Register new user                        |
| POST   | /api/auth/login                | Login → JWT or OTP session               |
| POST   | /api/auth/verify-otp           | Verify 2FA OTP code → JWT                |
| GET    | /api/auth/magic-link/verify    | Verify magic link token → JWT            |
| POST   | /api/auth/forgot-password      | Send password-reset email                |
| POST   | /api/auth/reset-password       | Set new password via reset token         |

### Tasks
| Method | Path                      | Description                           |
|--------|---------------------------|---------------------------------------|
| GET    | /api/tasks                | List tasks (filters: status, groupId, typeId, archived, assignedToMe) |
| POST   | /api/tasks                | Create task (supports recurrence)     |
| PATCH  | /api/tasks/:id            | Update task                           |
| PATCH  | /api/tasks/:id/status     | Update status only                    |
| PATCH  | /api/tasks/:id/archive    | Toggle archive                        |
| PATCH  | /api/tasks/:id/defer      | Update due date (defer)               |
| PATCH  | /api/tasks/:id/fast-forward | Advance due date by one interval     |
| DELETE | /api/tasks/:id            | Delete task                           |
| GET    | /api/tasks/:id/notes      | List progress notes for a task        |
| POST   | /api/tasks/:id/notes      | Add a progress note                   |

### Groups
| Method | Path                                    | Description                          |
|--------|-----------------------------------------|--------------------------------------|
| GET    | /api/groups                             | List my groups                       |
| POST   | /api/groups                             | Create group                         |
| POST   | /api/groups/join                        | Join with invite word pair + key     |
| GET    | /api/groups/:id/members                 | List members                         |
| PATCH  | /api/groups/:id/name                    | Rename group (admin)                 |
| PATCH  | /api/groups/:id/members/:userId/role    | Change member role (admin)           |
| POST   | /api/groups/:id/members/:userId/promote | Promote member to admin              |
| POST   | /api/groups/:id/members/:userId/demote  | Demote admin to member               |
| POST   | /api/groups/:id/invite                  | Send email invite (admin)            |
| GET    | /api/groups/:id/qr                      | Generate QR invite link (admin)      |
| GET    | /api/groups/invite/:token               | Look up invite by token              |
| POST   | /api/groups/invite/:token/accept        | Accept invite link                   |
| DELETE | /api/groups/:id                         | Delete group (admin)                 |

### Task Types
| Method | Path                | Description                       |
|--------|---------------------|-----------------------------------|
| GET    | /api/task-types     | List available types              |
| POST   | /api/task-types     | Create custom type                |
| DELETE | /api/task-types/:id | Delete a custom or group type     |

### Users
| Method | Path                          | Description                          |
|--------|-------------------------------|--------------------------------------|
| PATCH  | /api/users/me/locale          | Update date/time locale preference   |
| PATCH  | /api/users/me/password        | Change own password                  |
| GET    | /api/users/me/alerts          | List in-app alerts                   |
| PATCH  | /api/users/me/alerts/:id/read | Mark alert as read                   |
| GET    | /api/users/me/ics-token       | Get/create ICS calendar token        |
| POST   | /api/users/me/ics-token/rotate| Rotate ICS calendar token            |
| POST   | /api/users/me/feedback        | Submit feedback message              |
| DELETE | /api/users/me                 | Delete own account (all data)        |
| POST   | /api/users/:id/report         | Report a user                        |
| POST   | /api/users/:id/block          | Block a user                         |
| DELETE | /api/users/:id/block          | Unblock a user                       |
| GET    | /api/users/blocks             | List blocked users                   |

### Gamification
| Method | Path                                       | Description                                              |
|--------|--------------------------------------------|----------------------------------------------------------|
| GET    | /api/gamification/profile                  | Full gamification profile (skills, achievements, title)  |
| PATCH  | /api/gamification/opt-in                   | Enable or disable gamification `{ enabled: boolean }`   |
| GET    | /api/gamification/achievements             | Full achievement catalogue with unlock status            |
| GET    | /api/gamification/streaks                  | Streak data for all accessible recurring tasks           |
| POST   | /api/gamification/streaks/:taskId/freeze   | Spend 1 freeze credit to protect a streak               |

### Admin
| Method | Path                          | Description                          |
|--------|-------------------------------|--------------------------------------|
| GET    | /api/admin/smtp               | Get SMTP settings                    |
| PUT    | /api/admin/smtp               | Update SMTP settings                 |
| GET    | /api/admin/users              | List all users                       |
| GET    | /api/admin/locked             | List locked accounts                 |
| POST   | /api/admin/users/:id/unlock   | Unlock account                       |
| PUT    | /api/admin/users/:id/role     | Change user role                     |
| GET    | /api/admin/reports            | List user reports                    |
| PUT    | /api/admin/reports/:id/resolve| Resolve a user report                |
| GET    | /api/admin/stats              | Stats dashboard                      |
| GET    | /api/admin/feedback           | List feedback messages               |
| PUT    | /api/admin/feedback/:id/read  | Mark feedback as read                |
| PATCH  | /api/admin/feedback/:id/status| Update feedback status               |
| POST   | /api/admin/feedback/:id/reply | Send in-app reply to user            |

### Calendar
| Method | Path                        | Description                             |
|--------|-----------------------------|-----------------------------------------|
| GET    | /calendar/:token/tasks.ics  | ICS calendar feed (no auth, token-based)|

### Misc
| Method | Path         | Description               |
|--------|--------------|---------------------------|
| GET    | /api/version | App version               |
| GET    | /readyz      | Health check              |

## Default Task Types

Urgent · Routine · Hobby · Household · Kids · Financial · Vehicle · Leisure

## Database Encryption

Jobber uses **SQLCipher** (via `better-sqlite3-multiple-ciphers`) to encrypt the entire SQLite database file at rest, protecting all stored data including usernames, email addresses, task content, and all other records.

### Enabling Encryption

Set the `DB_ENCRYPTION_KEY` environment variable to a strong random passphrase **before** starting the server for the first time:

```env
DB_ENCRYPTION_KEY=change-me-to-a-long-random-passphrase
```

If this variable is not set (or is empty), the database runs without encryption — suitable for development but not recommended for production.

### Migrating an Existing Unencrypted Database

If you have an existing plaintext database and wish to enable encryption, use the included migration script. It reads `DB_ENCRYPTION_KEY` from `server/.env` and produces an encrypted copy of the database using the same key format as the server:

```bash
# From the project root:
node server/encrypt-db.js
```

This creates `server/jobber-encrypted.db`. Once you have verified it opens correctly, back up your original database, rename the encrypted file to `jobber.db`, and restart the server. The script prints the exact verification and rename commands to run after a successful migration.

You may also supply explicit source and destination paths:

```bash
node server/encrypt-db.js /path/to/jobber.db /path/to/jobber-encrypted.db
```

### Passwords

User passwords are **never stored in plaintext**. They are hashed using **bcrypt** (cost factor 10) before being stored. The database encryption provides an additional layer of protection for all other personal data.

