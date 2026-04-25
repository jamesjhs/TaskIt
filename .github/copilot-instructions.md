# Copilot Instructions for TaskIt!

**TaskIt!** is a self-hosted, cross-platform task management application with a Node.js/TypeScript backend, vanilla JS SPA frontend, and Android app.

## Build, Test & Lint Commands

All commands run from the `server/` directory:

```bash
npm install                 # Install dependencies
npm run build              # Full production build: Tailwind CSS + TypeScript compilation
npm run dev                # Development mode: tsx watch (rebuilds on file changes)
npm run build:css          # Compile Tailwind CSS only
npm run dev:css            # Watch Tailwind CSS changes
npm start                  # Run compiled dist/index.js
```

**Note:** There is no test or lint suite configured. Any tests should follow TypeScript conventions and be committed separately.

## High-Level Architecture

### Backend (Node.js/Express)
- **Entry point:** `server/src/index.ts`
- **Tech stack:** Express, TypeScript, SQLite (with optional encryption via SQLCipher)
- **Port:** Configurable via `PORT` env var (default 3000)
- **Database:** `server/jobber.db` (SQLite with `.db-shm` and `.db-wal` WAL files)
- **Authentication:** JWT-based with email verification and optional OTP (two-factor)
- **CORS:** Configured via `CORS_ORIGIN` env var

### Route Organization
Each route module is in `server/src/routes/`:
- **auth.ts** — Registration, login, magic links, password reset, OTP, token refresh
- **tasks.ts** — Task CRUD, recurring task spawning, defer/reschedule, sub-tasks
- **groups.ts** — Group creation, membership, invite words, shared keys, admin functions
- **taskTypes.ts** — User and group task types
- **users.ts** — Profile, profile pictures, password change, account deletion, blocking
- **gamification.ts** — XP events, achievements, leaderboards, skill trees, streaks, titles
- **friends.ts** — Friend connections, friend-specific leaderboards
- **admin.ts** — Stats, SMTP config, locked accounts, reports, feedback management

### Services
- **services/mail.ts** — SMTP-based email sending (verification, password reset, notifications, reminders)
- **services/gamification.ts** — XP calculations, level progression, achievement tracking, title assignment
- **services/scheduler.ts** — Cron job runner (node-cron) for recurring task spawning, streak freezing, email digest jobs

### Middleware
- **middleware/auth.ts** — JWT validation, attach user to request
- **middleware/admin.ts** — Admin role validation

### Database
SQLite schema includes:
- **users** — Core user data, XP, levels, title, locked status
- **tasks** — Task records with type, status, due date, recurrence, parent/sub-task relationships
- **groups** — Group metadata, shared keys, admin settings
- **group_members** — Membership records with permissions
- **friends** — Friend relationships and friend keys
- **gamification_events** — XP event log
- **achievements** — Earned achievements per user
- **streaks** — Streak tracking with freeze logic
- **notifications** — Email/browser notification preferences per task
- **feedback** — User-submitted feedback with admin replies
- **mail_log** — Audit trail of sent emails

For full schema, see `TECHNICAL_REFERENCE.md` § 4 — Database Schema.

### Frontend (SPA)
- **Single file:** `public/index.html` (~4000+ lines of vanilla JS)
- **Styling:** Tailwind CSS (compiled to `public/tailwind.css`)
- **Service Worker:** `public/sw.js` (PWA support with offline capability)
- **Manifest:** `public/manifest.json` (PWA configuration)
- **Key scripts:** `public/js/game-whac-a-bug.js` (easter egg game)

**Global state** in index.html includes:
- `currentUser` — Authenticated user object
- `tasks` — Local task cache
- `groups` — User's groups
- `jwt` — JWT token (localStorage key: `jwt` or `jwt_persistent`)
- `UI state vars` — `currentPage`, `selectedTaskId`, `currentGroupId`, etc.

### Android App
- Located in `android/` directory
- Built with Android Studio, targets API 35
- Connects to the same backend server
- See `android/docs/` for detailed onboarding

## Key Conventions

### TypeScript & Typing
- **Strict mode enabled** in `tsconfig.json`
- All route handlers should have explicit parameter and return types
- Use `Request`, `Response`, `NextFunction` from express
- Database results use typed objects (no implicit any)

### API Response Pattern
- All routes return JSON with consistent structure
- Success: `{ success: true, data: {...} }` or `{ ... }` depending on route
- Error: `{ error: "message" }` with appropriate HTTP status code
- See route files for pattern examples

### Rate Limiting
- Three tiers in `index.ts`:
  - **General (200 req/15min):** Most routes
  - **Auth (20 req/15min):** Login/password reset endpoints
  - **Authenticated (2000 req/15min per user):** API routes for logged-in users
- Key by JWT user ID when available, fall back to client IP

### Database & Migrations
- Database initializes automatically from `server/src/db.ts` if tables don't exist
- **Runtime migrations:** `addCol()` function in `db.ts` checks for column existence before adding
- No ORM — direct SQL queries with `better-sqlite3` library
- Use parameterized queries to prevent SQL injection

### Email System
- **SMTP configuration:** Admin panel (`/api/admin/smtp-config`)
- **Template rendering:** Simple string interpolation in `services/mail.ts`
- **Email types:** verification, password reset, task reminders, digests, feedback replies
- **Mail logging:** All emails logged to `mail_log` table for audit

### Recurring Tasks
- **Trigger:** When task is marked complete, `services/scheduler.ts` spawns the next occurrence
- **Recurrence rule:** `recurrence_type` field stores interval (daily, weekly, monthly, etc.)
- **Scheduler:** node-cron job runs every minute to check for tasks to spawn

### Gamification
- **Per-user opt-in:** Controlled by user preference in profile
- **XP events:** Completing tasks, sub-tasks, friend adds, login streaks, etc.
- **Level formula:** Triangular progression (100 XP for level 2, increasing by 50 XP per level)
- **Skill trees:** One skill per task type (Household, Work, Personal, etc.)
- **Achievements:** Unlocked based on specific conditions (first task, 7-day streak, etc.)
- **Freeze mechanic:** Miss a day = streak freezes (one per user per calendar month, unfrozen by admin)

### Security & Auth
- **JWT secret:** Must be set in `JWT_SECRET` env var
- **Password hashing:** bcryptjs with salt rounds = 10
- **Database encryption:** Optional SQLCipher encryption if `DB_ENCRYPTION_KEY` env var is set
- **Rate limiting:** Per-IP and per-user quotas to prevent abuse
- **CORS:** Restricted to `CORS_ORIGIN` env var
- **Helmet:** Security headers applied by default
- **Account lockout:** After failed login attempts, user marked as locked (admin can unlock)

### Environment Variables
See `.env.example` for full list. Key ones:
- `PORT` — Server port (default 3000)
- `JWT_SECRET` — JWT signing secret (required)
- `DB_ENCRYPTION_KEY` — Optional SQLCipher encryption key
- `CORS_ORIGIN` — Allowed origin for CORS (e.g., `http://localhost:3000`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — Email configuration
- `MAIL_FROM` — Sender email address

### Common Patterns

**Protected routes (require authentication):**
```typescript
router.get('/api/user/profile', auth, (req: Request, res: Response) => {
  const userId = (req as any).userId;
  // ...
});
```

**Admin-only routes:**
```typescript
router.post('/api/admin/lock-user', auth, admin, (req: Request, res: Response) => {
  // ...
});
```

**Database queries:**
```typescript
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as IUser;
db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(50, userId);
```

## Repository Context

- **Main docs:** `README.md` (features), `HOWTO.md` (deployment), `TECHNICAL_REFERENCE.md` (complete system ref)
- **User docs:** `USER_GUIDE.md`, `public/user-guide.html`
- **Android docs:** `android/docs/DeveloperOnboarding.md`, `TeacherOverview.md`, etc.
- **Public assets:** `public/` (frontend + icons + PWA assets)
- **Scripts:** `scripts/` directory for utilities
- **Android:** `android/` directory with full Android Studio project

## Quick Start for Development

```bash
cd server
npm install
npm run dev:css &  # Start Tailwind watcher in background
npm run dev        # Start Express server with auto-reload
```

Then visit `http://localhost:3000` in your browser.

To test an API endpoint:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123!"}'
```
