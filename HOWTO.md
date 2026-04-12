# Jobber – How-To Manual

**Version 0.6.1**  
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
   - [Managing Tasks](#managing-tasks)
   - [Progress Notes](#progress-notes)
   - [Task Notifications](#task-notifications)
   - [Groups](#groups)
   - [Group Admin Features](#group-admin-features)
   - [Admin Panel](#admin-panel)
7. [Email Reminders](#email-reminders)
8. [Troubleshooting](#troubleshooting)

---

## Introduction

**Jobber** is a self-hosted, collaborative task management application. It runs as a Node.js server with a built-in web front-end. Features include:

- Personal and group task management with statuses, due dates, and assignees
- Progress notes on each task for tracking updates
- In-app notification bell for overdue and due-soon tasks
- Up to three automated email reminder notifications per task (7-day, 1-day, overdue)
- Group creation with admin controls — rename, promote members, shared join key
- Magic-link and password login, with account lockout protection
- Admin panel for SMTP configuration, locked accounts, and user reports

---

## Requirements

- **Node.js** v18 or later
- **npm** v9 or later
- A modern web browser (Chrome, Firefox, Safari, Edge)
- (Optional) An SMTP email server for magic-link login and task reminders

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
| `ADMIN_EMAIL`      | *(none)*                       | Email address that is automatically granted admin role   |
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
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM=Jobber <noreply@example.com>
```

> **Security note:** Always set a strong, unique `JWT_SECRET` before deploying to production.

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
2. Click **Register** to create a new account — provide a username, email, and password.
3. To log in:
   - **Magic link:** Enter your email and click **Send Magic Link**. You will receive an email with a one-click login link (requires SMTP to be configured).
   - **Password:** Click *Use password instead*, then enter your email and password.

> The first user to register automatically becomes an administrator.

---

### Creating Tasks

1. Click the **New Task** button on the Tasks page.
2. Fill in the form:
   - **Title** *(required)*
   - **Type** *(required)* – choose from default types or group-specific types
   - **Group** – assign to a group (optional); this allows assigning to group members
   - **Assign To** – select group members to assign the task to (only visible when a group is selected)
   - **Notes** – free-text notes or description for the task
   - **Due Date** – defaults to **tonight at midnight**; adjust as needed
3. Click **Save Task**.

---

### Managing Tasks

Click any task card to open the **Task Detail** panel, where you can:

- Change the task **status**: Not Started → Started → Complete
- **Edit** the task (title, type, group, assignees, notes, due date)
- **Toggle Archive** – hide/unhide the task from the main view
- **Delete** the task permanently

Use the **filter bar** at the top of the Tasks page to filter by status, group, archived state, or tasks assigned to you.

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

A **bell icon** in the top navigation bar shows a red badge when you have tasks that are:

- **Overdue** – past their due date and not yet complete
- **Due within 24 hours** – approaching deadline

Click the bell to open the notification panel. Click any item to jump to that task.

---

### Groups

Groups allow multiple users to share tasks, assign work to each other, and collaborate.

**Creating a group:**
1. Go to the **Groups** page.
2. Click **New Group** and enter a name.
3. A unique **join key** is generated and displayed on the group card.

**Joining a group:**
1. Click **Join Group**.
2. Enter the join key provided by the group admin.
3. Click **Join**.

**Viewing group members:**
Click **View Members** on any group card to see who is in the group.

---

### Group Admin Features

Group creators are automatically assigned the **admin** role.

Admins can access controls from the **View Members** panel:

- **Rename the group** – enter a new name and click *Rename*
- **Promote / Demote members** – click *Promote* next to a member to make them an admin, or *Demote* to revert to member
- **Delete the group** – permanently removes the group for all members (use with care)

The group's **join key** is displayed in the members panel header and on the group card. Only users who have been given the key can join — guessing the group ID alone is not sufficient to join.

---

### Admin Panel

Accessible from the **Admin** menu item (visible to system admins only).

**SMTP Settings:**  
Configure the outgoing email server for magic-link logins and task reminders.  
Toggle the *Enabled* checkbox to activate or deactivate email sending.

**Locked Accounts:**  
View accounts locked after too many failed login attempts, and unlock them manually.

**User Reports:**  
Review reports submitted by users about other users. Mark reports as resolved once addressed.

---

## Email Reminders

When SMTP is configured and enabled, Jobber automatically sends up to **three reminder emails** for each incomplete task that has a due date:

| Reminder       | Timing                              |
|----------------|-------------------------------------|
| 7-day reminder | Sent when the deadline is 6–8 days away |
| 1-day reminder | Sent when the deadline is within 2 days |
| Overdue alert  | Sent when the deadline has passed    |

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

**Tasks are not showing**  
- Check the filter bar — filters like *Show Archived* or *Assigned to Me* can hide tasks
- Ensure you are a member of the group the task belongs to

---

*Jobber v0.6.1 – Copyright J Rowson 2026 | jahosi.co.uk*
