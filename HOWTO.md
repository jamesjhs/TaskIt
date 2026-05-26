# TaskIt! – How-To Manual

**Version 1.17.0**  
Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Running the Application](#running-the-application)
6. [Using TaskIt!](#using-taskit)
   - [Registering & Logging In](#registering--logging-in)
   - [Creating Tasks](#creating-tasks)
   - [Sub-tasks](#sub-tasks)
   - [Recurring Tasks](#recurring-tasks)
   - [Managing Tasks](#managing-tasks)
   - [Progress Notes](#progress-notes)
   - [Task Notifications](#task-notifications)
   - [Groups](#groups)
   - [Group Admin Features](#group-admin-features)
   - [Your Profile](#your-profile)
   - [Admin Panel](#admin-panel)
7. [Email Reminders](#email-reminders)
8. [Gamification](#gamification)
9. [Troubleshooting](#troubleshooting)

---

## Introduction

**TaskIt!** is a self-hosted, collaborative task management application. It runs as a Node.js server with a built-in web front-end and an Android app. Features include:

- Personal and group task management with statuses, due dates, and assignees
- Recurring tasks — automatically create the next occurrence when a task is completed
- Task deferral — quickly reschedule a due date from the task detail panel
- Custom task types per user and per group
- Progress notes on each task for tracking updates
- In-app notification bell for overdue and due-soon tasks
- Per-task notification preferences — a grid to independently enable email and/or browser popup reminders at 7-day, 1-day, and on-the-day intervals
- Group member access control — any group member can edit all aspects of a task; only the task creator or a group admin can delete a task
- Calendar integration — subscribe to your tasks as an ICS feed in any calendar app
- Group creation with admin controls — rename, promote/demote members, email invites, QR invite links, shared join key
- Magic-link and password login (with two-factor authentication via OTP), email verification, and account lockout protection
- User feedback submission with in-app admin replies
- Self-service account deletion (right to erasure)
- Admin panel with stats dashboard, SMTP configuration, locked accounts, user reports, and feedback management

---

## Requirements

- **Node.js** v18 or later
- **npm** v9 or later
- A modern web browser (Chrome, Firefox, Safari, Edge)
- (Optional) An SMTP email server for magic-link login, email verification, and task reminders

---

## Installation

1. **Clone or download** the repository:

   ```bash
   git clone https://github.com/jamesjhs/TaskIt!.git
   cd TaskIt!
   ```

2. **Install server dependencies:**

   ```bash
   npm install
   ```

3. **Build the CSS** (requires the dev dependencies to be installed):

   ```bash
   npm run build:css
   ```

   Or, if you prefer to watch for changes during development:

   ```bash
   npm run dev:css
   ```

4. **Compile TypeScript** (for production):

   ```bash
   npm run build
   ```

---

## Configuration

Create a `.env` file inside the `server/` directory. A template is provided at `server/.env.example`.

| Variable           | Default                        | Description                                              |
|--------------------|--------------------------------|----------------------------------------------------------|
| `PORT`             | `3000`                         | Port the server listens on                               |
| `JWT_SECRET`       | *(insecure dev default)*       | **Required in production.** Secret key for JWT tokens   |
| `DB_PATH`          | `server/taskit.db`             | Path to the SQLite database file                         |
| `DB_ENCRYPTION_KEY` | *(none — plaintext)*          | Passphrase for full-file SQLite encryption (see below)   |
| `ADMIN_EMAIL`      | *(none)*                       | Email address that is automatically granted admin role   |
| `BASE_URL`         | *(derived from request host)*  | Public base URL used in invite links and magic links     |
| `MAX_LOGIN_ATTEMPTS` | `5`                          | Failed logins before account lockout                     |
| `LOCKOUT_MINUTES`  | `30`                           | Duration of account lockout in minutes                   |
| `SMTP_HOST`        | *(none)*                       | SMTP server hostname                                     |
| `SMTP_PORT`        | `587`                          | SMTP server port                                         |
| `SMTP_SECURE`      | `false`                        | Set `true` to use TLS/SSL                                |
| `SMTP_USER`        | *(none)*                       | SMTP authentication username                             |
| `SMTP_PASS`        | *(none)*                       | SMTP authentication password                             |
| `SMTP_FROM`        | *(SMTP_USER)*                  | "From" address for outgoing emails                       |
| `VAPID_PUBLIC_KEY` | *(none — push disabled)*       | VAPID public key for browser push notifications          |
| `VAPID_PRIVATE_KEY` | *(none — push disabled)*      | VAPID private key for browser push notifications         |
| `VAPID_SUBJECT`    | `mailto:admin@<BASE_URL host>` | Contact URI embedded in push requests (mailto or https)  |

**Example `.env`:**

```env
PORT=3000
JWT_SECRET=change-this-to-a-long-random-secret
ADMIN_EMAIL=admin@example.com
BASE_URL=https://taskit.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM=TaskIt! <noreply@example.com>
# Optional: browser push notifications (VAPID)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:admin@example.com
```

> **Security note:** Always set a strong, unique `JWT_SECRET` before deploying to production.

> **BASE_URL note:** Set this to your public-facing URL (e.g. `https://taskit.example.com`) so that invite links, magic links, and QR codes contain the correct address rather than the internal request host.

---

## Encrypting the Database

By default TaskIt! stores data in a plain SQLite file. Setting `DB_ENCRYPTION_KEY` in `server/.env` enables full-file encryption via [SQLite3MultipleCiphers](https://utelle.github.io/SQLite3MultipleCiphers/).

### New installations

Set `DB_ENCRYPTION_KEY` **before** the server creates the database for the first time. The server will create an encrypted database automatically — no migration needed.

### Existing (plaintext) installations

If you already have a database, you must migrate it before setting the key in `.env`. Running the server with `DB_ENCRYPTION_KEY` set against a plaintext database will fail immediately with:

```
SqliteError: file is not a database
```

**Steps to migrate:**

1. **Stop the server.**

2. **Run the migration script** from the `server/` directory:

   ```bash
   node server/encrypt-db.js /path/to/taskit.db /path/to/taskit-encrypted.db
   ```

   Both paths are optional; they default to `server/taskit.db` → `server/taskit-encrypted.db`. The script reads `DB_ENCRYPTION_KEY` from `server/.env` — set the key there first before running it.

3. **Verify** the encrypted database can be opened (the script prints a ready-to-run verification command after a successful migration).

4. **Back up** the original: `cp taskit.db taskit.db.bak`

5. **Replace** the original with the encrypted file: `mv taskit-encrypted.db taskit.db`

6. **Restart** the server. If `DB_ENCRYPTION_KEY` is correctly set in `server/.env`, the server will open the encrypted database transparently.

### Removing encryption

To convert an encrypted database back to plaintext, use the `sqlite3` CLI:

```bash
sqlite3 /path/to/encrypted.db ".dump" | sqlite3 /path/to/plain.db
```

Make sure the `sqlite3` binary on your system supports the same cipher (SQLite3MultipleCiphers / sqleet) that TaskIt! uses. If not, you can open the database in Node.js and export via `better-sqlite3-multiple-ciphers`'s `backup()` API after applying the key pragma.

---

## Running the Application

### Development mode (auto-restart on code changes)

```bash
npm run dev
```

### Production mode

```bash
npm run build   # compile TypeScript and CSS
npm start       # run the compiled server
```

The application will be available at `http://localhost:3000` (or whichever port you set).

---

## Using TaskIt!

### Registering & Logging In

1. Open the app in your browser.
2. Click **Register** to create a new account — provide a username, email, password, and preferred date/time format (locale).
3. Check your inbox for a **verification email** and click the link to activate your account (requires SMTP to be configured).
4. To log in:
   - **Magic link:** Enter your email and click **Send Magic Link**. You will receive an email with a one-click login link (requires SMTP to be configured).
   - **Password:** Click *Use password instead*, then enter your email and password. A **one-time 6-digit code** will be sent to your email — enter it to complete sign-in (two-factor authentication).

> The first user to register automatically becomes an administrator.

---

### Creating Tasks

1. Click the **New Task** button on the Tasks page.
2. Fill in the form:
   - **Title** *(required)*
   - **Type** *(required)* – choose from default types, your own custom types, or group-specific types. Select *+ Add new type…* to create a new custom type on the fly.
   - **Group** – assign to a group (optional); this allows assigning to group members
   - **Assign To** – select group members to assign the task to (only visible when a group is selected)
   - **Notes** – click the **▶ Notes** toggle to expand a free-text notes field; it opens automatically when editing a task that already has notes
   - **Due Date** – defaults to **midnight on today's date** (00:00); adjust as needed
3. To make the task repeat, tick **Repeat Task** and set the interval (see [Recurring Tasks](#recurring-tasks)).
4. To add sub-tasks, click **Add Sub-tasks** (see [Sub-tasks](#sub-tasks)).
5. Click **Save Task**.

---

### Sub-tasks

Sub-tasks let you break a task into individual checklist steps — for example, turning "Clean Kitchen" into discrete steps like "Wipe counters", "Clean oven", "Mop floor".

**Adding sub-tasks when creating a task:**
1. In the New Task form, click the **▶ Add Sub-tasks** toggle just below the Group field.
2. Type each step in the input boxes that appear.
3. Click **+ Add item** to add more rows.
4. Click the **✕** button next to a row to remove that step.
5. Save the task normally — sub-tasks are created automatically.

**Working with sub-tasks in the task detail:**
- Open any task to see the **✅ Sub-tasks** section showing all steps and a progress bar.
- Tick a step's checkbox to mark it complete — this also sets the parent task to **Started** if it was *Not Started*.
- Each sub-task tick earns a small XP reward (configurable by the admin).
- Delete an individual step with the **✕** button next to it.
- The progress bar and counter (e.g. *2 of 5 complete*) update instantly.
- Clicking **Complete** on the parent task finalises it through the normal flow.

> **Note:** Sub-tasks cannot be added retroactively via the edit form — use the task detail panel's sub-task section to manage them after creation (coming in a future update).

---

### Recurring Tasks

Tick **Repeat Task** when creating or editing a task to set a recurrence schedule:

- Choose an interval (1–365) and unit: **Days**, **Weeks**, **Months**, or **Years**.
- When the task is marked **Complete**, a new copy of the task is automatically created with the next due date calculated from the original.
- Assignees are carried over to the new occurrence.
- The completed task remains in your list and can be archived as normal.

---

### Managing Tasks

Click any task card to open the **Task Detail** panel, where you can:

- Change the task **status**: Not Started → Started → Complete
- **Edit** the task (title, type, group, assignees, notes, due date, recurrence)
- **Defer** the task — click the *Defer* button to set a new due date without opening the full edit form
- **Toggle Archive** – hide/unhide the task from the main view
- **Delete** the task permanently — for group tasks, only the task creator or a group admin can delete; other group members can edit all other details but cannot delete

Use the **filter bar** at the top of the Tasks page to filter by:

- **Status** (Not Started, Started, Complete)
- **Group** and **Type**
- **Show Archived** – include archived tasks
- **Assigned to Me** – show only tasks assigned to you
- **Show Group Tasks** – toggle to hide or show group-owned tasks

Tasks are always sorted by **due date** (soonest first), with **Urgent** tasks pinned to the very top.

---

### Progress Notes

Inside the Task Detail panel, a **Progress Notes** section shows a timestamped log of updates.

To add a note:
1. Click **+ Add Note**.
2. Type your progress update in the text box.
3. Click **Save Note**.

Notes are visible to the task creator, assignees, and group members.

---

### Task Notifications

#### In-app bell

A **bell icon** in the top navigation bar shows a red badge when you have tasks that are:

- **Overdue** – past their due date and not yet complete
- **Due within 24 hours** – approaching deadline

Click the bell to open the notification panel. Click any item to jump to that task.

#### Browser popup notifications

TaskIt! can send native browser popup notifications when tasks are approaching their deadline. When you first log in, your browser will prompt for **notification permission** — click *Allow* to enable them. Popups fire while the app is open in your browser, using the timing columns you configure in the task's Reminders grid.

#### Reminders grid

When creating or editing a task, the **Reminders** section shows a 2-row, 3-column grid:

|          | 7 days | 1 day | On day |
|----------|:------:|:-----:|:------:|
| 📧 Email  | ✓      | ✓     | ✓      |
| 🔔 Popup  |        |       |        |

Each cell is an independent checkbox. Enable as many or as few as you like — the email and popup channels operate independently at each timing.

---

### Groups

Groups allow multiple users to share tasks, assign work to each other, and collaborate.

**Creating a group:**
1. Go to the **Groups** page.
2. Click **+ New** and optionally enter a name (or leave blank for an auto-generated name).
3. A unique **invite word pair** and **secret key** are generated. Share both with users you want to invite.

**Joining a group:**
1. Click **Join** on the Groups page.
2. Enter the **invite word pair** and **secret key** provided by the group admin.
3. Click **Join**.

**Viewing group members:**
Click **Manage / Invite** on any group card to see who is in the group.

---

### Group Admin Features

Group creators are automatically assigned the **admin** role.

Admins can access controls from the **Manage / Invite** panel:

- **Rename the group** – enter a new name and click *Rename*
- **Invite by email** – enter an email address and click *Send Invite* to send a personalised invitation link by email
- **Generate QR Code / Invite Link** – creates a multi-use invite link (valid 30 days) and displays a scannable QR code; sharing the link or QR code allows anyone to join without needing the secret key
- **Promote / Demote members** – click *Promote* next to a member to make them an admin, or *Demote* to revert to member
- **Delete the group** – permanently removes the group for all members (use with care)

The group's **invite word pair** and **secret key** are displayed in the panel header. Only users who have both can join via the key — email invites and QR links bypass the need for the key.

---

### Your Profile

Click **Profile** in the navigation to access your account settings:

- **Date & Time Format** – change the locale used to display dates and times (e.g. DD/MM/YYYY vs MM/DD/YYYY); click *Save Format* to apply
- **Calendar Integration** – copy your personal ICS feed URL to subscribe to your tasks in any calendar app (Google Calendar, Apple Calendar, Outlook, etc.); click *Regenerate Link* to invalidate the old URL
- **Invite to TaskIt!** – copy a shareable link to your TaskIt! instance
- **Feedback & Feature Requests** – send a message to the admin; tick the box to allow an in-app reply
- **Delete My Account** – permanently deletes your account and all associated data immediately, without contacting the admin

---

### Admin Panel

Accessible from the **Admin** menu item (visible to system admins only).

**Stats:**  
A real-time dashboard showing total users, users active today, total tasks, and tasks created today.

**SMTP Settings:**  
Configure the outgoing email server for magic-link logins, email verification, and task reminders.  
Toggle the *Enabled* checkbox to activate or deactivate email sending.

**Locked Accounts:**  
View accounts locked after too many failed login attempts, and unlock them manually.

**User Reports:**  
Review reports submitted by users about other users. Mark reports as resolved once addressed.

**Feedback:**  
Read feedback messages and feature requests submitted by users. Update the status of each message (Not Started, In Progress, Completed, Archived) and send an in-app reply to the submitter.

**Collectible Items – Custom Icons:**  
Each collectible item can be given a custom PNG artwork. To make icons available:
1. Place transparent `.png` files into the `public/collectables/` directory on your server (e.g. `public/collectables/sword.png`).
2. In the **🎁 Collectible Items** section of the admin panel, click **Browse** next to the **Icon** field when creating or editing an item.
3. A dropdown will populate with all available PNG filenames. Select one; a small live preview appears below the dropdown.
4. Save the item. The selected PNG will be shown in place of the rarity emoji in the loot-drop alert and the user's My Collection page.

Only bare `.png` filenames (alphanumeric, hyphens, underscores) are accepted — path separators and directory traversal sequences are rejected by the server. Pass an empty icon or select `— No icon —` to revert to the rarity emoji.

---

## Email Reminders

When SMTP is configured and enabled, TaskIt! automatically sends reminder emails for each incomplete task that has a due date, according to the **Reminders grid** you configure per task:

| Reminder       | Timing                                   |
|----------------|------------------------------------------|
| 7-day reminder | Sent when the deadline is 6–8 days away  |
| 1-day reminder | Sent when the deadline is 22–50 hours away |
| On-day reminder | Sent on the day the task is due (0–25 hours before) |

Each reminder is sent only **once** per task per timing window. Reminders are checked every hour.

---

## Browser Push Notifications

TaskIt! supports out-of-app browser push notifications using the [Web Push](https://web.dev/notifications/) standard. Push notifications require **VAPID keys** configured on the server and notification permission granted in the browser.

### Generating VAPID keys

Run the following once and store the output in your `.env`:

```bash
npx web-push generate-vapid-keys
```

Set the three variables in `server/.env`:

```env
VAPID_PUBLIC_KEY=<paste public key>
VAPID_PRIVATE_KEY=<paste private key>
VAPID_SUBJECT=mailto:admin@example.com   # or https://your-domain
```

Restart the server. When push is configured, the `/api/push/vapid-public-key` endpoint returns the public key so the frontend can subscribe.

### How it works

1. On login the browser requests **notification permission**. If granted, the service worker registers a push subscription and sends it to `/api/push/subscribe`.
2. Each hour, the scheduler checks for tasks with upcoming deadlines. For each task it evaluates two delivery channels independently:
   - **Email** — sent when the task's email master switch and per-window checkbox are enabled.
   - **Push** — sent when the task's per-window push checkbox is enabled (regardless of email settings).
3. Once any notification (email or push) is delivered for a given task and timing window, that window is marked as done and won't repeat.
4. Stale push subscriptions (browser returned HTTP 410/404) are automatically removed from the database.

> **Note:** Push notifications are delivered to the browser even when the TaskIt! tab is closed, as long as the browser itself is running and the service worker is active.

---

## Gamification

TaskIt! includes an opt-in gamification layer — XP, skill levels, achievements, streaks, and a Freeze mechanic — designed to make staying on top of tasks more rewarding without getting in the way of the core experience.

### Enabling Gamification

1. Click **Profile** in the navigation.
2. Locate the **Gamification** card.
3. Click **Enable Gamification** to opt in.

Your progress is preserved if you toggle it off and back on.

---

### XP & Overall Level

Completing a task earns you **50 XP** in the skill matching its type. However, **your overall Level is determined by the sum of all XP you have earned**, regardless of which skill it came from. Every completed task — in any category — contributes to the same single level.

The level formula uses a triangular progression:

```
XP to reach level n = 50 × n × (n − 1)

Level 2  →   100 XP total
Level 3  →   300 XP total
Level 5  →  1,000 XP total
Level 10 →  4,500 XP total
```

A **level progress bar** shows how far through the current level you are and how much XP remains to the next level. This bar appears both in the slim strip at the top of the My Tasks page and in the banner on the Progress page.

### XP Breakdown

The **⭐ XP Breakdown** section on the Progress page displays a donut chart showing how your total XP is distributed across your different skill categories. A colour-coded legend lists each skill with its exact XP total and percentage share. This replaces the old per-skill progress bars — skills no longer have their own independent levels.

Your top-XP skill determines the skill qualifier in your **dynamic title**, shown on your profile:

| Overall level | Title             |
|---------------|-------------------|
| 10+           | Guru of …         |
| 7–9           | Master …          |
| 5–6           | Expert …          |
| 3–4           | Skilled …         |
| 1–2           | Apprentice of …   |

---

### Achievements

Achievements unlock automatically when you hit specific milestones. They are visible in the **Gamification** section of your Profile.

| Achievement          | Milestone                                        |
|----------------------|--------------------------------------------------|
| 🥇 First Steps        | Complete your first task                         |
| 🚀 Getting Started    | Complete 10 tasks                                |
| 🔥 On a Roll          | Complete 50 tasks                                |
| ⚔️ Centurion          | Complete 100 tasks                               |
| 👑 Task Master        | Complete 500 tasks                               |
| 📝 Detail Oriented    | Add 50 progress notes                            |
| 🐦 Early Bird         | Complete 10 tasks before their due date          |
| 🗺️ Type Explorer      | Use 5 different task types                       |
| 🎯 Specialist         | Reach overall level 5                            |
| 🎓 Master of the Craft| Reach overall level 10                           |
| 🎩 Hat Trick          | Recurring task streak of 3                       |
| 🍀 Lucky Streak       | Recurring task streak of 7                       |
| 🚂 Unstoppable        | Recurring task streak of 30                      |

---

### Streaks

Recurring tasks track a **streak counter**: the number of consecutive times you have completed the task on or before its due date.

- **streak increases** each time you mark a recurring task complete on time
- **streak resets to 0** if the task becomes overdue without being completed
- The **all-time best** (longest streak) is also recorded and drives the streak achievements

Streaks are visible per-task in the detail panel and in the **Gamification → Streaks** view on your Profile.

---

### Freeze Credits

**Freeze Credits** let you protect a streak against a single missed deadline.

**Earning credits:**  
You earn 1 Freeze Credit every time you complete any task.

**Spending credits:**  
1. Open the detail panel for a recurring task.
2. Click **Apply Freeze** (costs 1 credit).
3. A ❄️ icon confirms the Freeze is active.

**When a frozen task becomes overdue:**  
The Freeze is consumed automatically, the streak is preserved, and the ❄️ is cleared. One Freeze protects one miss.

> **Tip:** Keep a credit reserve by staying on top of non-recurring tasks, then spend credits on streaks you care about most.

---

## Troubleshooting

**The app won't start**  
- Ensure Node.js v18+ is installed: `node --version`
- Run `npm install` from the repository root
- Check the `.env` file exists and `JWT_SECRET` is set

**Email is not being sent**  
- Verify SMTP settings in the Admin Panel → SMTP Settings → ensure *Enabled* is checked
- Test your SMTP credentials with a third-party tool
- Check the server console output for `[mail]` error messages

**I can't log in**  
- If your account is locked, an admin must unlock it via Admin → Locked Accounts
- For magic links, ensure SMTP is configured; use password login as a fallback
- For password login, check your email for the two-factor authentication code

**Tasks are not showing**  
- Check the filter bar — filters like *Show Archived*, *Assigned to Me*, or *Show Group Tasks* can hide tasks
- Ensure you are a member of the group the task belongs to

**Invite links or QR codes point to the wrong URL**  
- Set the `BASE_URL` environment variable to your public-facing URL (e.g. `https://taskit.example.com`) so generated links are correct

---

*TaskIt! v1.17.0 – Copyright J Rowson 2026 | jahosi.co.uk*
