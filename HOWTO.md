# Jobber – How-To Manual

**Version 1.0.2**  
Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Running the Application](#running-the-application)
6. [Using Jobber](#using-jobber)
   - [Registering & Logging In](#registering--logging-in)
   - [Creating Tasks](#creating-tasks)
   - [Recurring Tasks](#recurring-tasks)
   - [Managing Tasks](#managing-tasks)
   - [Progress Notes](#progress-notes)
   - [Task Notifications](#task-notifications)
   - [Groups](#groups)
   - [Group Admin Features](#group-admin-features)
   - [Your Profile](#your-profile)
   - [Admin Panel](#admin-panel)
7. [Email Reminders](#email-reminders)
8. [Troubleshooting](#troubleshooting)

---

## Introduction

**Jobber** is a self-hosted, collaborative task management application. It runs as a Node.js server with a built-in web front-end and an Android app. Features include:

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
   git clone https://github.com/jamesjhs/Jobber.git
   cd Jobber
   ```

2. **Install server dependencies:**

   ```bash
   cd server
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
| `DB_PATH`          | `server/jobber.db`             | Path to the SQLite database file                         |
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

**Example `.env`:**

```env
PORT=3000
JWT_SECRET=change-this-to-a-long-random-secret
ADMIN_EMAIL=admin@example.com
BASE_URL=https://jobber.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM=Jobber <noreply@example.com>
```

> **Security note:** Always set a strong, unique `JWT_SECRET` before deploying to production.

> **BASE_URL note:** Set this to your public-facing URL (e.g. `https://jobber.example.com`) so that invite links, magic links, and QR codes contain the correct address rather than the internal request host.

---

## Encrypting the Database

By default Jobber stores data in a plain SQLite file. Setting `DB_ENCRYPTION_KEY` in `server/.env` enables full-file encryption via [SQLite3MultipleCiphers](https://utelle.github.io/SQLite3MultipleCiphers/).

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
   node server/encrypt-db.js /path/to/jobber.db /path/to/jobber-encrypted.db
   ```

   Both paths are optional; they default to `server/jobber.db` → `server/jobber-encrypted.db`. The script reads `DB_ENCRYPTION_KEY` from `server/.env` — set the key there first before running it.

3. **Verify** the encrypted database can be opened (the script prints a ready-to-run verification command after a successful migration).

4. **Back up** the original: `cp jobber.db jobber.db.bak`

5. **Replace** the original with the encrypted file: `mv jobber-encrypted.db jobber.db`

6. **Restart** the server. If `DB_ENCRYPTION_KEY` is correctly set in `server/.env`, the server will open the encrypted database transparently.

### Removing encryption

To convert an encrypted database back to plaintext, use the `sqlite3` CLI:

```bash
sqlite3 /path/to/encrypted.db ".dump" | sqlite3 /path/to/plain.db
```

Make sure the `sqlite3` binary on your system supports the same cipher (SQLite3MultipleCiphers / sqleet) that Jobber uses. If not, you can open the database in Node.js and export via `better-sqlite3-multiple-ciphers`'s `backup()` API after applying the key pragma.

---

## Running the Application

### Development mode (auto-restart on code changes)

```bash
cd server
npm run dev
```

### Production mode

```bash
cd server
npm run build   # compile TypeScript and CSS
npm start       # run the compiled server
```

The application will be available at `http://localhost:3000` (or whichever port you set).

---

## Using Jobber

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
   - **Notes** – free-text notes or description for the task
   - **Due Date** – defaults to **midnight on today's date** (00:00); adjust as needed
3. To make the task repeat, tick **Repeat Task** and set the interval (see [Recurring Tasks](#recurring-tasks)).
4. Click **Save Task**.

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

Jobber can send native browser popup notifications when tasks are approaching their deadline. When you first log in, your browser will prompt for **notification permission** — click *Allow* to enable them. Popups fire while the app is open in your browser, using the timing columns you configure in the task's Reminders grid.

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
- **Invite to Jobber** – copy a shareable link to your Jobber instance
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

---

## Email Reminders

When SMTP is configured and enabled, Jobber automatically sends reminder emails for each incomplete task that has a due date, according to the **Reminders grid** you configure per task:

| Reminder       | Timing                                   |
|----------------|------------------------------------------|
| 7-day reminder | Sent when the deadline is 6–8 days away  |
| 1-day reminder | Sent when the deadline is 22–50 hours away |
| On-day reminder | Sent on the day the task is due (0–25 hours before) |

Each reminder is sent only **once** per task. Reminders are checked every hour.

---

## Troubleshooting

**The app won't start**  
- Ensure Node.js v18+ is installed: `node --version`
- Run `npm install` inside the `server/` directory
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
- Set the `BASE_URL` environment variable to your public-facing URL (e.g. `https://jobber.example.com`) so generated links are correct

---

*Jobber v1.0.2 – Copyright J Rowson 2026 | jahosi.co.uk*
