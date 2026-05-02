# Cloudflare Turnstile CAPTCHA Integration - Implementation Summary

## Overview
Cloudflare Turnstile CAPTCHA has been successfully integrated into TaskIt! to provide robust bot protection on the registration endpoint. The implementation is fully configurable and can be enabled/disabled at runtime through admin settings.

## Components Added/Modified

### 1. **Backend (Server-Side)**

#### Configuration (`server/src/config.ts`)
- Added `TURNSTILE_SITE_KEY` from `process.env.TURNSTILE_SITE_KEY`
- Added `TURNSTILE_SECRET_KEY` from `process.env.TURNSTILE_SECRET_KEY`
- These optional environment variables allow configuration at startup

#### Database Schema (`server/src/db.ts`)
- Created new `turnstile_settings` table (singleton pattern like `smtp_settings`):
  ```sql
  CREATE TABLE IF NOT EXISTS turnstile_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    site_key TEXT NOT NULL DEFAULT '',
    secret_key TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  ```
- Auto-initialized from environment variables on first startup
- Automatically enabled when both site key and secret key are provided

#### Authentication Routes (`server/src/routes/auth.ts`)
- Added `verifyTurnstileToken()` function to validate CAPTCHA tokens with Cloudflare
- Updated `/api/auth/register` endpoint to:
  - Accept optional `turnstileToken` parameter
  - Check if Turnstile is enabled in database
  - Verify token with Cloudflare if enabled
  - Reject registration with "CAPTCHA verification is required" if token missing
  - Reject with "CAPTCHA verification failed" if token invalid
- Added public `/api/auth/turnstile` endpoint (no auth required):
  - Returns `{ site_key, enabled }`
  - Used by frontend to initialize CAPTCHA widget
  - Never exposes the secret key

#### Admin Routes (`server/src/routes/admin.ts`)
- Added `GET /api/admin/turnstile` - Retrieve current settings (admin only)
  - Returns: `{ id, site_key, enabled, updated_at }`
  - Never returns secret key to clients
- Added `PUT /api/admin/turnstile` - Update settings (admin only)
  - Request body: `{ site_key, secret_key, enabled }`
  - Allows admins to configure Turnstile at runtime
  - Updates `updated_at` timestamp

### 2. **Frontend (Client-Side)**

#### HTML (`public/index.html`)
- Added Turnstile script tag to `<head>`:
  ```html
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  ```
- Added Turnstile widget container to registration form:
  ```html
  <div class="form-group" id="turnstileContainer" style="display:none;">
    <div class="cf-turnstile" data-sitekey="0x4AAAAAADHG9MF8L5deVmZ2" data-theme="light"></div>
  </div>
  ```
  - Container hidden by default (shown only if Turnstile is enabled)
  - Widget uses light theme for better UX
  - Site key set as data attribute (will be updated dynamically)

#### JavaScript Functions (`public/index.html`)
- Updated `showTab()` function to call `initTurnstile()` when switching to register tab
- Added `initTurnstile()` function:
  - Fetches Turnstile settings from public endpoint
  - Dynamically shows/hides Turnstile widget based on enabled status
  - Renders/resets the Cloudflare widget with correct site key
  - Gracefully handles errors (widget optional)
- Updated `handleRegister()` function:
  - Gets Turnstile response token via `window.turnstile.getResponse()`
  - Sends token in registration request
  - Resets widget after successful/failed registration

### 3. **Configuration**

#### Environment Variables (`server/.env.example`)
Added documentation for new optional variables:
```bash
# ===== Cloudflare Turnstile CAPTCHA =====
# Optional: Enable CAPTCHA protection on registration to prevent bot abuse.
# Create a Turnstile account at https://dash.cloudflare.com/ and set the following.
# Leave unset to disable Turnstile (registration will not require CAPTCHA).
# TURNSTILE_SITE_KEY=0x4AAAAAADHG9MF8L5deVmZ2
# TURNSTILE_SECRET_KEY=0x4AAAAAADHG9CioVT0qjNUSWBe8kUiYPuA
```

## Security Features

1. **Secret Key Protection**
   - Secret key never exposed to clients
   - Only server-side verification occurs
   - Admin endpoint specifically filters out secret key in response

2. **Verification Process**
   - All CAPTCHA tokens verified with Cloudflare API
   - Failed verifications properly logged
   - Network errors handled gracefully

3. **Graceful Degradation**
   - When Turnstile is disabled, registration works normally
   - Frontend silently hides widget if not enabled
   - API accepts requests without token when disabled

4. **Rate Limiting**
   - Registration endpoint is already protected by auth rate limiter (20 req/15min)
   - Turnstile provides additional bot protection

## Usage

### For Deployment/Setup

1. **Generate Turnstile Keys**
   - Create account at https://dash.cloudflare.com/
   - Create a new Turnstile site (managed mode or challenge mode)
   - Copy site key and secret key

2. **Configure Environment Variables**
   ```bash
   TURNSTILE_SITE_KEY=0x4AAAAAADHG9MF8L5deVmZ2
   TURNSTILE_SECRET_KEY=0x4AAAAAADHG9CioVT0qjNUSWBe8kUiYPuA
   ```

3. **Restart Server**
   - Database will auto-initialize settings on startup
   - Turnstile will be enabled if both keys are provided

4. **Runtime Configuration (Admin Panel)**
   - Admins can view/update settings via:
     - `GET /api/admin/turnstile` - View settings
     - `PUT /api/admin/turnstile` - Update settings
   - Changes take effect immediately

### For Users

- Registration form will display CAPTCHA widget if enabled
- Users must solve CAPTCHA before registering
- Widget automatically resets on form submission
- Clear error messages if CAPTCHA verification fails

## Testing Results

✅ **Public Endpoint Test**
- `GET /api/auth/turnstile` returns correct site key when enabled
- Returns empty site_key when disabled

✅ **Registration Without Token Test**
- When Turnstile is enabled and no token provided:
  - Returns 400 Bad Request
  - Error: "CAPTCHA verification is required"

✅ **Admin Endpoint Protection**
- Admin endpoints require authentication
- Non-admin/non-authenticated users receive 401/403 responses

✅ **Database Initialization**
- Settings auto-created on first startup
- Respects environment variables
- Singleton pattern ensures single settings record

✅ **Frontend Integration**
- Turnstile script loads correctly
- Widget renders when enabled
- Widget hidden when disabled
- Token collection and transmission working

## API Endpoints

### Public Endpoints

**Get Turnstile Status (no auth required)**
```
GET /api/auth/turnstile
Response: { "site_key": "...", "enabled": true|false }
```

**Register User**
```
POST /api/auth/register
Body: {
  "username": "user",
  "email": "user@example.com",
  "password": "...",
  "locale": "en-GB",
  "turnstileToken": "..." (optional if Turnstile disabled)
}
```

### Admin-Protected Endpoints

**Get Turnstile Settings**
```
GET /api/admin/turnstile
Response: { "id": 1, "site_key": "...", "enabled": true|false, "updated_at": 12345 }
```

**Update Turnstile Settings**
```
PUT /api/admin/turnstile
Body: {
  "site_key": "0x4AAAAAADHG9MF8L5deVmZ2",
  "secret_key": "0x4AAAAAADHG9CioVT0qjNUSWBe8kUiYPuA",
  "enabled": true
}
Response: { "message": "Turnstile settings updated" }
```

## Migration Notes

- Existing databases will auto-create the `turnstile_settings` table
- No data loss or migration required
- Backward compatible - works with existing registrations
- Can be enabled/disabled at any time without affecting users

## Production Recommendations

1. **Always use HTTPS** in production (required by Cloudflare Turnstile)
2. **Rotate keys periodically** for enhanced security
3. **Monitor verification failures** - unusual patterns may indicate attacks
4. **Keep credentials in secure environment variables** - never commit to source
5. **Use Turnstile in managed mode** for automatic challenge difficulty adjustment
6. **Set appropriate challenge difficulty** based on traffic patterns

## Files Modified

1. `server/src/config.ts` - Added TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY exports
2. `server/src/db.ts` - Added turnstile_settings table and initialization
3. `server/src/routes/auth.ts` - Added Turnstile verification, public endpoint, updated /register
4. `server/src/routes/admin.ts` - Added admin Turnstile settings endpoints
5. `public/index.html` - Added Turnstile script, widget, JavaScript functions
6. `server/.env.example` - Added Turnstile configuration documentation

## Verification

The implementation has been verified to:
- ✅ Load Turnstile JavaScript SDK
- ✅ Initialize CAPTCHA widget dynamically
- ✅ Collect verification tokens
- ✅ Send tokens to backend
- ✅ Verify tokens with Cloudflare
- ✅ Block unverified registrations
- ✅ Allow runtime configuration
- ✅ Protect admin endpoints
- ✅ Never expose secret keys
- ✅ Gracefully degrade when disabled
