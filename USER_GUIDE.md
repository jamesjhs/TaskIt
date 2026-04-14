# 👋 Jobber – User Guide

**Version 1.0.2** | Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)

Jobber is a friendly, no-fuss task manager built for individuals and small teams. Whether you're keeping track of your own to-dos or collaborating with others, this guide will have you up and running in minutes.

---

## 🚀 Getting Started

### Creating your account

1. Open Jobber in your browser and click **Register**.
2. Enter a username, your email address, and a password.
3. Choose your preferred **Date & Time Format** (locale).
4. Click **Create Account**.
5. Check your inbox for a **verification email** and click the link to activate your account.

The very first person to register becomes the **system administrator**, with access to extra settings.

### Logging in

There are two ways to log in:

- **Magic link** – enter your email and click *Send Magic Link*. Check your inbox for a one-click login link (requires email to be configured by your admin).
- **Password** – click *Use password instead* and enter your email and password. You will be sent a **one-time 6-digit code** by email to confirm your identity — enter it to complete sign-in.

> 💡 If you forget your password, use the magic link option to log in, then update your password from your Profile page.

---

## ✅ Managing Tasks

### Creating a task

1. Go to the **Tasks** page and click **New Task**.
2. Give your task a **title** and choose a **type** (e.g. Urgent, Routine, Hobby). You can also add a custom type by selecting *+ Add new type…* from the dropdown.
3. Optionally set a **group**, **assignees**, any **notes**, and a **due date**.
4. To make the task repeat automatically, tick **Repeat Task** and choose the interval (e.g. every 2 weeks). When a recurring task is marked complete, a new copy is created for the next due date.
5. Click **Save Task**.

Due dates default to **midnight on today's date** — handy for quick captures!

### Updating a task

Click any task card to open the detail panel. From here you can:

- Move it through the stages: **Not Started → Started → Complete**
- **Edit** any of the task's details
- **Defer** the task — click *Defer* to set a new due date without opening the full edit form
- **Archive** it to tidy your view (archived tasks can always be brought back)
- **Delete** it permanently — note that for group tasks, only the task creator or a group admin can delete; other group members can edit all other details but not delete

### Filtering your task list

Use the filter bar at the top of the Tasks page to narrow down what you see:

- Filter by **status** (Not Started, Started, Complete)
- Filter by **group** or **type**
- **Show Archived** – include archived tasks in the list
- **Assigned to Me** – show only tasks you have been assigned to
- **Show Group Tasks** – toggle group tasks on/off to focus on your personal tasks

### Adding progress notes

Inside the task detail panel, you'll find a **Progress Notes** section — a running log of updates.

1. Click **+ Add Note**.
2. Type your update and click **Save Note**.

Notes are visible to everyone involved with that task.

---

## 🔔 Notifications

### In-app bell

The **bell icon** in the top navigation shows a red badge whenever you have tasks that are:

- **Overdue** – the deadline has passed and the task isn't complete yet
- **Due within 24 hours** – approaching fast!

Click the bell to see what needs your attention, and click any item to jump straight to that task.

### Browser popup notifications

Jobber can send browser popup notifications when a task is approaching its deadline. The first time you log in, your browser will ask for **notification permission** — click *Allow* to enable them.

Popups are fired by the app while it is open in your browser, using the same timing windows you select in the task's notification grid.

### Email reminders

When email is configured by your admin, Jobber sends reminder emails at the timings you choose per task (see the *Reminders* grid below).

### Setting reminders per task

When creating or editing a task, the **Reminders** section shows a grid:

|          | 7 days | 1 day | On day |
|----------|:------:|:-----:|:------:|
| 📧 Email  | ✓      | ✓     | ✓      |
| 🔔 Popup  |        |       |        |

Tick each cell independently to choose which channel sends a reminder at each timing. Email and popup reminders can be enabled or disabled per timing independently.

Groups let you collaborate with others — share tasks, assign work to teammates, and stay in sync.

### Creating a group

1. Go to the **Groups** page and click **+ New**.
2. Enter a name, or leave it blank for a fun random name to be generated for you.
3. Your new group appears with a unique **invite word pair** and a **secret key**. Share both with anyone you'd like to invite.

### Joining a group

1. Click **Join** on the Groups page.
2. Enter the **invite word pair** and **secret key** your group admin gave you, then click **Join**.

> 🔑 Both the invite word pair *and* the secret key are required — the word pair alone is not enough to join.

### Viewing members

Click **Manage / Invite** on any group card to see who's in the group and their roles.

---

## 🛡️ Group Admin Features

When you create a group you're automatically its **admin**. Other admins can be promoted by any existing admin.

From the **Manage / Invite** panel, admins can:

- **Rename** the group — enter a new name and click *Rename*
- **Invite by email** — enter an email address and click *Send Invite* to send a personalised invitation link
- **Generate QR Code / Invite Link** — create a shareable QR code or link that anyone can scan or click to join (valid for 30 days)
- **Promote** a member to admin, or **Demote** an admin back to member
- **Delete** the group — removes it for everyone (use with care!)

---

## 📧 Email Reminders

When email is enabled by your admin, Jobber sends automatic reminders for tasks with due dates, based on the per-task settings you choose in the **Reminders** grid:

| Reminder | When it's sent |
|---|---|
| 7-day reminder | About a week before the deadline |
| 1-day reminder | The day before it's due |
| On-day reminder | On the day the task is due |

Each reminder is sent once per task. Reminders stop once the task is marked complete.

---

## ⚙️ Your Profile

Click **Profile** in the navigation to access your account settings:

### Date & Time Format

Choose the locale used to display dates and times throughout the app (e.g. DD/MM/YYYY vs. MM/DD/YYYY). Click **Save Format** to apply.

### 📅 Calendar Integration

Subscribe to your Jobber tasks in any calendar app (Google Calendar, Apple Calendar, Outlook, etc.) using the private **ICS feed link** shown in the *Calendar Integration* card.

- Copy the link and paste it into your calendar app as a new calendar subscription.
- Click **🔄 Regenerate Link** to invalidate the old link and get a new one (e.g. if you believe the link has been shared unintentionally).

> Keep this link private — anyone who has it can view your tasks.

### Invite to Jobber

Share Jobber with others — click **Copy Invite Link** to copy a link to your Jobber instance that you can send to colleagues or friends.

### 💬 Feedback & Feature Requests

Found a bug or have an idea? Use the *Feedback & Feature Requests* card on your Profile page.

1. Type your message (up to 4,000 characters).
2. Tick the box if you're happy for the admin to reply to you in-app.
3. Click **Send Feedback**.

### ⚠️ Delete My Account

You can permanently delete your account and all your associated data at any time — no need to contact an administrator.

1. Scroll to the bottom of your Profile page and click **Delete My Account**.
2. Confirm twice when prompted.

All your tasks, notes, group memberships, and account details are removed immediately. If you were the sole admin of a group, that group and its tasks are also deleted.

---

## 🛠️ Admin Panel *(admins only)*

System administrators see an extra **Admin** menu item. From here you can:

- **Stats** – a dashboard showing total users, users active today, total tasks, and tasks created today
- **SMTP Settings** – configure the outgoing email server for magic links and reminders
- **Locked Accounts** – view and unlock accounts blocked after too many failed login attempts
- **User Reports** – review reports submitted by users and mark them as resolved
- **Feedback** – read feedback messages submitted by users, update their status (Not Started / In Progress / Completed / Archived), and send an in-app reply

---

## ❓ Common Questions

**I can't log in**  
Your account may be locked after too many failed attempts. Ask your system admin to unlock it via *Admin → Locked Accounts*. You can also try the magic link option if email is configured.

**My tasks aren't showing**  
Check the filter bar — filters like *Show Archived*, *Assigned to Me*, or *Show Group Tasks* can hide tasks. Also make sure you're a member of the group a task belongs to.

**I'm not receiving emails**  
Email sending requires SMTP to be configured and enabled by your admin. Check with them to confirm it's set up correctly.

**I lost my group's join details**  
Any group admin can find the invite word pair and secret key by clicking **Manage / Invite** on the group card.

**I didn't receive my email verification link**  
Check your spam folder. If SMTP is not configured by the admin, the link will not be delivered — ask the admin to either configure SMTP or manually verify your account.

---

*Jobber v1.0.2 – Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)*
