# TaskIt! – Task Management App

**Version 1.21.12** | Copyright J Rowson 2026 | [jahosi.co.uk](https://jahosi.co.uk)

A cross-platform task management application with a Node.js/TypeScript server, web frontend, and Android app.

## Features

- User registration with email verification
- Magic-link and password login with two-factor authentication (OTP)
- **Forgot password** — self-service password reset via email link
- **Change password** — users can update their password from the Profile page
- Account lockout protection
- **Streamlined task creation** — tap the `+` floating button to reveal a three-option popup: **New Task**, **Sporadic Task**, or **Long-term Goal**; each opens the creation form pre-configured with only the fields relevant to that task type
- Create and manage tasks with types, notes, and status tracking
- Task statuses: Not Started → Started → Complete
- **Sub-tasks** — break any task into individual checklist steps; tick each off one at a time, with a progress bar on the task card and detail modal; edit existing sub-task names, add and delete sub-tasks when editing a task; completing a sub-task automatically sets the parent task to "Started", and each sub-task completion earns a small configurable XP reward
- Recurring tasks — automatically create the next occurrence when complete
- Task deferral — reschedule due date from the detail panel with an auto-updating relative date helper
- Custom task types per user and per group — create, edit, delete, and re-enable archived types; sorted alphabetically across all dropdowns; system automatically resets active tasks to the Routine type when their custom type is deleted
- Archive and delete tasks
- Group collaboration with invite word pairs and shared secret keys
- Email invites and QR code / shareable invite links for groups
- Assign tasks to group members
- Progress notes on tasks
- In-app alerts for overdue and due-soon tasks
- **Per-task notification preferences** — choose whether to receive email reminders and/or browser popup notifications for each task, with a grid selecting 7-day, 1-day, and on-the-day timing
- **Profile-level push reminder time** — choose a friendly local delivery time for browser push reminders from your Profile page, while keeping task due dates date-only
- Group member access control — Personal (no group) tasks remain visible only to their creator; group tasks are shared only when a group is explicitly selected, and any group member can edit group task fields (title, due date, recurrence, notes, status, defer, archive); only the task creator or a group admin can delete a group task
- **Date-only scheduling** — task due dates are date-only (no time component); all times default to midnight so you never have to think about hours. Native calendar pickers on mobile and desktop for easy date entry
- **Relative date shortcuts** — on task date fields, type a number and choose days/weeks/months to quickly jump to *n* days/weeks/months from today; defer defaults to 1 week and previews the resulting calendar date automatically
- **In-app Back/Forward navigation** — browser, Android, and PWA Back now closes active popup overlays from top to bottom, then returns to previous TaskIt! pages before leaving the app
- Calendar integration — private ICS feed for any calendar app
- Date locale preference per user
- User reporting and blocking
- User feedback submission with in-app admin replies
- Self-service account deletion (GDPR right to erasure)
- Admin panel: stats dashboard, SMTP configuration, locked accounts, user reports, feedback management
- **Database encryption** — full SQLite file encryption at rest via SQLCipher (set `DB_ENCRYPTION_KEY` env var)
- **Gamification Engine** — opt-in XP system, overall level progression, XP breakdown by skill, dynamic titles, personal achievements, streak tracking, and freeze mechanic (see below)
- **Admin-tunable collectible drop sensitivity** — admins can adjust how often XP gains roll for collectible loot drops; default sensitivity is `2.0`, doubling the previous acquisition rate while preserving the 75% maximum drop chance cap
- **Admin-managed Arcade games** — arcade games are registered through Admin > Gamify > Arcade Games, loaded dynamically from compatible JavaScript modules, and documented for contributors in `/arcade-game-guide.html`
- **Friends & Leaderboards** — connect with other users via invite link, QR code, or username + friend key; compete on XP leaderboards per group and across friends
- **Persistent login** — optional "Remember me" browser storage (7-day web JWT in localStorage vs 12-hour session-only storage; Android uses encrypted app storage)
- **Sporadic Tasks** — maintenance tasks with no fixed schedule that reappear after completion and show how long ago they were last done in friendly format with dd/mm/yyyy date (e.g. Haircut, Car service). Fully editable like regular tasks: change title, type, group, delete, or archive. Always visible at the top of the task list, collapsed by default
- **Long-term Goals** — aspirational goals that live in a dedicated collapsible section at the bottom of the task list, outside the active task queue. Support groups, XP multipliers, and notes. Convert any goal to a deadline task with a single tap
- **Search-ready marketing site** — landing page includes structured FAQ content, comparison copy, richer Open Graph / Twitter metadata, plus `robots.txt`, `sitemap.xml`, and `llms.txt` discovery assets

## Gamification Engine

TaskIt! includes a fully opt-in gamification system that rewards consistent productivity. It activates per-user and never affects the core task management experience for those who prefer it off.

### XP & Overall Level

Every time you complete a task, you earn **50 XP** in the skill matching the task type (e.g. completing a *Household* task earns Household XP). **Your overall Level is derived from the sum of all XP you have ever earned**, regardless of which skill it came from. This means every task you complete — in any category — contributes to your single unified level.

The level formula uses a triangular progression curve:

| Level | Cumulative XP required |
|-------|------------------------|
| 1     | 0 XP                   |
| 2     | 100 XP                 |
| 3     | 300 XP                 |
| 4     | 600 XP                 |
| 5     | 1,000 XP               |
| n     | 50 × n × (n−1) XP      |

A **level progress bar** on both the Tasks page strip and the Progress page shows how far through the current level you are and how much XP remains to the next level.

### XP Breakdown by Skill

The **⭐ XP Breakdown** section on the Progress page shows a **pie/donut chart** with each skill's share of your total XP, alongside a legend showing the exact XP earned per skill and its percentage of your total. This gives a clear picture of where your effort goes without replacing your unified level.

### Dynamic Titles

Your overall level, combined with the skill in which you have earned the most XP, earns you a title that appears on your profile:

| Overall Level | Title prefix  | Example               |
|---------------|---------------|-----------------------|
| 10+           | Guru of       | Guru of Household     |
| 7–9           | Master        | Master of Routine     |
| 5–6           | Expert        | Expert at Hobby       |
| 3–4           | Skilled       | Skilled in Finance    |
| 1–2           | Apprentice    | Apprentice of Urgent  |

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
| `skill_level_5`  | Specialist           | Reach overall level 5                          |
| `skill_level_10` | Master of the Craft  | Reach overall level 10                         |
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

## Security Checks

Run `npm run security:xss-sinks` before changing frontend rendering code. The scan compares current HTML-rendering sinks, inline event handlers, and dynamic script loaders against `scripts/xss-sink-baseline.json`; new entries fail the check until they are reviewed. Prefer `textContent`, attributes set through DOM APIs, and explicit event listeners for new UI code. Use `npm run security:xss-sinks:update` only after deliberately reviewing an unavoidable sink.

## Changelog

### v1.21.12

- **🔒 Personal task sharing hardening** — reassessed the group visibility boundary after reports that group members could see tasks believed to be Personal. The server now has an explicit Personal-only task filter (`groupId=__personal__`), ignores and prunes stale assignee metadata for non-group tasks, normalizes incoming `groupId` values before writes, and prevents recurring personal tasks from cloning legacy assignee rows into generated follow-up tasks. Non-creators no longer get task visibility from shared group membership alone; group tasks are visible to another member only when that member is explicitly assigned. The UI now exposes a Personal filter and labels each task card as Personal or shared with its group name, making accidental sharing easier to spot.
- **🔢 Version bump** — package metadata, lockfiles, public cache keys, pages, and documentation updated to 1.21.12.

### v1.21.11

- **🔒 XSS sink guardrail** — added an automated scanner and reviewed baseline for frontend HTML-rendering sinks, inline event handlers, and dynamic script loaders; root builds now fail if new unreviewed sink signatures are introduced.
- **🔢 Version bump** — package metadata, lockfiles, public cache keys, pages, and documentation updated to 1.21.11.

### v1.21.10

- **🔒 CSP hardening** — removed `'unsafe-eval'` from the Helmet `script-src` directive after confirming the app code does not use `eval(...)` or `new Function(...)`; inline scripts and handlers remain allowed temporarily while the SPA is migrated away from inline event attributes.
- **🔒 Production configuration guardrails** — production startup now validates HTTPS `BASE_URL`, explicit `TRUST_PROXY`, database encryption, and paired SMTP/VAPID/Turnstile settings before Express starts.
- **⬆️ Dependency vulnerability fixes** — updated Nodemailer, PostCSS, esbuild, and body-parser paths; `npm audit` now reports zero vulnerabilities.
- **🔢 Version bump** — package metadata, lockfiles, public cache keys, pages, and documentation updated to 1.21.10.

### v1.21.9

- **🔒 Personal task visibility fix** — tasks created with **Personal (no group)** now remain visible only to their creator, even when the creator belongs to groups or stale assignee data exists; group sharing applies only when a group is explicitly selected.
- **🐛 Defer date UX fix** — opening Defer now defaults to **in 1 week from now**, previews the resolved calendar date below the relative controls, and updates automatically when the period changes.
- **🔢 Version bump** — package metadata, lockfiles, public cache keys, pages, and documentation updated to 1.21.9.

### v1.21.8

- **🐛 In-app Back button fix** — web/PWA navigation now records TaskIt! pages and popup overlays in browser history so Back/Forward closes the topmost popup first, then restores the previous app page instead of closing the app or leaving the site.
- **🔢 Version bump** — package metadata, lockfiles, public cache keys, pages, and documentation updated to 1.21.8.

### v1.21.7

- **🗑 Task-card delete button** — web/PWA task cards now show a top-right bin button across regular, far-future, overdue, sporadic, and long-term goal cards, with a friendly confirmation before deletion.
- **🔢 Version bump** — package metadata, lockfiles, manifest cache keys, and documentation updated to 1.21.7.

### v1.21.6

- **🐛 Uniform task-card spacing** — Sporadic Tasks, Long-term Goals, and significantly overdue task sections now reopen as column layouts, preserving the same 12px card separation used by the far-future task section.
- **🔢 Version bump** — package metadata, lockfiles, manifest cache keys, and documentation updated to 1.21.6.

### v1.21.5

- **🐛 Signal Sprint audio timing fix** — Morse tones now use the Web Audio render clock so short tones do not soften when UI timers lag.
- **🎛 Signal Sprint controls** — removed the Mute button and kept Hint as the third active control.
- **🔢 Version bump** — package metadata, pages, manifest cache keys, and documentation updated to 1.21.5.

### v1.21.4

- **🎮 Dynamic Arcade game catalogue** — Arcade games are now stored in an admin-managed `arcade_games` catalogue instead of hard-coded arrays and script tags.
- **🧩 Game module wrapper contract** — game files now register with `window.TaskItArcade.register({ gameId, mount, unmount, addTime })`, allowing compatible JavaScript files to be enabled from Admin.
- **📘 Arcade creator guide** — added `/arcade-game-guide.html`, linked from Admin > Gamify > Arcade Games, with implementation, testing, design, and AI-agent guidance.
- **🔢 Version bump** — package metadata, pages, and documentation updated to 1.21.4.

### v1.20.3

- **🐛 Login rate-limit fix** — password login now has its own limiter so other auth endpoints cannot force all login attempts into HTTP 429.
- **🎨 Login logo refresh** — the auth page now uses the current RK logo artwork instead of the old inline checklist icon.
- **🔢 Version bump** — package metadata, pages, and documentation updated to 1.20.3.

### v1.20.2

- **🐛 XP multiplier edit fix** — editing an existing task into a gamification-enhanced group now validates against the target group instead of the task's previous group.
- **🔢 Version bump** — package metadata, pages, and documentation updated to 1.20.2.

### v1.20.1

- **🐛 PWA install reminder** — logged-in browser users are prompted to install TaskIt! and see an Alerts reminder, while installed PWA sessions are left alone.
- **🔢 Version bump** — package metadata, pages, and documentation updated to 1.20.1.

### v1.20.0

- **🎨 PWA icon refresh** — install icons now use the RK logo, Android notification badges use the Android badge source, and versioned icon URLs force installed PWAs to refresh stored artwork on upgrade.
- **🔢 Version bump** — package metadata, pages, and documentation updated to 1.20.0.

### v1.19.9

- **🐛 Admin user search fix** — User Management now includes email data in admin user responses and guards the search filter so the All tab no longer crashes when searching users.
- **🔢 Version bump** — package metadata, pages, and documentation updated to 1.19.9.

### v1.19.8

- **🐛 Sporadic task conversion fix** — editing a sporadic task can now correctly convert it back to a regular task, recurring task, or long-term goal without leaving the original card behind.
- **🔢 Version bump** — package metadata, pages, and documentation updated to 1.19.8.

### v1.19.3

- **🐛 Push notification controls** — Profile now includes a background push on/off toggle. Turning it off disables server sends for the user and removes stored push subscriptions.
- **📱 Mobile push delivery hardening** — reminder push payloads now use absolute icon/badge URLs plus explicit TTL/urgency options, and the app no longer prompts for notification permission automatically after login.
- **🔢 Version bump** — package metadata and documentation updated to 1.19.3.

### v1.19.1

- **🐛 Push status banner fix** — the Profile page now re-checks service worker registration more reliably, so the “Push notification service is still starting up” message clears once background push is actually ready.
- **🕘 Local-time push scheduling** — users can now choose a preferred local time for browser push reminders in **Profile → Notification Preferences**. The scheduler respects that saved time for 7-day, 1-day, and on-the-day push reminders.
- **🔢 Version bump** — server package metadata and documentation updated to 1.19.1.

### v1.19.0

- **⏱ Task sprint timer with double XP** — clicking the "Started" button on a task card now shows a popup asking "Set a time limit?" with [Yes] / [No] options. Choosing **No** marks the task as Started with a solid light-green card background. Choosing **Yes** presents time limits of 5, 10, 15, or 60 minutes; the card then shows a pulsing light-green background and a live countdown in the top-right corner. Completing the task within the time limit awards **double XP**. The timer widget stops pulsing once the countdown expires to make it clear the bonus window has closed.
- **🛡 Timer robustness fixes** — added a Cancel button to the time-limit popup so it can be dismissed without starting the task; added an in-flight guard preventing double-submission on rapid clicks; and guarded against accidentally resetting an already-active timer.
- **🔢 Version bump** — server package metadata and documentation updated to 1.19.0.

### v1.18.0

- **🔒 Auth link hardening** — outbound login, reset, and invite links now require a configured `BASE_URL` in production to prevent Host header injection. Loopback URLs are still allowed in local development.
- **🧾 JWT invalidation on password change** — JWTs now carry a per-user token version so password resets/changes immediately revoke older tokens.
- **🔢 Version bump** — server package metadata and documentation updated to 1.18.0.

### v1.16.3

- **🤖 QC trigger gate** — the Copilot session completion protocol in `.github/copilot-instructions.md` now runs only when the user explicitly types the exact phrase `trigger QC actions`.
- **🔢 Version bump** — server package metadata, README, and technical reference updated to 1.16.3.

### v1.16.0

- **⭐ Unified XP level system** — a user's Level is now determined solely by their total accumulated XP across all skills, rather than by individual per-skill levels. Every completed task — regardless of type — contributes to the same single level counter. The level progress bar on the Tasks page strip and the Progress page banner both reflect this unified level.
- **📊 XP Breakdown chart** — the Skills section on the Progress page now shows an interactive SVG donut chart illustrating the proportional breakdown of XP by skill source, alongside a legend with exact XP amounts and percentages. Per-skill progress bars and individual skill level badges have been removed.
- **🏅 Level-based achievements** — the *Specialist* (`skill_level_5`) and *Master of the Craft* (`skill_level_10`) achievements now unlock at overall Level 5 and Level 10 respectively, consistent with the unified level system.
- **🎮 Arcade token level-ups** — the 3-token arcade bonus awarded on each level-up is now triggered by crossing an overall level threshold (total XP), rather than a per-skill threshold.
- **👑 Title based on overall level** — the dynamic profile title now reflects the user's overall level alongside their highest-XP skill name (e.g. "Expert Household").
- **🔢 Version bump** — server, README, user guide, how-to, and technical reference updated to 1.16.0.

### v1.15.0 and earlier

See previous changelog entries below.

### v1.12.1

- **🧹 Main task list filtering** — the main task list now excludes all tasks without set due dates (sporadic and maintenance tasks, unscheduled items). Only completed tasks and pending tasks with explicit due dates appear in the main active list. Tasks without due dates remain visible in their dedicated dropdown sections (Sporadic Tasks, Long-term Goals). Updated frontend filtering logic to enforce date requirements.
- **Version bump** — server, README, user guide, how-to, and technical reference updated to 1.12.1.

### v1.12.0

- **🐛 Collectible items table layout fix** — the Edit button in the admin Collectible Items table was unexpectedly wide for rows that had a custom icon. The per-row `display:grid` with a variable column count (`28px 1fr auto auto` vs `1fr auto auto`) caused CSS Grid's `auto` track sizing to produce inconsistent button widths. Replaced with `display:flex` so the name column grows (`flex:1;min-width:0`) and buttons remain at their natural content size (`flex-shrink:0`) regardless of whether a row has a custom icon.
- **🐛 PNG upload "could not read image dimensions" fix** — the admin icon upload used `URL.createObjectURL` to load the selected file into an `<img>` for a client-side dimension check. The resulting `blob:` URL was blocked by the server's Content-Security-Policy `imgSrc` directive (which only allows `'self'` and `data:`), so every upload immediately fired `img.onerror`. Replaced with a single `FileReader.readAsDataURL` pass that produces a CSP-compliant `data:` URL; this same data URL is also reused as the base64 upload payload, eliminating a redundant second file-read.
- **Version bump** — server, README, user guide, how-to, and technical reference updated to 1.12.0.

### v1.11.0

- **🐛 Push notification fix** — the reminder scheduler now correctly respects the per-task browser popup notification flags (`notify_popup_7day`, `notify_popup_1day`, `notify_popup_onday`). Previously, push notifications were sent for every task that had email notifications enabled, ignoring whether browser push was actually toggled on for that window. Additionally, tasks with browser push enabled but email disabled will now receive push reminders as intended.
- **Version bump** — server, README, user guide, how-to, and technical reference updated to 1.11.0.

### v1.10.0

- **📌 Sporadic Tasks always visible** — the Sporadic Tasks section now always appears at the top of the task list, collapsed by default, and displays **(0)** when no sporadic tasks exist rather than being hidden entirely. This gives clearer discoverability and consistent placement.
- **🎯 Long-term Goals** — a new collapsible **Long-term Goals** section appears at the bottom of the task list. Goals are aspirational items outside the active task queue that support groups, XP multipliers, and notes. Tap **📅 Set Deadline** on any goal card to instantly convert it into a scheduled deadline task. Goals can also be created via the standard *New Task* modal by checking *Long-term Goal*.
- **Version bump** — server, README, user guide, and technical reference updated to 1.10.0.

### v1.9.0

- **🖼️ Collectible item icons** — administrators can now assign a custom PNG artwork to any collectible item. Place transparent PNG files in the `public/collectables/` directory on the server, then use the new **Browse** button in the Collectible Items admin panel to pick a file from a server-side list. The selected icon replaces the rarity emoji in both the loot-drop pop-up alert and the user's Collections page. Items without a custom icon continue to use the existing coloured emoji fallback. The server validates all filenames strictly (alphanumeric, hyphens, underscores, `.png` extension only) to prevent path traversal attacks.
- **Version bump** — server, README, user guides, and technical reference updated to 1.9.0.

### v1.8.4

- **🕹️ Hat Trick & Lucky Draw arcade cards reinstated** — `streak_3` (Hat Trick 🎩) and `streak_7` (Lucky Draw 🍀) are back in the arcade catalogue with their own game IDs (`hat_trick`, `lucky_draw`), distinct from the four already-developed games.
- **🐛 Whac-a-Bug difficulty increase** — system-error penalty doubled (−5 → −10 points), starting timer reduced by 5 seconds (60 s → 55 s), and spawn rate now ramps up linearly by 5 % every 30 seconds of play, adding a sustained challenge curve.
- **Version bump** — server, README, and technical reference updated to 1.8.4.

### v1.8.3

- **🎮 Arcade game assignment fix** — Whac-a-Bug and Code Breaker are now assigned to the 3rd and 4th earliest achievements (`task_50` and `task_100`) respectively, so all four developed games unlock in order: Hangman → Wordsearch → Whac-a-Bug → Code Breaker. Previously Whac-a-Bug and Code Breaker were erroneously attached to streak achievements that most users reach much later, meaning early achievers found undeveloped games.
- **🏷️ Game name on achievement cards** — each achievement card that has an associated arcade game now shows the game title in small italic text beneath the description, so users can see what they are working toward before they unlock it.
- **Version bump** — server, README, and technical reference updated to 1.8.3.

### v1.8.2

- **Version bump** — server and technical reference updated to 1.8.2.

### v1.8.1

- **🖱️ Task form UX polish** — "Add Sub-tasks" panel moved to directly below the Group field for a more natural top-down workflow. "Assign To" is now hidden until a group is selected (no more placeholder text cluttering the form). Notes field is now collapsed by default behind a toggle, keeping the form compact; it auto-expands when editing a task that already has notes.
- **Version bump** — server, README, user guides, and technical reference updated to 1.8.1.

### v1.8.0

- **✅ Sub-tasks** — tasks can now be broken down into individual checklist steps. When creating a task, expand the "Add Sub-tasks" panel to add as many steps as needed (up to 50 per task). Each sub-task can be ticked off independently from the task detail modal. A progress bar (and step count) appears on both the task card and the detail modal. Ticking any sub-task automatically sets the parent task status to "Started". Completing the final sub-task (or clicking Complete) finalises the task through the normal flow.
- **⭐ Sub-task XP** — each sub-task tick earns a small configurable XP reward (`complete_subtask` event, default 5 XP). Admins can adjust this in the XP Events section of the admin panel.
- **Version bump** — server, README, user guides, and technical reference updated to 1.8.0.

### v1.7.0

- **🔒 Security hardening** — comprehensive security audit and remediation:
  - JWT algorithm explicitly locked to `HS256` in both `jwt.verify` (auth middleware) and all `jwt.sign` calls, preventing algorithm-confusion attacks.
  - Email inputs in login, magic-link, and forgot-password endpoints now normalized (trimmed and lowercased) before DB lookup, matching registration behaviour and eliminating case-sensitive lookup failures.
  - HTML email templates now HTML-escape all user-controlled content (task titles, group names, inviter usernames, URLs) to prevent HTML-injection in email clients.
  - `express.json()` body-size limit set to 50 KB to mitigate memory-exhaustion DoS attacks.
  - Input length caps added: task title ≤ 255 chars, task details ≤ 10 000 chars, task note ≤ 5 000 chars, report reason ≤ 1 000 chars, group name ≤ 200 chars, task-type name ≤ 100 chars, admin reply ≤ 5 000 chars.
  - `assigneeIds` array capped at 100 entries per request to prevent oversized `IN (…)` queries.
- **Version bump** — server, README, user guides, and technical reference updated to 1.7.0.

### v1.6.2

- **🕹️ Arcade Token Economy** — a new token-based system gates access to the arcade mini-games. Users spend **Arcade Tokens** (earned through task completions and gamification events) to play. A configurable **daily play limit** (default 5 minutes, up to 180) adds a digital-wellbeing guardrail per user.
- **🎮 Two new arcade games** — **Code Breaker** (`game-code-breaker.js`) and **Whac-a-Bug** (`game-whac-a-bug.js`) join Hangman and Wordsearch in the arcade. All four games are loaded lazily when their corresponding badge is unlocked.
- **⚙️ New arcade endpoints** — `PATCH /api/gamification/arcade/daily-limit` (set daily play allowance) and `POST /api/gamification/arcade/spend-token` (atomic token deduction with race-condition guard).
- **🗂️ Collectible inventory API** — `GET /api/gamification/inventory` returns the authenticated user's full owned-item list with item and category details.
- **✅ `POST /api/gamification/inventory/claim`** — consumes a pending loot drop from the in-memory cache and persists it to `user_inventory` in an atomic transaction.
- **🛡️ Anti-farming improvements** — new `tasks.original_due_date` column records the deadline set at task creation; `tasks.xp_claimed` flag prevents XP being re-awarded on task edits. Both columns are added as runtime migrations.
- **🔧 Admin panel consolidation** — the Locked Accounts and User Reports sub-tabs have been merged into a single **Users** tab (each user row now shows lock status and open report count inline). A new **Gamify** tab consolidates XP Events configuration and the Collectibles CRUD panel into one place, replacing two separate tabs.
- **Version bump** — server, README, user guides, and technical reference updated to 1.6.2.

### v1.6.1

- **🎒 Collectibles & Loot Drop system** — completing tasks can now reward a random collectible item. A **Loot Drop Modal** appears after task completion if a drop is rolled, showing the item name, rarity (Common / Rare / Epic), category, and description. Players choose to **Keep** the item (adds it permanently to their inventory) or **Recycle** it for a small XP bonus. High-rarity items prompt a confirmation before recycling.
- **📦 My Collection view** — a new *🎒 My Collection* section on the Progress tab shows the full catalogue grouped by category. Owned items display in colour; unowned catalogue entries appear as greyed-out silhouettes so players can see what they have yet to collect. Each category is collapsible and scales gracefully to large catalogues.
- **⚙️ Admin collectibles management** — a new **🎒 Items** tab in the Admin Panel gives site administrators full CRUD control over:
  - **Categories** — create, rename, and soft-delete item categories.
  - **Items** — create (with name, optional description, category, and rarity), inline-edit, and soft-delete collectible items.
  - **Bulk Seed** — paste a structured JSON array to create multiple categories and items in one step. Existing entries (matched by name) are skipped without error, making re-seeding safe.
- **🌱 `POST /api/admin/collectibles/seed`** — new bulk-seed endpoint consumed by the admin UI. Returns a detailed summary (categories created / reused, items created / skipped).
- **🗂️ `GET /api/gamification/catalogue`** — public (authenticated) endpoint that returns the full active catalogue, used to render unowned silhouette placeholders in the player-facing Collection view.
- **♻️ `POST /api/gamification/inventory/recycle`** — endpoint to discard a pending drop in exchange for a configurable `recycle_drop` XP event (15 XP by default, adjustable in Admin → XP Events).
- **Version bump** — server, README, user guides, and technical reference updated to 1.6.1.

### v1.3.1

- **⭐ Progress tab** — dedicated bottom-navigation tab housing the full gamification dashboard (Skills, Achievements, Streaks). Gamification content moved from the Profile page to Progress for better discoverability.
- **Persistent XP/streak strip** — a slim interactive banner at the top of My Tasks shows the user's current level badge, XP progress bar toward the next level, and best active streak count. Tapping it navigates to the Progress tab. Only visible when gamification is enabled.
- **Floating Action Button (FAB)** — a large `+` button fixed at the bottom-right of the Tasks page replaces the in-header "New Task" button, positioning the primary action where thumbs naturally rest.

- **🧹 Main task list filtering** — the main task list now excludes all tasks without set due dates (sporadic and maintenance tasks, unscheduled items). Only completed tasks and pending tasks with explicit due dates appear in the main active list. Tasks without due dates remain visible in their dedicated dropdown sections (Sporadic Tasks, Long-term Goals). Updated frontend filtering logic to enforce date requirements.
- **Version bump** — server, README, user guide, how-to, and technical reference updated to 1.12.1.

### v1.12.0

- **🐛 Collectible items table layout fix** — the Edit button in the admin Collectible Items table was unexpectedly wide for rows that had a custom icon. The per-row `display:grid` with a variable column count (`28px 1fr auto auto` vs `1fr auto auto`) caused CSS Grid's `auto` track sizing to produce inconsistent button widths. Replaced with `display:flex` so the name column grows (`flex:1;min-width:0`) and buttons remain at their natural content size (`flex-shrink:0`) regardless of whether a row has a custom icon.
- **🐛 PNG upload "could not read image dimensions" fix** — the admin icon upload used `URL.createObjectURL` to load the selected file into an `<img>` for a client-side dimension check. The resulting `blob:` URL was blocked by the server's Content-Security-Policy `imgSrc` directive (which only allows `'self'` and `data:`), so every upload immediately fired `img.onerror`. Replaced with a single `FileReader.readAsDataURL` pass that produces a CSP-compliant `data:` URL; this same data URL is also reused as the base64 upload payload, eliminating a redundant second file-read.
- **Version bump** — server, README, user guide, how-to, and technical reference updated to 1.12.0.

### v1.11.0

- **🐛 Push notification fix** — the reminder scheduler now correctly respects the per-task browser popup notification flags (`notify_popup_7day`, `notify_popup_1day`, `notify_popup_onday`). Previously, push notifications were sent for every task that had email notifications enabled, ignoring whether browser push was actually toggled on for that window. Additionally, tasks with browser push enabled but email disabled will now receive push reminders as intended.
- **Version bump** — server, README, user guide, how-to, and technical reference updated to 1.11.0.

### v1.10.0

- **📌 Sporadic Tasks always visible** — the Sporadic Tasks section now always appears at the top of the task list, collapsed by default, and displays **(0)** when no sporadic tasks exist rather than being hidden entirely. This gives clearer discoverability and consistent placement.
- **🎯 Long-term Goals** — a new collapsible **Long-term Goals** section appears at the bottom of the task list. Goals are aspirational items outside the active task queue that support groups, XP multipliers, and notes. Tap **📅 Set Deadline** on any goal card to instantly convert it into a scheduled deadline task. Goals can also be created via the standard *New Task* modal by checking *Long-term Goal*.
- **Version bump** — server, README, user guide, and technical reference updated to 1.10.0.

### v1.9.0

- **🖼️ Collectible item icons** — administrators can now assign a custom PNG artwork to any collectible item. Place transparent PNG files in the `public/collectables/` directory on the server, then use the new **Browse** button in the Collectible Items admin panel to pick a file from a server-side list. The selected icon replaces the rarity emoji in both the loot-drop pop-up alert and the user's Collections page. Items without a custom icon continue to use the existing coloured emoji fallback. The server validates all filenames strictly (alphanumeric, hyphens, underscores, `.png` extension only) to prevent path traversal attacks.
- **Version bump** — server, README, user guides, and technical reference updated to 1.9.0.

### v1.8.4

- **🕹️ Hat Trick & Lucky Draw arcade cards reinstated** — `streak_3` (Hat Trick 🎩) and `streak_7` (Lucky Draw 🍀) are back in the arcade catalogue with their own game IDs (`hat_trick`, `lucky_draw`), distinct from the four already-developed games.
- **🐛 Whac-a-Bug difficulty increase** — system-error penalty doubled (−5 → −10 points), starting timer reduced by 5 seconds (60 s → 55 s), and spawn rate now ramps up linearly by 5 % every 30 seconds of play, adding a sustained challenge curve.
- **Version bump** — server, README, and technical reference updated to 1.8.4.

### v1.8.3

- **🎮 Arcade game assignment fix** — Whac-a-Bug and Code Breaker are now assigned to the 3rd and 4th earliest achievements (`task_50` and `task_100`) respectively, so all four developed games unlock in order: Hangman → Wordsearch → Whac-a-Bug → Code Breaker. Previously Whac-a-Bug and Code Breaker were erroneously attached to streak achievements that most users reach much later, meaning early achievers found undeveloped games.
- **🏷️ Game name on achievement cards** — each achievement card that has an associated arcade game now shows the game title in small italic text beneath the description, so users can see what they are working toward before they unlock it.
- **Version bump** — server, README, and technical reference updated to 1.8.3.

### v1.8.2

- **Version bump** — server and technical reference updated to 1.8.2.

### v1.8.1

- **🖱️ Task form UX polish** — "Add Sub-tasks" panel moved to directly below the Group field for a more natural top-down workflow. "Assign To" is now hidden until a group is selected (no more placeholder text cluttering the form). Notes field is now collapsed by default behind a toggle, keeping the form compact; it auto-expands when editing a task that already has notes.
- **Version bump** — server, README, user guides, and technical reference updated to 1.8.1.

### v1.8.0

- **✅ Sub-tasks** — tasks can now be broken down into individual checklist steps. When creating a task, expand the "Add Sub-tasks" panel to add as many steps as needed (up to 50 per task). Each sub-task can be ticked off independently from the task detail modal. A progress bar (and step count) appears on both the task card and the detail modal. Ticking any sub-task automatically sets the parent task status to "Started". Completing the final sub-task (or clicking Complete) finalises the task through the normal flow.
- **⭐ Sub-task XP** — each sub-task tick earns a small configurable XP reward (`complete_subtask` event, default 5 XP). Admins can adjust this in the XP Events section of the admin panel.
- **Version bump** — server, README, user guides, and technical reference updated to 1.8.0.

### v1.7.0

- **🔒 Security hardening** — comprehensive security audit and remediation:
  - JWT algorithm explicitly locked to `HS256` in both `jwt.verify` (auth middleware) and all `jwt.sign` calls, preventing algorithm-confusion attacks.
  - Email inputs in login, magic-link, and forgot-password endpoints now normalized (trimmed and lowercased) before DB lookup, matching registration behaviour and eliminating case-sensitive lookup failures.
  - HTML email templates now HTML-escape all user-controlled content (task titles, group names, inviter usernames, URLs) to prevent HTML-injection in email clients.
  - `express.json()` body-size limit set to 50 KB to mitigate memory-exhaustion DoS attacks.
  - Input length caps added: task title ≤ 255 chars, task details ≤ 10 000 chars, task note ≤ 5 000 chars, report reason ≤ 1 000 chars, group name ≤ 200 chars, task-type name ≤ 100 chars, admin reply ≤ 5 000 chars.
  - `assigneeIds` array capped at 100 entries per request to prevent oversized `IN (…)` queries.
- **Version bump** — server, README, user guides, and technical reference updated to 1.7.0.

### v1.6.2

- **🕹️ Arcade Token Economy** — a new token-based system gates access to the arcade mini-games. Users spend **Arcade Tokens** (earned through task completions and gamification events) to play. A configurable **daily play limit** (default 5 minutes, up to 180) adds a digital-wellbeing guardrail per user.
- **🎮 Two new arcade games** — **Code Breaker** (`game-code-breaker.js`) and **Whac-a-Bug** (`game-whac-a-bug.js`) join Hangman and Wordsearch in the arcade. All four games are loaded lazily when their corresponding badge is unlocked.
- **⚙️ New arcade endpoints** — `PATCH /api/gamification/arcade/daily-limit` (set daily play allowance) and `POST /api/gamification/arcade/spend-token` (atomic token deduction with race-condition guard).
- **🗂️ Collectible inventory API** — `GET /api/gamification/inventory` returns the authenticated user's full owned-item list with item and category details.
- **✅ `POST /api/gamification/inventory/claim`** — consumes a pending loot drop from the in-memory cache and persists it to `user_inventory` in an atomic transaction.
- **🛡️ Anti-farming improvements** — new `tasks.original_due_date` column records the deadline set at task creation; `tasks.xp_claimed` flag prevents XP being re-awarded on task edits. Both columns are added as runtime migrations.
- **🔧 Admin panel consolidation** — the Locked Accounts and User Reports sub-tabs have been merged into a single **Users** tab (each user row now shows lock status and open report count inline). A new **Gamify** tab consolidates XP Events configuration and the Collectibles CRUD panel into one place, replacing two separate tabs.
- **Version bump** — server, README, user guides, and technical reference updated to 1.6.2.

### v1.6.1

- **🎒 Collectibles & Loot Drop system** — completing tasks can now reward a random collectible item. A **Loot Drop Modal** appears after task completion if a drop is rolled, showing the item name, rarity (Common / Rare / Epic), category, and description. Players choose to **Keep** the item (adds it permanently to their inventory) or **Recycle** it for a small XP bonus. High-rarity items prompt a confirmation before recycling.
- **📦 My Collection view** — a new *🎒 My Collection* section on the Progress tab shows the full catalogue grouped by category. Owned items display in colour; unowned catalogue entries appear as greyed-out silhouettes so players can see what they have yet to collect. Each category is collapsible and scales gracefully to large catalogues.
- **⚙️ Admin collectibles management** — a new **🎒 Items** tab in the Admin Panel gives site administrators full CRUD control over:
  - **Categories** — create, rename, and soft-delete item categories.
  - **Items** — create (with name, optional description, category, and rarity), inline-edit, and soft-delete collectible items.
  - **Bulk Seed** — paste a structured JSON array to create multiple categories and items in one step. Existing entries (matched by name) are skipped without error, making re-seeding safe.
- **🌱 `POST /api/admin/collectibles/seed`** — new bulk-seed endpoint consumed by the admin UI. Returns a detailed summary (categories created / reused, items created / skipped).
- **🗂️ `GET /api/gamification/catalogue`** — public (authenticated) endpoint that returns the full active catalogue, used to render unowned silhouette placeholders in the player-facing Collection view.
- **♻️ `POST /api/gamification/inventory/recycle`** — endpoint to discard a pending drop in exchange for a configurable `recycle_drop` XP event (15 XP by default, adjustable in Admin → XP Events).
- **Version bump** — server, README, user guides, and technical reference updated to 1.6.1.

### v1.3.1

- **⭐ Progress tab** — dedicated bottom-navigation tab housing the full gamification dashboard (Skills, Achievements, Streaks). Gamification content moved from the Profile page to Progress for better discoverability.
- **Persistent XP/streak strip** — a slim interactive banner at the top of My Tasks shows the user's top skill name, level badge, XP progress bar, and best active streak count. Tapping it navigates to the Progress tab. Only visible when gamification is enabled.
- **Floating Action Button (FAB)** — a large `+` button fixed at the bottom-right of the Tasks page replaces the in-header "New Task" button, positioning the primary action where thumbs naturally rest.
- **Collapsible filter panel** — all task filters are now hidden behind a single `⚙️ Filters` chip. An active-filter count badge highlights the chip when filters are applied. Recovers vertical space on the Tasks page.
- **Gamification opt-in prompt** — first-time users who haven't been asked are shown a bottom-sheet modal offering to enable gamification. Shown once per device; remembered in `localStorage`.
- **Informational storage notice** — a dismissable banner appears on the landing/auth pages for first-time visitors, explaining that TaskIt! uses only essential `localStorage` (no tracking cookies). Dismissed state persisted in `localStorage`.
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

- Gamification engine — opt-in XP system, unified overall levels, XP breakdown by skill, dynamic titles, achievements, streak tracking, and freeze mechanic.
- Per-task notification preferences grid (email + popup × 7-day / 1-day / on-day).
- ICS calendar feed (private token-based URL).
- Task fast-forward, defer, recurrence.
- Database encryption via SQLCipher.
- Admin panel: stats, SMTP, locked accounts, user reports, feedback management.
- Group QR invite links, email invites, invite word-pair join flow.

## Setup

### Server

```bash
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
| GET    | /api/tasks                | List tasks (filters: status, groupId, typeId, archived, assignedToMe; use `groupId=__personal__` for creator-only Personal tasks) |
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
| GET    | /api/gamification/catalogue                | Full active collectibles catalogue (authenticated)       |
| GET    | /api/gamification/inventory                | Authenticated user's owned collectible inventory         |
| POST   | /api/gamification/inventory/claim          | Claim a pending loot drop → persisted to inventory       |
| POST   | /api/gamification/inventory/recycle        | Discard pending drop for a small XP consolation bonus    |
| GET    | /api/gamification/leaderboard/group/:groupId | Group XP leaderboard (members with gamification on)    |
| GET    | /api/gamification/leaderboard/friends      | Friends XP leaderboard                                   |
| PATCH  | /api/gamification/arcade/daily-limit       | Set daily arcade play limit in minutes (1–180)           |
| POST   | /api/gamification/arcade/spend-token       | Atomically deduct 1 arcade token from balance            |

### Admin
| Method | Path                                     | Description                          |
|--------|------------------------------------------|--------------------------------------|
| GET    | /api/admin/smtp                          | Get SMTP settings                    |
| PUT    | /api/admin/smtp                          | Update SMTP settings                 |
| GET    | /api/admin/users                         | List all users (includes lock status and open report count) |
| GET    | /api/admin/locked                        | List locked accounts                 |
| POST   | /api/admin/users/:id/unlock              | Unlock account                       |
| PUT    | /api/admin/users/:id/role                | Change user role                     |
| GET    | /api/admin/reports                       | List user reports                    |
| PUT    | /api/admin/reports/:id/resolve           | Resolve a user report                |
| GET    | /api/admin/stats                         | Stats dashboard                      |
| GET    | /api/admin/feedback                      | List feedback messages               |
| PUT    | /api/admin/feedback/:id/read             | Mark feedback as read                |
| PATCH  | /api/admin/feedback/:id/status           | Update feedback status               |
| POST   | /api/admin/feedback/:id/reply            | Send in-app reply to user            |
| GET    | /api/admin/xp-events                     | List XP event catalogue              |
| PATCH  | /api/admin/xp-events/:key                | Update XP event value/enabled        |
| GET    | /api/admin/arcade-games                  | List admin-managed arcade games      |
| POST   | /api/admin/arcade-games                  | Register an arcade game              |
| PATCH  | /api/admin/arcade-games/:id              | Update arcade game metadata/config   |
| DELETE | /api/admin/arcade-games/:id              | Delete arcade game registration      |
| GET    | /api/admin/arcade-game-files             | List compatible arcade JS files      |
| GET    | /api/admin/arcade-settings               | Read global arcade play limit        |
| PUT    | /api/admin/arcade-settings               | Update global arcade play limit      |
| GET    | /api/admin/collectible-categories        | List active collectible categories   |
| POST   | /api/admin/collectible-categories        | Create collectible category          |
| PATCH  | /api/admin/collectible-categories/:id    | Rename collectible category          |
| DELETE | /api/admin/collectible-categories/:id    | Soft-delete collectible category     |
| GET    | /api/admin/collectibles                  | List active collectibles             |
| POST   | /api/admin/collectibles                  | Create collectible item              |
| PATCH  | /api/admin/collectibles/:id              | Update collectible item              |
| DELETE | /api/admin/collectibles/:id              | Soft-delete collectible item         |
| POST   | /api/admin/collectibles/seed             | Bulk-seed categories and items       |

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

TaskIt! uses **SQLCipher** (via `better-sqlite3-multiple-ciphers`) to encrypt the entire SQLite database file at rest, protecting all stored data including usernames, email addresses, task content, and all other records.

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

This creates `server/taskit-encrypted.db`. Once you have verified it opens correctly, back up your original database, rename the encrypted file to `taskit.db`, and restart the server. The script prints the exact verification and rename commands to run after a successful migration.

You may also supply explicit source and destination paths:

```bash
node server/encrypt-db.js /path/to/taskit.db /path/to/taskit-encrypted.db
```

### Passwords

User passwords are **never stored in plaintext**. They are hashed using **bcrypt** (cost factor 10) before being stored. The database encryption provides an additional layer of protection for all other personal data.

---

## Security & Design Bugfix To-do Log

Audit date: **2026-07-27**. This section records the most common and most concerning vulnerabilities that affect the current dependency set, deployment shape, serving model, and UI design. It is intentionally written as a bugfix log rather than a marketing summary: each item names the weakness, why it matters, what already reduces the risk, and what should be improved next.

### Dependency Vulnerabilities

- [x] **High: upgraded `nodemailer` beyond the vulnerable `<=9.0.0` range.** Fixed on 2026-07-27 by updating the server dependency to `nodemailer@9.0.3`, rebuilding successfully with `npm run build -w server`, and confirming `npm audit --omit=dev` no longer reports GHSA-p6gq-j5cr-w38f. `server/src/services/mail.ts` now sends all application email through a narrow `sendTaskItMail` helper that accepts only the fields TaskIt actually uses (`from`, `to`, `subject`, `text`, `html`) and applies `disableFileAccess: true` plus `disableUrlAccess: true` on every message. The existing call sites continue to build plain text/HTML emails from sanitized application data rather than `raw` messages, attachment paths, or URL-backed content.

- [x] **Low: updated the Express/body-parser chain to clear the `body-parser <1.20.6` denial-of-service advisory.** Fixed on 2026-07-27 with `npm audit fix`, which moved Express' parser dependency to `body-parser@1.20.6`. Verified with `npm audit` returning `found 0 vulnerabilities` and `npm run build -w server` passing.

- [x] **High in development/build tooling: updated `postcss` beyond the vulnerable `<=8.5.17` range.** Fixed on 2026-07-27 with `npm audit fix`, which moved the Tailwind/PostCSS toolchain to `postcss@8.5.23`. Verified with `npm audit` returning `found 0 vulnerabilities` and `npm run build:css -w server` completing successfully. `public/tailwind.css` regenerated without a content diff, so the security update did not alter the compiled UI stylesheet.

- [x] **Low in development tooling on Windows: updated `esbuild` out of the vulnerable `0.27.3 - 0.28.0` range.** Fixed on 2026-07-27 with `npm audit fix`, which moved `tsx` to `4.22.3` and `esbuild` to `0.28.1`. Verified with `npm audit` returning `found 0 vulnerabilities`.

- [ ] **Medium: add a recurring dependency-maintenance gate.** At present the audit result depends on a manual command. Add CI steps for `npm ci`, `npm audit --omit=dev --audit-level=high`, and a separate non-blocking full audit report for dev dependencies. The production gate should fail on high/critical runtime advisories, while the dev audit should be reviewed regularly so build-chain vulnerabilities do not linger unseen.

### Server, Deployment, and Methods of Serving the Code

- [x] **High: kept `BASE_URL`, proxy, and TLS assumptions explicit in production.** Fixed on 2026-07-27 by adding production startup validation in `server/src/config.ts`. When `NODE_ENV=production`, TaskIt now refuses to start unless `JWT_SECRET`, `BASE_URL`, `TRUST_PROXY`, and `DB_ENCRYPTION_KEY` are configured; `BASE_URL` and configured CORS origins must be valid `https://` URLs; `CORS_ORIGIN=*` is rejected; and partial SMTP credential, VAPID key, or Turnstile key configuration fails fast. `HOWTO.md` and `TECHNICAL_REFERENCE.md` now document the required production values and the exact `TRUST_PROXY` choices.

- [x] **High: replaced hard-coded `app.set('trust proxy', 1)` with explicit `TRUST_PROXY` configuration.** Fixed on 2026-07-27 by parsing `TRUST_PROXY` in `server/src/config.ts` and passing it into Express from `server/src/index.ts`. Local development keeps the previous one-hop default, but production must choose deliberately: `false` for direct Node exposure, a numeric hop count such as `1` for a known reverse proxy, or a named/CIDR allowlist such as `loopback`. `TRUST_PROXY=true` is rejected in production because it trusts every `X-Forwarded-For` sender.

- [x] **High: tightened the Content Security Policy by removing `unsafe-eval`.** Fixed on 2026-07-27 after scanning the codebase for `eval(...)` and `new Function(...)` usage and finding no runtime dependency on string-to-code execution. `server/src/index.ts` now omits `'unsafe-eval'` from Helmet's `script-src` directive while retaining `'unsafe-inline'` and `script-src-attr 'unsafe-inline'` temporarily because the current SPA still contains inline scripts and many inline event attributes. The remaining CSP follow-up is to move inline JavaScript out of `public/index.html`, replace `onclick` attributes with delegated event listeners, and then remove the inline allowances.

- [ ] **Medium: revisit static caching and service-worker cache invalidation.** Static JavaScript is served with `Cache-Control: public, max-age=31536000, immutable`, while filenames such as `/js/version.js`, `/js/qrcode.js`, and arcade game scripts are not generally content-hashed. The service worker versioning helps, and `/sw.js` is served with `no-cache`, but long-lived immutable caching on non-fingerprinted JavaScript can leave users running stale client code after a security fix, especially through a CDN or browser cache. Prefer filename fingerprinting for immutable assets, or reduce JavaScript cache lifetime and rely on ETags/revalidation until fingerprinting exists.

- [ ] **Medium: add a security header checklist for hosting layers outside Express.** Helmet covers the Node response, but production deployments may add nginx, Cloudflare, platform static hosting, or Android WebView/browser paths. Ensure outer layers preserve `Content-Type`, `X-Content-Type-Options`, CSP, HSTS, referrer policy, permissions policy, and cache-control headers. Add HSTS at the TLS terminator if it is not already present, and verify redirects from HTTP to HTTPS before login or token-bearing routes are reachable.

- [ ] **Medium: treat public token URLs as credentials.** Calendar feeds, group invites, friend invites, magic links, and reset links are all bearer-style URLs. The code uses strong random tokens and short expiries for auth and invite flows, which is good. The concern is leakage through browser history, screenshots, logs, analytics, referrers, support tickets, and calendar clients. Continue using `Referrer-Policy` from Helmet, avoid logging full tokens in production, rotate ICS tokens on demand, and consider showing users a clearer warning that anyone with an active calendar URL can read dated task summaries until the token is rotated.

- [ ] **Medium: make database encryption mandatory for production.** The README says plaintext SQLite is suitable for development but not recommended for production. That is accurate, but the code currently allows production to start without `DB_ENCRYPTION_KEY`. Because the database contains email addresses, task content, group membership, private calendar tokens, push subscriptions, hashed OTPs, password hashes, invite tokens, and SMTP/VAPID settings, production should either fail without encryption or print a very loud deployment warning that must be intentionally overridden.

- [ ] **Low: set release hardening for Android.** The Android release build currently has `minifyEnabled false`, and `android:allowBackup="true"`. The app stores JWTs in `EncryptedSharedPreferences`, which is a good local control, but release builds should still enable shrinking/obfuscation, review backup behavior for token-adjacent metadata, and add a network security configuration if non-production endpoints are ever introduced. Keep the HTTPS-only production base URL, and avoid BODY-level HTTP logging outside debug builds; the current `BuildConfig.DEBUG` guard is the right pattern.

### Authentication and Authorization Weaknesses

- [x] **High: reduced browser session-token blast radius while retaining bearer-token compatibility.** Fixed on 2026-07-27 by shortening web-issued JWTs from 7 days / 30 days to 12 hours / 7 days and returning explicit `expiresAt` metadata from OTP and magic-link verification. The web client now stores `taskitTokenExpiresAt` next to the token, clears expired browser auth before use, keeps non-remembered sessions in `sessionStorage`, and avoids accidentally moving session-only profile updates into `localStorage`. This does not fully migrate to `HttpOnly` cookies yet, so the next long-term improvement remains a cookie/refresh-token design; however, the XSS blast radius of the current browser bearer-token design is materially smaller.

- [x] **High: rate-limited OTP verification by session as well as route/IP.** Fixed on 2026-07-27 by adding `otp_tokens.failed_attempts` and enforcing `MAX_OTP_ATTEMPTS = 5` in `server/src/routes/auth.ts`. Incorrect OTP submissions now increment the database counter; the fifth wrong code marks the OTP session `used` and returns `429`, so a leaked `sessionId` cannot be brute-forced for the full 10-minute lifetime even from distributed IPs.

- [ ] **Medium: consider requiring OTP for magic-link login or narrowing magic-link privileges.** Magic links are convenient and short-lived, and reset tokens are purpose-bound. However, a mailbox compromise or forwarded link can bypass the password-plus-OTP path completely. If TaskIt positions OTP as strong two-factor authentication, magic-link login should either be treated as passwordless single-factor auth and labelled accordingly, or followed by an additional local confirmation step for high-risk actions such as changing email, changing password, deleting account, creating admin users, or rotating security settings.

- [ ] **Medium: continue hardening admin endpoints as high-value targets.** Admin routes are protected by authenticated rate limiting and role middleware, and recent release notes show GDPR-focused minimization. The admin area still controls SMTP, Turnstile, VAPID, user roles, reports, XP events, arcade game metadata, and collectible catalogue data. Add explicit audit logging for admin changes, require recent re-authentication before role/security settings changes, and consider a separate admin rate limit lower than the general authenticated quota.

### User Interface Design and Frontend Rendering

- [x] **High: reduced XSS risk created by the large inline HTML/JavaScript SPA with an automated sink guardrail.** Fixed on 2026-07-27 by adding `scripts/xss-sink-scan.js`, a reviewed baseline in `scripts/xss-sink-baseline.json`, and `npm run security:xss-sinks`. The scanner tracks HTML-rendering sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`), inline event handlers, and dynamic script creation across the public frontend, then fails when new sink signatures appear without an intentional baseline update. The root `npm run build` now runs this scan before the server build. This does not finish the larger modularization work; it prevents the existing risk surface from quietly growing while future refactors move rendering toward `textContent`, DOM construction, and delegated event listeners.

- [ ] **Medium: replace inline event attributes with registered listeners.** `onclick` and other inline handlers force the CSP to allow inline script attributes. That means a future HTML injection bug is more likely to become script execution. Moving handlers to JavaScript modules will both improve maintainability and allow CSP to become meaningfully restrictive. This is also a design quality fix: explicit listeners make it easier to reason about modal stacking, back-button behavior, keyboard handling, disabled states, and accessibility.

- [ ] **Medium: audit accessibility and failure states for security-sensitive flows.** Login, OTP, password reset, group invite acceptance, admin settings, token rotation, and account deletion should have clear loading, disabled, retry, and error states. Ambiguous UI states create security weaknesses because users retry actions, paste tokens into support channels, or misunderstand whether a secret was rotated. Add focused UI tests for auth failures, expired invite links, expired reset links, locked accounts, offline API responses, and service-worker update prompts.

- [ ] **Medium: distinguish client-side motivational limits from server-side enforcement.** The Arcade daily play timer stores local play seconds in `localStorage`, which is appropriate for a wellbeing nudge but not for a security or fairness boundary. Users can reset it locally. Keep any competitive, XP, inventory, token, or leaderboard effects enforced server-side only. The README and admin UI should phrase client timers as user-experience limits, not anti-cheat controls.

- [ ] **Low: reduce visual over-density on the unauthenticated landing page.** The landing page communicates product scope well, but it mixes marketing, demo mockups, gamification callouts, structured data, install messaging, and app shell concerns in one large file. From a security and maintainability perspective, the risk is not the visual style itself; it is that product copy, auth UI, app runtime, and admin markup live together. Separating the landing page from the authenticated application shell would shrink the unauthenticated attack surface and make accidental exposure of hidden authenticated/admin DOM less likely if CSS or JavaScript fails.

### Testing and Verification To-dos

- [ ] Add `npm audit --omit=dev --audit-level=high` to CI and record the expected clean output after dependency updates.
- [ ] Add tests for OTP brute-force limits, expired magic/reset tokens, used-token replay, locked-account token rejection, password-reset token-version invalidation, and ICS token rotation.
- [ ] Add response-header tests for CSP, cache-control, `Service-Worker-Allowed`, JSON content type, static CSS/JS content type, and calendar feed `no-store`.
- [ ] Add a production-startup configuration test that refuses missing `JWT_SECRET`, invalid/non-HTTPS `BASE_URL`, and optionally missing `DB_ENCRYPTION_KEY`.
- [ ] Add frontend tests or lint rules for unsafe rendering sinks: new `innerHTML`, inline handlers, dynamic script paths, and user-controlled URL construction.
- [ ] Add Android release checks for `allowBackup`, debug logging, minification, and token persistence behavior.

---

## Release Notes

### Version 1.16.2 (2026-05-09)

**Arcade — achievement-count game unlocking:**
- **Current workflow note:** As of v1.21.5, the unlock order is stored in the admin-managed `arcade_games` database catalogue rather than a hard-coded frontend array. Use **Admin > Gamify > Arcade Games** to change order, enabled state, metadata, or script file.
- **`ARCADE_GAME_ORDER`** — a new explicit ordered array that defines the canonical unlock sequence for all arcade games. Position N in the list = game N+1 (1-indexed).
- **Count-based unlock logic** — a user with N total achievements earned (any achievements) may play the first N games in `ARCADE_GAME_ORDER`. The *identity* of the achievements does not matter, only the count. This ensures users who unlock achievements faster than games are created always have games to play.
- **Automatic catch-up on new game creation** — when a new game is added to `ARCADE_GAME_ORDER` at position N, every user with ≥ N achievements gains access immediately with no database changes.
- **New card state: "Game available"** — achievement cards whose game slot is accessible (by count) but whose specific achievement is not yet earned are rendered in a purple tint (`gamif-ach-game-ready`) with "🎮 Game available" label and a "🕹️ Play" button.
- Admins continue to access all games regardless of achievement count.

### Version 1.16.1 (2026-05-08)

**Arcade — global daily play limit:**
- **New `site_settings` table** — a key-value store for server-wide configuration. Seeded with `arcade_daily_play_minutes = 5` as the single source of truth for the arcade daily play limit.
- **Admin arcade settings** — new `GET /api/admin/arcade-settings` and `PUT /api/admin/arcade-settings` endpoints allow admins to read and update the global daily play limit (1–180 minutes). A PUT immediately propagates the new value to all existing users.
- **Admin Gamify tab — 🕹️ Arcade Settings card** — admins can now edit the global daily play limit directly from the Gamify tab of the administrator dashboard.
- **Whac-a-Bug game timer unchanged** — individual game session timers are independent of the daily wrapper limit. The 55-second base game duration was not altered.
- Reduced default arcade daily play limit from 15 minutes to **5 minutes** across DB migration default, server fallback, and frontend fallback; all documentation updated to match.

**Tooling:**
- Added Session Completion Protocol to `.github/copilot-instructions.md` — version bumping, documentation updates, and security/quality deep-dive steps enforced at the end of every agent session.

### Version 1.16.0 (2026-05-03)

**Gamification overhaul:**
- **Unified level system** — a user's Level is now derived from the sum of all XP earned across all skills. Every completed task contributes to a single overall level, regardless of task type.
- **XP breakdown chart** — the Skills section on the Progress page has been replaced with an SVG donut chart showing the proportional breakdown of XP by skill. Each skill's exact XP and percentage are shown in a colour-coded legend.
- **Level progress bars everywhere** — the Tasks page strip and the Progress page banner both show the overall level number and a bar indicating progress toward the next level.
- **Level-based achievements** — Specialist and Master of the Craft achievements now trigger at overall Level 5 and Level 10.
- **Title updated** — dynamic title prefix is now based on the user's overall level; the skill qualifier uses the skill with the highest accumulated XP.

**Backend:**
- Server version bumped to 1.16.0

### Version 1.8.6 (2026-04-26)

**GDPR Compliance & Security:**
- **Removed email addresses from admin user lists** – Admin endpoints (`GET /api/admin/users` and `GET /api/admin/locked`) no longer expose users' email addresses, ensuring better privacy compliance with GDPR data minimization principles. Admins can still manage accounts but cannot view personal email data through the admin panel.

**Backend:**
- Server version bumped to 1.10.2

### Version 1.8.5 (2026-04-26)

**Bug Fixes:**
- **Fixed recurring task spawning on archive** – Recurring tasks now correctly spawn their next occurrence when archived, matching the behavior of completion and deletion. Previously, archiving a recurring task would only hide it without creating the next scheduled instance, breaking the recurrence schedule.

**Visual Improvements:**
- **Standardized dropdown arrow styling** – The "Tasks due more than two weeks from now" dropdown arrow now uses consistent styling (`▶` / `▼`) matching other dropdown features throughout the UI, improving visual coherence.

**Backend:**
- Server version bumped to 1.10.1
