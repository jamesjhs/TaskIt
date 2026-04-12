# 👋 Jobber – User Guide

**Version 0.7.1** | Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)

Jobber is a friendly, no-fuss task manager built for individuals and small teams. Whether you're keeping track of your own to-dos or collaborating with others, this guide will have you up and running in minutes.

---

## 🚀 Getting Started

### Creating your account

1. Open Jobber in your browser and click **Register**.
2. Enter a username, your email address, and a password.
3. Click **Register** – you're in!

The very first person to register becomes the **system administrator**, with access to extra settings.

### Logging in

There are two ways to log in:

- **Magic link** – enter your email and click *Send Magic Link*. Check your inbox for a one-click login link (requires email to be configured by your admin).
- **Password** – click *Use password instead* and enter your email and password.

> 💡 If you forget your password, use the magic link option to log in, then update your password from your Profile page.

---

## ✅ Managing Tasks

### Creating a task

1. Go to the **Tasks** page and click **New Task**.
2. Give your task a **title** and choose a **type** (e.g. Urgent, Routine, Hobby).
3. Optionally set a **group**, **assignees**, any **notes**, and a **due date**.
4. Click **Save Task**.

Due dates default to midnight tonight — handy for quick captures!

### Updating a task

Click any task card to open the detail panel. From here you can:

- Move it through the stages: **Not Started → Started → Complete**
- **Edit** any of the task's details
- **Archive** it to tidy your view (archived tasks can always be brought back)
- **Delete** it permanently

### Filtering your task list

Use the filter bar at the top of the Tasks page to narrow down what you see — filter by status, group, archived tasks, or tasks assigned specifically to you.

### Adding progress notes

Inside the task detail panel, you'll find a **Progress Notes** section — a running log of updates.

1. Click **+ Add Note**.
2. Type your update and click **Save Note**.

Notes are visible to everyone involved with that task.

---

## 🔔 Notifications

The **bell icon** in the top navigation shows a red badge whenever you have tasks that are:

- **Overdue** – the deadline has passed and the task isn't complete yet
- **Due within 24 hours** – approaching fast!

Click the bell to see what needs your attention, and click any item to jump straight to that task.

---

## 👥 Groups

Groups let you collaborate with others — share tasks, assign work to teammates, and stay in sync.

### Creating a group

1. Go to the **Groups** page and click **New Group**.
2. Enter a name, or leave it blank for a fun random name to be generated for you.
3. Your new group appears with a unique **join key**. Share this key with anyone you'd like to invite.

### Joining a group

1. Click **Join Group**.
2. Enter the join key your group admin gave you and click **Join**.

### Viewing members

Click **View Members** on any group card to see who's in the group and their roles.

---

## 🛡️ Group Admin Features

When you create a group you're automatically its **admin**. Other admins can be promoted by any existing admin.

From the **View Members** panel, admins can:

- **Rename** the group — enter a new name and click *Rename*
- **Promote** a member to admin, or **Demote** an admin back to member
- **Delete** the group — removes it for everyone (use with care!)

> 🔑 The group's join key is shown in the members panel. Only people who have the key can join — the group ID alone isn't enough.

---

## 📧 Email Reminders

When email is enabled by your admin, Jobber sends automatic reminders for tasks with due dates:

| Reminder | When it's sent |
|---|---|
| 7-day reminder | About a week before the deadline |
| 1-day reminder | The day before it's due |
| Overdue alert | When the deadline has passed |

Each reminder is sent once per task. Reminders stop once the task is marked complete.

---

## ⚙️ Your Profile

Click **Profile** in the navigation to:

- Update your **username**
- Change your **password**
- Review your account details

---

## 🛠️ Admin Panel *(admins only)*

System administrators see an extra **Admin** menu item. From here you can:

- **SMTP Settings** – configure the outgoing email server for magic links and reminders
- **Locked Accounts** – view and unlock accounts blocked after too many failed login attempts
- **User Reports** – review reports submitted by users and mark them as resolved

---

## ❓ Common Questions

**I can't log in**  
Your account may be locked after too many failed attempts. Ask your system admin to unlock it via *Admin → Locked Accounts*. You can also try the magic link option if email is configured.

**My tasks aren't showing**  
Check the filter bar — filters like *Show Archived* or *Assigned to Me* can hide tasks. Also make sure you're a member of the group a task belongs to.

**I'm not receiving emails**  
Email sending requires SMTP to be configured and enabled by your admin. Check with them to confirm it's set up correctly.

**I lost my join key**  
Any group admin can find the join key by clicking **View Members** on the group card.

---

*Jobber v0.7.1 – Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)*
