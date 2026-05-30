# TaskIt! – VAPID Push Notifications: Complete User Manual

> **Audience:** Server administrators who need to configure push notifications, and end-users who want to understand how the feature works and how to use it.

---

## Table of Contents

1. [What Are Push Notifications?](#1-what-are-push-notifications)
2. [The Two Kinds of Notifications in TaskIt!](#2-the-two-kinds-of-notifications-in-taskit)
3. [How the VAPID Push System Works — End to End](#3-how-the-vapid-push-system-works--end-to-end)
4. [Server Configuration (Administrator)](#4-server-configuration-administrator)
5. [User Setup (Per Device)](#5-user-setup-per-device)
6. [Enabling Reminders on Tasks](#6-enabling-reminders-on-tasks)
7. [Understanding When Notifications Fire](#7-understanding-when-notifications-fire)
8. [Checking Your Push Subscription Status](#8-checking-your-push-subscription-status)
9. [Troubleshooting](#9-troubleshooting)
10. [Technical Architecture (Deep Dive)](#10-technical-architecture-deep-dive)
11. [Security Notes](#11-security-notes)

---

## 1. What Are Push Notifications?

A **push notification** is a message delivered to your device by the server, even when the TaskIt! browser tab is closed or the device screen is off. You have almost certainly seen them — they are the small banners or lock-screen alerts that appear from apps even when you are not actively using them.

On the web platform, this is achieved through the **Web Push API**, which is built into all modern browsers (Chrome, Firefox, Edge, Safari 16.4+). The server sends a message to a cloud relay (Google, Mozilla, Apple, etc.) which forwards it to your browser, which wakes up a background script called a **Service Worker** to display the notification.

**VAPID** stands for *Voluntary Application Server Identification*. It is a security standard (RFC 8292) that proves to the push relay service that messages genuinely originate from your TaskIt! server, not from an impostor. Without VAPID, the push relay would refuse to deliver messages.

---

## 2. The Two Kinds of Notifications in TaskIt!

TaskIt! has **two separate notification mechanisms** that are often confused. Both are triggered by the same per-task "Popup" checkboxes, but they work very differently:

| Feature | In-Tab Popup | Background Push |
|---|---|---|
| Works when tab is **open** | ✅ Yes | ✅ Yes |
| Works when tab is **closed** | ❌ No | ✅ Yes |
| Works when **browser is closed** | ❌ No | ✅ Yes (mobile) |
| Requires VAPID keys | ❌ No | ✅ Yes |
| Requires notification permission | ✅ Yes | ✅ Yes |
| Delivered by | Browser JS timer | Server → Push Service → Service Worker |
| Fired by | `refreshNotifications()` every 5 min | Scheduler running hourly on the server |

**If you only want popups while the tab is open:** the in-tab mechanism works immediately once the user grants notification permission. No server-side VAPID setup is needed.

**If you want reminders when the tab/browser is closed** (true background push): VAPID must be configured on the server AND the user's device must be subscribed.

---

## 3. How the VAPID Push System Works — End to End

Here is the complete journey of a push notification, from server key generation to the notification appearing on a device.

### 3.1 Key Generation (One Time, Admin)

An administrator generates a VAPID **key pair** — a public key and a private key. These are elliptic-curve cryptographic keys on the P-256 curve:

- The **private key** stays secret on the server. It signs every message sent to the push relay, proving the message is genuine.
- The **public key** is shared openly with browsers. A browser uses it when subscribing so the push relay knows which server is authorised to send to that subscription.

### 3.2 Browser Subscription (Once per User per Device)

When a user logs in to TaskIt!:

1. The browser asks the user for **notification permission** (`Notification.requestPermission()`).
2. If granted, the frontend calls the **Service Worker's PushManager** (`navigator.serviceWorker.ready` → `reg.pushManager.subscribe({applicationServerKey: vapidPublicKey})`).
3. The browser contacts the push relay (e.g., `https://fcm.googleapis.com` for Chrome) and registers a unique **push endpoint URL** tied to this browser and this device.
4. The push relay returns the endpoint URL plus two cryptographic keys (`p256dh` and `auth`), which together form the **push subscription**.
5. The frontend POSTs this subscription to the TaskIt! server (`POST /api/push/subscribe`), which stores it in the `push_subscriptions` database table.

Each user can have **multiple subscriptions** — one per device/browser combination. A desktop Chrome subscription is completely separate from a mobile Firefox subscription.

### 3.3 Reminder Scheduling (Hourly, Server)

The server runs a background job every hour. For each task with upcoming deadlines and popup flags enabled, it:

1. Looks up all users who should be notified (task creator + assignees).
2. Looks up every push subscription stored for each user.
3. Calls `webpush.sendNotification(subscription, payload)` for each subscription.

The payload is a JSON object containing the notification title, body text, icon, badge, and a deep-link URL back to the specific task.

### 3.4 Push Relay Delivery

The server makes an HTTPS request to the push endpoint URL (e.g., Google's FCM servers). The request is signed with the VAPID private key. The push relay verifies the signature, and if valid, stores the message and forwards it to the target browser/device.

### 3.5 Service Worker Receives the Push

The browser's service worker (`/sw.js`) listens for `push` events. Even when TaskIt! is not open, the browser keeps the service worker registered. When the push arrives:

1. The service worker parses the JSON payload.
2. It calls `self.registration.showNotification(title, options)` to display the notification.
3. Clicking the notification focuses an existing TaskIt! tab (or opens a new one) and navigates directly to the relevant task.

---

## 4. Server Configuration (Administrator)

This section is for the person who runs the TaskIt! server.

### 4.1 Prerequisites

- Your TaskIt! server must be accessible over **HTTPS**. The Web Push API is a secure-context API; browsers will not allow push subscriptions over plain HTTP. (A Cloudflare Tunnel or similar reverse proxy that terminates TLS is sufficient — the backend can run on HTTP internally.)
- Your server must be able to make **outbound HTTPS requests** to push relay servers (Google/FCM, Mozilla, Apple, etc.) on port 443.

### 4.2 Generating VAPID Keys

You need to generate a VAPID key pair **once**. Never reuse keys from another server and never share the private key.

**Method A: Using the Admin UI (Recommended)**

1. Log in as an admin and navigate to **Admin → Notifications / VAPID**.
2. Click the **Generate New VAPID Keys** button.
3. The public and private keys are filled into the form fields.
4. Click **Save VAPID Settings**.

> ⚠️ **Warning:** Generating new keys invalidates all existing push subscriptions. Every user will need to re-subscribe. With the fix in v1.18.2 this happens automatically on their next page load, but they will miss any reminders sent between key rotation and their next login.

**Method B: Command Line**

```bash
npx web-push generate-vapid-keys
```

Copy the output into the Admin UI VAPID form or into your `.env` file:

```
VAPID_PUBLIC_KEY=<paste public key here>
VAPID_PRIVATE_KEY=<paste private key here>
VAPID_SUBJECT=mailto:admin@yourdomain.com
```

> Environment variables only seed the database on **first boot** (when no row exists in `vapid_settings`). After the first boot, use the Admin UI to change keys. Editing `.env` after first boot has no effect on the stored keys.

### 4.3 The VAPID Subject

The `subject` field must be either:
- A `mailto:` URI with a valid email address, e.g. `mailto:admin@yourdomain.com`  
- An `https://` URL identifying your server

The push relay may use this to contact you if there is a problem. It defaults to `mailto:admin@<your BASE_URL hostname>` when `BASE_URL` is configured.

### 4.4 Verifying the Configuration

After saving, the Admin VAPID page shows:
- The public key value (visible).
- `🔑 Private key is configured (hidden)` — this means a private key is stored.

If it shows `⚠️ No private key configured`, push will not work.

### 4.5 Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Yes (for push) | Base64url-encoded P-256 public key (~88 chars) |
| `VAPID_PRIVATE_KEY` | Yes (for push) | Base64url-encoded P-256 private key (~43 chars) |
| `VAPID_SUBJECT` | Recommended | `mailto:` or `https://` contact URI |
| `BASE_URL` | Recommended | Used to auto-derive `VAPID_SUBJECT` and deep-link URLs |

### 4.6 Database Encryption

The VAPID private key is stored in the SQLite database. It is strongly recommended to enable database-at-rest encryption using `DB_ENCRYPTION_KEY` in your `.env`. See `HOWTO.md` for migration instructions.

---

## 5. User Setup (Per Device)

Each device/browser combination must subscribe independently. The subscription happens automatically when you log in — you do not need to take manual steps beyond granting notification permission.

### 5.1 Granting Notification Permission

The first time you log in to TaskIt! in a browser, the browser will show a **permission prompt** asking whether to allow notifications from the TaskIt! site. You must click **Allow**.

If you accidentally clicked **Block**, you need to re-enable it manually:

- **Chrome/Edge (Desktop):** Address bar → 🔒 lock icon → Site settings → Notifications → Allow.
- **Chrome (Android):** Settings → Site Settings → Notifications → find the TaskIt! URL → Allow.
- **Firefox:** Address bar → 🛡️ icon → More information → Permissions → Receive Notifications → Allow.
- **Safari (macOS 13+):** Safari menu → Settings → Websites → Notifications → find TaskIt! → Allow.

### 5.2 What Happens Automatically on Login

Once notification permission is granted:

1. The service worker (`/sw.js`) is registered in the background.
2. `subscribeToPush()` runs automatically: it fetches the VAPID public key from the server, contacts the browser's push relay, and registers this device.
3. The subscription (endpoint + cryptographic keys) is sent to the TaskIt! server and stored.
4. From that point on, background push reminders will arrive on this device.

You do **not** need to re-subscribe manually — the subscription persists until you clear browser data, the browser uninstalls it, or the admin regenerates VAPID keys (in which case the next login re-subscribes automatically as of v1.18.2).

### 5.3 Push Notifications as a PWA (Installed App)

If you install TaskIt! as a Progressive Web App (PWA) — e.g. "Add to Home Screen" on Android, or "Install" in Chrome desktop — push notifications work the same way but may appear more like native app notifications, even when the PWA window is closed.

---

## 6. Enabling Reminders on Tasks

Push notifications only fire for tasks that have the popup flags turned on. There are two places to configure this:

### 6.1 Default Preferences (Profile Page)

1. Navigate to **Profile → Notification Preferences**.
2. Under **🖥️ Popup Reminders (Browser)**, tick the timing windows you want enabled by default for new tasks:
   - **7 days before**
   - **1 day before**
   - **On the day**
3. Click **Save Preferences**.

These defaults are applied automatically when you create a new task.

### 6.2 Per-Task Settings (Task Edit Modal)

When creating or editing a task, scroll to the **Notifications** section. The popup row lets you override the defaults for that specific task.

> ⚠️ **Important:** Popup reminders only fire for tasks that have a **due date** set. Tasks without a due date are never reminded.

---

## 7. Understanding When Notifications Fire

### 7.1 Reminder Windows

The scheduler checks for tasks once every hour and sends reminders for tasks whose deadline falls within a *reminder window*:

| Window | Fires when task is due in… |
|---|---|
| **7-day** | Between 6 and 8 days from now |
| **1-day** | Between 22 and 50 hours from now |
| **On-day** | Between 0 and 25 hours from now |

The windows deliberately overlap slightly so that a task is never missed if the scheduler runs a few minutes late.

### 7.2 One Reminder Per Window Per Task

Each task gets **at most one reminder per window**. Once a reminder (email or push) has been successfully sent for a given window, a deduplication record is written and that window is not re-triggered.

This means: if you enable both email and popup for the same task, both fire in the same scheduler pass — you won't receive them at separate times.

### 7.3 In-Tab Popups vs. Background Push

- **In-tab popups** fire from `refreshNotifications()`, which runs every 5 minutes while the tab is open. They use a separate localStorage-based deduplication keyed by day, so they fire once per day per window per task.
- **Background push** fires from the server scheduler, once per window per task, regardless of whether the tab is open.

You may therefore receive two notifications for the same task if the tab is open when the server's hourly push fires — one from the service worker (background push) and one from the in-tab timer.

---

## 8. Checking Your Push Subscription Status

Open **Profile → Notification Preferences**. Below the "Popup Reminders" heading you will see a status banner. It shows one of the following states:

| Banner | Meaning |
|---|---|
| ✅ **Background push notifications are active on this device** | Everything is working. Your device is subscribed. |
| ⚙️ **Background push notifications are not yet configured on this server** | An admin needs to set VAPID keys. In-tab popups still work. |
| 🚫 **Notification permission is blocked in your browser** | Go to browser settings and allow notifications for this site. |
| ❓ **Notification permission has not been granted yet** | Click the "Grant permission" link in the banner. |
| 🔄 **Push notification permission is granted but this device is not yet subscribed** | Click "Subscribe now" or reload the page. |
| ⚠️ **Could not check push subscription status** | The service worker is not ready. Try reloading the page. |
| ⚠️ **Background push notifications are not supported by this browser** | Use a modern browser such as Chrome, Edge, or Firefox. |

---

## 9. Troubleshooting

### "I set VAPID keys but push notifications never arrive"

1. **Check the server log** for messages starting with `[scheduler]`. If you see `Failed to send push notification`, the server is trying but something is going wrong. Common causes:
   - **Network:** The server cannot reach the push relay (FCM, Mozilla, etc.). Verify outbound HTTPS is allowed.
   - **Subject mismatch:** The `subject` field is not a valid `mailto:` or `https://` URI.

2. **Check the browser console** (F12 → Console) after logging in. Look for `[push]` messages. If you see `Failed to register push subscription: SW timeout`, the service worker is not installing in time — try reloading the page.

3. **Verify the subscription exists** in the Admin panel. There is currently no subscription count UI, but the server logs a removal message when a broken subscription is deleted.

4. **Ensure tasks have popup flags set** for the relevant window, AND have a due date within a reminder window.

5. **Ensure the server clock is accurate.** The scheduler uses `Date.now()` to calculate reminder windows. A clock that is many hours off will cause reminders to miss their windows.

### "I regenerated VAPID keys and now push stopped working"

As of **v1.18.2**, this is handled automatically. On the user's next login or page load, the old browser subscription is detected (VAPID key mismatch), unsubscribed, and a new one is created with the new key. If push still doesn't work after users have reloaded:

- Check that the server correctly stored the new keys (Admin → VAPID → `🔑 Private key is configured`).
- Restart the server to reload the keys into the web-push library.

### "I see the permission prompt but clicking Allow does nothing"

The browser granted permission but `subscribeToPush()` may have failed silently. Open the browser console and look for `[push]` warnings. If the VAPID public key fetch returned 503, the server does not have VAPID keys configured.

### "Push works on desktop but not on my iPhone"

Safari on iOS supports Web Push from iOS 16.4 onwards, but **only for sites installed as PWA** ("Add to Home Screen"). Safari does not deliver push notifications to regular browser tabs. Install TaskIt! as a PWA, then grant notification permission inside the installed app.

### "Notifications arrive but clicking them doesn't open the right task"

Ensure `BASE_URL` is set correctly in your server `.env`. If not set, push payload URLs default to a relative path which may not work in all browsers when clicking a notification in the notification tray (outside the app context).

---

## 10. Technical Architecture (Deep Dive)

### 10.1 Component Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                          TaskIt! Server                               │
│                                                                      │
│  index.ts          ← calls reconfigureWebpush() at startup           │
│  webpush-config.ts ← reads vapid_settings from DB, configures lib    │
│  routes/push.ts    ← GET  /api/push/vapid-public-key (public)        │
│                       POST /api/push/subscribe    (authenticated)     │
│                       DELETE /api/push/subscribe  (authenticated)     │
│  routes/admin.ts   ← GET/PUT /api/admin/vapid                        │
│                       GET /api/admin/vapid/generate                   │
│  services/scheduler.ts ← sendPushNotificationsForUser()              │
│                           runs hourly via node-cron                   │
│  db.ts             ← vapid_settings table (singleton row)            │
│                       push_subscriptions table (one per device/user)  │
│                       task_reminders_sent table (deduplication)       │
└─────────────────────────┬────────────────────────────────────────────┘
                          │ HTTPS + VAPID-signed request
                          ▼
               ┌──────────────────────┐
               │  Push Relay Service   │
               │  (FCM / Mozilla /     │
               │   Apple / etc.)       │
               └──────────┬───────────┘
                          │ WebSocket / long-poll
                          ▼
               ┌──────────────────────┐
               │   User's Browser /    │
               │   Installed PWA       │
               │                      │
               │  Service Worker       │
               │  (sw.js)              │
               │  'push' event →       │
               │  showNotification()   │
               └──────────────────────┘
```

### 10.2 Database Tables

**`vapid_settings`** (singleton, `id = 1`):

| Column | Description |
|---|---|
| `public_key` | Base64url VAPID public key |
| `private_key` | Base64url VAPID private key (store encrypted at rest) |
| `subject` | `mailto:` or `https://` contact URI |
| `updated_at` | Last-modified timestamp (ms) |

**`push_subscriptions`** (one row per subscribed browser/device per user):

| Column | Description |
|---|---|
| `id` | UUID primary key |
| `user_id` | Foreign key → users.id |
| `endpoint` | Push relay URL (unique index) |
| `keys_p256dh` | Browser's P-256 public key (for payload encryption) |
| `keys_auth` | 16-byte authentication secret (for payload encryption) |
| `created_at` | Registration timestamp (ms) |

**`task_reminders_sent`** (deduplication log):

| Column | Description |
|---|---|
| `task_id` | Foreign key → tasks.id |
| `reminder_type` | `7_day`, `1_day`, or `on_day` |
| `sent_at` | Timestamp when reminder was sent (ms) |

### 10.3 `subscribeToPush()` Flow (Frontend)

```
Page loads / user logs in
    │
    ▼
Notification permission granted?
    │ No → cleanupRevokedPushSubscription()
    │ Yes
    ▼
serviceWorker & PushManager supported?
    │ No → return (silently)
    │ Yes
    ▼
Wait for navigator.serviceWorker.ready (3 s timeout)
    │
    ▼
GET /api/push/vapid-public-key
    │ 503 → return (server not configured)
    │ 200 → { publicKey }
    ▼
reg.pushManager.getSubscription()
    │
    ├─ Existing subscription found
    │       ▼
    │   Compare applicationServerKey with current VAPID public key  [v1.18.2+]
    │       │ Keys match → skip to POST
    │       │ Keys differ → unsubscribe old, DELETE /api/push/subscribe
    │                       → fall through to subscribe
    │
    └─ No existing subscription (or just unsubscribed above)
            ▼
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
            │
            ▼
POST /api/push/subscribe { endpoint, keys: { p256dh, auth } }
```

### 10.4 Scheduler Flow (Server, Hourly)

```
cron '0 * * * *'
    │
    ▼
sendReminders()
    │
    ├─ For each reminder window (7_day, 1_day, on_day):
    │       │
    │       ▼
    │   SELECT tasks WHERE in window AND flags enabled AND not yet sent
    │       │
    │       └─ For each task:
    │               │
    │               ├─ emailApplicable? → sendTaskReminder() → anyDelivered = true
    │               │
    │               ├─ pushApplicable? → sendPushNotificationsForUser()
    │               │       │
    │               │       ├─ getVapidFromDb() → keys missing? return false
    │               │       ├─ SELECT push_subscriptions WHERE user_id = ?
    │               │       ├─ subscriptions empty? return false
    │               │       └─ webpush.sendNotification() for each sub
    │               │               ├─ 410/404 → delete subscription row
    │               │               ├─ 401/403 → delete subscription row [v1.18.2+]
    │               │               │            (key mismatch — user re-subscribes on next load)
    │               │               └─ other error → log and skip
    │               │
    │               └─ anyDelivered? → INSERT task_reminders_sent (dedup)
    │
    └─ resetOverdueStreaks()
```

---

## 11. Security Notes

- **The VAPID private key must be kept secret.** Anyone with the private key can send push notifications to your users' devices impersonating your server. Enable `DB_ENCRYPTION_KEY` in production.
- **Push subscriptions are end-to-end encrypted.** The payload is encrypted using the browser's `p256dh` and `auth` keys before leaving your server. The push relay cannot read the notification content.
- **Endpoint uniqueness is enforced** in the database and in the subscribe route: an endpoint can only belong to one user. If the same endpoint is re-submitted by a different user (theoretically impossible in normal operation), the server silently ignores the re-registration.
- **Stale subscriptions are cleaned up automatically:** the scheduler removes subscriptions that return HTTP 410 (gone), 404 (not found), 401, or 403 (key mismatch) from the push relay. The browser-side cleanup also runs when the user has revoked notification permission.
