# Jobber – Task Management App

A cross-platform task management application with a Node.js/TypeScript server, web frontend, and Android app.

## Features

- User registration with email verification
- Magic-link and password login with two-factor authentication (OTP)
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
- Automated email reminders (7-day, 1-day, overdue — once per task)
- Calendar integration — private ICS feed for any calendar app
- Date & time locale preference per user
- User reporting and blocking
- User feedback submission with in-app admin replies
- Self-service account deletion (GDPR right to erasure)
- Admin panel: stats dashboard, SMTP configuration, locked accounts, user reports, feedback management

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Server   | Node.js, TypeScript, Express        |
| Database | SQLite via `better-sqlite3`         |
| Auth     | JWT + bcryptjs                      |
| Frontend | Vanilla JS/TS, Tailwind CSS (CDN)   |
| Android  | Kotlin, Retrofit, DataStore         |

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
| Method | Path                         | Description                              |
|--------|------------------------------|------------------------------------------|
| POST   | /api/auth/register           | Register new user                        |
| POST   | /api/auth/login              | Login → JWT or OTP session               |
| POST   | /api/auth/verify-otp         | Verify 2FA OTP code → JWT                |
| GET    | /api/auth/magic-link/verify  | Verify magic link token → JWT            |

### Tasks
| Method | Path                      | Description                           |
|--------|---------------------------|---------------------------------------|
| GET    | /api/tasks                | List tasks (filters: status, groupId, typeId, archived, assignedToMe) |
| POST   | /api/tasks                | Create task (supports recurrence)     |
| PATCH  | /api/tasks/:id            | Update task                           |
| PATCH  | /api/tasks/:id/status     | Update status only                    |
| PATCH  | /api/tasks/:id/archive    | Toggle archive                        |
| PATCH  | /api/tasks/:id/defer      | Update due date (defer)               |
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
