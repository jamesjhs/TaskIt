# 👋 TaskIt! – User Guide

**Version 1.19.1** | Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)

TaskIt! is a friendly, no-fuss task manager built for individuals and small teams. Whether you're keeping track of your own to-dos or collaborating with others, this guide will have you up and running in minutes.

---

## 🚀 Getting Started

### Creating your account

1. Open TaskIt! in your browser and click **Register**.
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

1. Go to the **Tasks** page and tap the large **`+`** floating button at the bottom-right of the screen. A small popup appears with three choices:
   - **📋 New Task** — a regular task with a due date and optional repeat
   - **🔄 Sporadic Task** — a maintenance task with no fixed schedule (e.g. Haircut, Car service)
   - **🎯 Long-term Goal** — an aspirational goal with no immediate deadline
2. Tap the choice that fits. The **Create Task** form opens pre-configured with only the fields relevant to that type.
3. Give your task a **title** and choose a **type** (e.g. Urgent, Routine, Hobby). You can also add a custom type by selecting *+ Add new type…* from the dropdown.
4. Optionally select a **Group**. Once a group is chosen, an **Assign To** section appears — tick the group members you want to assign the task to.
5. To break the task into steps, click the **▶ Add Sub-tasks** toggle (directly below the Group field) and enter each step (see [Sub-tasks](#sub-tasks) below).
6. To add free-text **Notes**, click the **▶ Notes** toggle to expand the notes field. When editing a task that already has notes, the field opens automatically.
7. Set a **due date** if needed (defaults to today). Tap the date field to open a calendar picker — on mobile this is a native date picker for easy one-thumb use.
   - **Shortcut:** Below the date field, use the *"or in X days/weeks/months from now"* helper and tap **Set** to auto-fill the date.
8. To make the task repeat automatically, tick **Repeat Task** and choose the interval (e.g. every 2 weeks). When a recurring task is marked complete, a new copy is created for the next due date — including all of its sub-tasks (checklist items), reset and ready to be completed again.
9. Click **Save Task**.

> 💡 **No time needed** — TaskIt! doesn't attach a time to tasks. Dates default to midnight on the chosen day, and only the date is shown on task cards.

Due dates default to **today's date** — handy for quick captures!

### Sub-tasks

Sub-tasks let you split a big task into manageable steps — like turning "Clean Kitchen" into "Wipe counters", "Clean oven", and "Mop floor".

**When creating a task:**
- Click **▶ Add Sub-tasks** just below the Group field to expand the panel.
- Type each step and click **+ Add item** to add more. Press **Enter** to jump to a new row.
- Remove any row with the **✕** button.

**When editing a task with sub-tasks:**
- Open the task and scroll to the Sub-tasks section to see existing sub-tasks.
- Edit existing sub-task names, add new sub-tasks, or delete any sub-task with the **✕** button.

**Inside the task detail:**
- Every task with sub-tasks shows a **progress bar** on its card, so you can see progress at a glance.
- Open the task to see the full **✅ Sub-tasks** checklist with a counter (e.g. *2 of 5 complete*).
- Tick a checkbox to mark that step done — the first tick automatically sets the task to **Started**.
- Each tick earns a small XP reward if gamification is enabled.
- Delete individual steps with the **✕** button next to them.
- Clicking **Complete** finishes the whole task in the normal way.

### Updating a task

Click any task card to open the detail panel. From here you can:

- Move it through the stages: **Not Started → Started → Complete**
- **Edit** any of the task's details
- **Defer** the task — click *Defer* to set a new due date without opening the full edit form. You can enter the date directly or use the *"or in X days/weeks/months from now"* shortcut below the date picker
- **Archive** it to tidy your view (archived tasks can always be brought back)
- **Delete** it permanently — note that for group tasks, only the task creator or a group admin can delete; other group members can edit all other details but not delete

### ⏱ Sprint Timer & Double XP

When you tap **Started** on a task, a popup asks **"Set a time limit?"**

- Tap **No** — the task is marked Started immediately. Its card turns light green so it stands out at a glance.
- Tap **Yes** — choose a countdown: **5**, **10**, **15**, or **60 minutes**. The task is marked Started and:
  - The card shows a **pulsing light-green background** while the timer is active.
  - A **live countdown** appears in the top-right corner of the card.
  - If you complete the task *before the timer runs out*, you earn **double XP** for that task. A "Double XP earned!" banner confirms the bonus.
  - Once the countdown expires the pulse stops, indicating the bonus window has closed (you can still complete the task — just without the double XP).

> 💡 **Tip:** If you open a task that already has an active timer running, tapping "Started" again shows a notice rather than accidentally resetting your timer.

### Sporadic Tasks

Sporadic tasks are **maintenance tasks with no fixed schedule** — things you do occasionally and want to track, like a haircut, car service, or cleaning the gutters.

**Creating a sporadic task:**
1. Tap **`+`** and choose **🔄 Sporadic Task** from the popup.
2. Fill in the title, type, and optional group/notes.
3. Click **Save Task** — the due date and recurrence fields are already hidden.

You can also tap **`+`**, choose **📋 New Task**, and tick the **Sporadic (maintenance task)** checkbox manually.

**How they work:**
- Sporadic tasks appear in the **Sporadic Tasks** section at the top of the Tasks page, always visible and collapsed by default.
- The section shows **(0)** when you have no sporadic tasks, so it's always easy to find.
- Each card shows how long ago the task was last completed (e.g. *3 months ago (15/04/2026)*) or *Never* if it hasn't been done yet. Cards overdue (90+ days) are highlighted.
- Tap **✓ Mark done** to record a completion — the card resets and the timer starts again. You earn XP just as you would completing a regular task.
- Tap **📅 Edit** to update the task — you can change the title, description, task type, group assignment, set a new "Last Completed" date, delete, or archive the sporadic task at any time.

### Long-term Goals

Long-term goals are **aspirational items with no immediate deadline** — things you want to do eventually but aren't ready to schedule yet. Think *Learn Spanish*, *Run a half-marathon*, or *Redecorate the living room*.

**Creating a long-term goal:**
1. Tap **`+`** and choose **🎯 Long-term Goal** from the popup.
2. Fill in the title, type, optional group, and notes.
3. If the task is in a group with gamification enhancements enabled, you can set an **XP Multiplier** to boost the reward when the goal is eventually completed.
4. Click **Save Task** — the due date and recurrence fields are already hidden.

You can also tap **`+`**, choose **📋 New Task**, and tick the **Long-term Goal** checkbox manually; or tap **+ Add Goal** in the Long-term Goals section header.

**The Long-term Goals section:**
- Sits at the **bottom of the Tasks page**, collapsed by default, showing **(0)** when empty.
- Tap the header to expand it and see all your goals.
- Each goal card shows the title, optional notes, group badge, and XP multiplier (if set).

**Converting a goal to a deadline task:**
When you're ready to commit to a goal, tap **📅 Set Deadline** on the goal card. A small dialog appears — pick your due date and tap **Convert**. The goal is immediately moved out of the Goals section and into your active task list with the chosen deadline.

You can also open the goal via **Edit**, uncheck *Long-term Goal*, set a due date, and save — this achieves the same result with full editing capabilities.

### Filtering your task list

Tap the **⚙️ Filters** chip at the top of the Tasks page to expand the filter panel:

- Filter by **status** (All, Not Started, Started, Complete)
- Filter by **group** or **type**
- **Show Archived** – include archived tasks in the list
- **Assigned to Me** – show only tasks you have been assigned to
- **Show Group Tasks** – toggle group tasks on/off to focus on your personal tasks

When any filter is active, the ⚙️ chip shows a blue badge with the count of active filters.

Tasks are always sorted by **due date** (soonest first), with **Urgent** tasks pinned to the very top.

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

TaskIt! can send browser popup notifications when a task is approaching its deadline. The first time you log in, your browser will ask for **notification permission** — click *Allow* to enable them.

Popups are fired by the app while it is open in your browser, using the same timing windows you select in the task's notification grid.

If your server has background push configured, open **Profile → Notification Preferences** to choose a **Preferred local push time**. TaskIt! will aim to deliver 7-day, 1-day, and on-the-day push reminders at that local time.

### Email reminders

When email is configured by your admin, TaskIt! sends reminder emails at the timings you choose per task (see the *Reminders* grid below).

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

When email is enabled by your admin, TaskIt! sends automatic reminders for tasks with due dates, based on the per-task settings you choose in the **Reminders** grid:

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

Subscribe to your TaskIt! tasks in any calendar app (Google Calendar, Apple Calendar, Outlook, etc.) using the private **ICS feed link** shown in the *Calendar Integration* card.

- Copy the link and paste it into your calendar app as a new calendar subscription.
- Click **🔄 Regenerate Link** to invalidate the old link and get a new one (e.g. if you believe the link has been shared unintentionally).

> Keep this link private — anyone who has it can view your tasks.

### Invite to TaskIt!

Share TaskIt! with others — click **Copy Invite Link** to copy a link to your TaskIt! instance that you can send to colleagues or friends.

### 📋 Task Types Management

Manage your custom task types from the **Task Types** card in your Profile:

- **Add a new type** — click **+ Add new type**, enter a name, and click **Create**. Custom types are automatically sorted alphabetically in all task creation dropdowns.
- **Edit a type** — click **✏️ Edit** next to any type to rename it. TaskIt! prevents duplicate names.
- **Delete a type** — click **🗑️** to delete a type. Any active (non-archived, non-completed) tasks using that type are automatically reset to the Routine type. Archived or completed tasks retain the original type name for historical reference. If you create a new type with the same name later, it reactivates the archived type.

> 💡 **Pro tip:** System types like "Urgent" and "Routine" cannot be deleted, but custom types give you complete control.

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
- **Collectible Items → Icon** – each collectible item can now have a custom PNG artwork. Place `.png` files (transparent background recommended) inside the `public/collectables/` folder on the server, then click **Browse** next to the **Icon** field when creating or editing an item. A dropdown will appear listing all available images; select one to see a live preview before saving. Items without a custom icon continue to display the coloured rarity emoji.

---

## 🎮 Gamification *(optional)*

TaskIt! includes a **fully optional** gamification system that rewards consistent task completion. It is disabled by default.

### Getting started

The first time you log in, TaskIt! may ask if you'd like to enable gamification via a short prompt. You can also enable or disable it at any time from **Profile → Gamification toggle**.

### ⭐ Progress tab

All gamification content lives in the **⭐ Progress** tab in the bottom navigation. Here you can see:
- Your **overall Level** and XP progress bar toward the next level
- An **XP Breakdown** donut chart showing how your XP is distributed across different skill categories
- Your unlocked achievements
- Your active streaks

When gamification is enabled, a slim **XP/level strip** also appears at the top of the My Tasks page. It shows your current level, the XP progress bar toward the next level, and your best active streak at a glance. Tap the strip to go straight to the Progress tab.

### Enabling / Disabling

1. Go to **Profile**.
2. Find the **Gamification** card.
3. Toggle it on (or off). Your progress is preserved if you turn it off and back on.

### ⭐ XP & Overall Level

Every time you complete a task, you earn **50 XP** in the *skill* that matches the task type. For example, completing a Household task earns Household XP; completing a Financial task earns Financial XP.

> 🏅 **Sprint bonus:** If you start a task with a time limit (see [Sprint Timer](#-sprint-timer--double-xp) above) and complete it before the countdown expires, you earn **double XP** for that task — 100 XP instead of 50.

**Your overall Level is based on the total of all XP you have ever earned**, regardless of which skill it came from. Complete tasks in any category and they all count toward the same single level. A progress bar shows how far through the current level you are and how much XP remains until the next level.

Level milestones use a triangular curve — each level costs more XP than the last:

| Level | Total XP needed |
|-------|-----------------|
| 1     | 0               |
| 2     | 100             |
| 3     | 300             |
| 4     | 600             |
| 5     | 1,000           |
| 6     | 1,500           |
| 10    | 4,500           |

### 📊 XP Breakdown

The **⭐ XP Breakdown** section on the Progress page shows a donut chart illustrating how your total XP is split across your different skills (task types). A colour-coded legend lists each skill with its exact XP total and percentage share. This gives you a clear picture of where you spend your effort without replacing your unified level.

Your top-XP skill also earns you a **dynamic title** shown on your profile, based on your overall level:

| Overall level | Title example          |
|---------------|------------------------|
| 10+           | Guru of Household      |
| 7–9           | Master Routine         |
| 5–6           | Expert Hobby           |
| 3–4           | Skilled Financial      |
| 1–2           | Apprentice of Urgent   |

### 🕹️ TaskIt! Arcade

Each of the 13 achievement badges has a corresponding **mini-game** in the TaskIt! Arcade. Once you unlock a badge, tap it in the **⭐ Progress** tab to open the Arcade and play its game. Press **Esc** or tap **↩ Back to Tasks** to return to the app at any time.

#### Daily play limit

The Arcade has a **daily play time limit** set by your site administrator (default 5 minutes). Once your daily allowance is used up, the Arcade is locked until the next calendar day. Completing tasks earns **Arcade Tokens** 🎟️ which can grant bonus play time.

---

### 🏆 Achievements

Achievements are one-time awards that unlock when you hit milestones:

| Achievement        | How to earn                                       |
|--------------------|---------------------------------------------------|
| 🥇 First Steps      | Complete your first task                          |
| 🚀 Getting Started  | Complete 10 tasks                                 |
| 🔥 On a Roll        | Complete 50 tasks                                 |
| ⚔️ Centurion        | Complete 100 tasks                                |
| 👑 Task Master      | Complete 500 tasks                                |
| 📝 Detail Oriented  | Add 50 progress notes across all tasks            |
| 🐦 Early Bird       | Complete 10 tasks before their due date           |
| 🗺️ Type Explorer    | Complete tasks in 5 different task types          |
| 🎯 Specialist       | Reach overall level 5                             |
| 🎓 Master of Craft  | Reach overall level 10                            |
| 🎩 Hat Trick        | Maintain a recurring task streak of 3             |
| 🍀 Lucky Streak     | Maintain a recurring task streak of 7             |
| 🚂 Unstoppable      | Maintain a recurring task streak of 30            |

### 🔥 Streaks

Recurring tasks track a **streak** — how many times in a row you have completed them on time. Each time you mark a recurring task complete before or on its due date, the streak counter increases. Miss a deadline and the streak resets to zero.

Your streak data is visible in the **Gamification** card on your Profile page.

### ❄️ Freeze Credits

Miss a deadline but don't want to lose your streak? Use a **Freeze**!

- You earn **1 Freeze Credit** for every task you complete (recurring or not).
- Apply a Freeze to a recurring task from its detail panel — this costs 1 credit.
- If the task is then overdue, the Freeze absorbs the miss and your streak is preserved.
- Each task can hold one active Freeze at a time.

> 💡 Tip: Build up a reserve of Freeze Credits by staying on top of your other tasks — then use them to protect your most important streaks.

### 🎒 Loot Drops & My Collection

Completing tasks doesn't just earn XP — it can also reward a random **collectible item**!

#### How drops work

Each time you mark a task **Complete**, the server may roll a loot drop for you (the more XP the task awards, the higher the chance). If a drop is rolled, a **Loot Drop Modal** appears immediately after you complete the task. It shows:

- The item's artwork (a custom PNG icon if your administrator has assigned one, or the rarity emoji otherwise)
- The item's name and description
- Its **rarity tier**: Common 🟢, Rare 💜, or Epic ✨
- Its category (e.g. *Space Explorer*, *Kitchen Hero*)

#### Keep or Recycle?

| Choice | What happens |
|--------|-------------|
| **🎒 Keep** | The item is saved permanently to your personal inventory. |
| **♻️ Recycle** | The item is discarded and you receive a small XP bonus instead. Epic items prompt a confirmation before recycling. |

You have a short window (10 minutes) to decide — after that the pending drop expires and is removed automatically.

#### My Collection

Open the **⭐ Progress** tab and scroll to the **🎒 My Collection** section at the bottom. Here you can:

- See every item you own, grouped by category, displayed in full colour — with custom artwork where available.
- Browse the complete catalogue — items you haven't collected yet appear as greyed-out silhouettes so you can track your progress.
- See duplicate counts (×2, ×3, etc.) if you've collected the same item more than once.

Each category is collapsible, keeping the view tidy even if the catalogue grows large.

---

## 🔐 Privacy & Browser Storage

TaskIt! stores a small amount of data in your browser's `localStorage` to make the app work. This is **not** tracking — it's purely functional:

| Key | What it stores |
|-----|----------------|
| `jbToken` | Your login session token |
| `jbUser` | Your username, email, and locale preference |
| `taskit_app_version` | The app version (for update detection) |
| `jbPopupFired` | Which browser popup notifications have been sent today |
| `jbGamifAsked` | Whether you've seen the gamification opt-in prompt |
| `jbCookieNotice` | Whether you've dismissed the storage notice |

No cookies are used. Your data is never sold or shared with advertisers. See the full [Privacy Policy](/privacy-policy.html) for details.

---

## ❓ Common Questions

**I can't log in**  
Your account may be locked after too many failed attempts. Ask your system admin to unlock it via *Admin → Locked Accounts*. You can also try the magic link option if email is configured.

**My tasks aren't showing**  
Check the filter panel (tap ⚙️ Filters) — filters like *Show Archived*, *Assigned to Me*, or *Show Group Tasks* can hide tasks. Also make sure you're a member of the group a task belongs to.

**I'm not receiving emails**  
Email sending requires SMTP to be configured and enabled by your admin. Check with them to confirm it's set up correctly.

**I lost my group's join details**  
Any group admin can find the invite word pair and secret key by clicking **Manage / Invite** on the group card.

**I didn't receive my email verification link**  
Check your spam folder. If SMTP is not configured by the admin, the link will not be delivered — ask the admin to either configure SMTP or manually verify your account.

**Where is the gamification content?**  
Tap the **⭐ Progress** tab in the bottom navigation. You can also enable or disable gamification from the **Profile** page.

---

*TaskIt! v1.19.1 – Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)*
