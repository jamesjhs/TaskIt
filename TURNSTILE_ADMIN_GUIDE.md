# Turnstile CAPTCHA Configuration Guide

## Quick Setup

### 1. Enable Turnstile via Environment Variables

Set these in your `.env` file before starting the server:

```bash
TURNSTILE_SITE_KEY=0x4AAAAAADHG9MF8L5deVmZ2
TURNSTILE_SECRET_KEY=0x4AAAAAADHG9CioVT0qjNUSWBe8kUiYPuA
```

Then restart the server. Turnstile will be enabled automatically.

### 2. Manage Turnstile via Admin API

#### View Current Settings
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/admin/turnstile
```

Response:
```json
{
  "id": 1,
  "site_key": "0x4AAAAAADHG9MF8L5deVmZ2",
  "enabled": true,
  "updated_at": 1725280000000
}
```

#### Enable/Disable Turnstile
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "site_key": "0x4AAAAAADHG9MF8L5deVmZ2",
    "secret_key": "0x4AAAAAADHG9CioVT0qjNUSWBe8kUiYPuA",
    "enabled": true
  }' \
  http://localhost:3000/api/admin/turnstile
```

Response:
```json
{
  "message": "Turnstile settings updated"
}
```

#### Disable Turnstile
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "site_key": "",
    "secret_key": "",
    "enabled": false
  }' \
  http://localhost:3000/api/admin/turnstile
```

### 3. Getting Your Turnstile Keys

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Turnstile** section
3. Create a new site (or use existing)
4. Copy the **Site Key** and **Secret Key**

## Frontend Behavior

When Turnstile is **enabled**:
- Registration form displays CAPTCHA widget
- Users must solve the CAPTCHA before registering
- Widget automatically validates and sends token with registration request
- Clear error messages if CAPTCHA fails

When Turnstile is **disabled**:
- No CAPTCHA widget displayed
- Registration works normally
- No changes to user experience

## Security Best Practices

1. **Never commit secrets to git**
   - Use environment variables for keys
   - Use `.env` file with proper `.gitignore`

2. **Rotate keys periodically**
   - Generate new keys quarterly
   - Update via admin API or environment variables
   - Restart server if using .env

3. **Monitor activity**
   - Check Cloudflare dashboard for verification statistics
   - Unusual patterns may indicate bot attacks

4. **Use appropriate challenge difficulty**
   - Managed Mode: Cloudflare adjusts automatically
   - Recommended for most deployments

5. **HTTPS required in production**
   - Cloudflare requires secure origin
   - Use valid SSL certificates

## Troubleshooting

### Turnstile widget not showing
- Check if Turnstile is enabled: `GET /api/auth/turnstile`
- Verify site key is not empty
- Check browser console for JavaScript errors
- Ensure Cloudflare API is accessible from client network

### Registration blocked with "CAPTCHA verification is required"
- Turnstile is enabled but no token provided
- User need to solve CAPTCHA before registering
- If CAPTCHA widget not loading, check site key

### "CAPTCHA verification failed"
- Token is invalid or expired
- User should refresh page and try again
- Check network connectivity to Cloudflare API

### Secret key appearing in responses
- Never happens - backend explicitly filters it out
- Admin API only returns `site_key`, not `secret_key`

## API Reference

### Public Endpoints (No Auth Required)

`GET /api/auth/turnstile`
- Returns Turnstile status for registration form
- Response: `{ "site_key": "...", "enabled": true|false }`

### Admin Endpoints (Auth Required, Admin Role)

`GET /api/admin/turnstile`
- View all Turnstile settings
- Response includes timestamps and all fields

`PUT /api/admin/turnstile`
- Update Turnstile settings
- Request body: `{ "site_key", "secret_key", "enabled" }`
- Response: `{ "message": "Turnstile settings updated" }`

## Examples

### Python
```python
import requests

# Get Turnstile status
response = requests.get('http://localhost:3000/api/auth/turnstile')
print(response.json())

# Update Turnstile settings (requires token)
headers = {'Authorization': f'Bearer {token}'}
data = {
    'site_key': '0x4AAAAAADHG9MF8L5deVmZ2',
    'secret_key': '0x4AAAAAADHG9CioVT0qjNUSWBe8kUiYPuA',
    'enabled': True
}
response = requests.put(
    'http://localhost:3000/api/admin/turnstile',
    json=data,
    headers=headers
)
print(response.json())
```

### JavaScript
```javascript
// Get Turnstile status
const response = await fetch('/api/auth/turnstile');
const { site_key, enabled } = await response.json();
console.log(`Turnstile ${enabled ? 'enabled' : 'disabled'}: ${site_key}`);

// Update settings (requires token)
const updateResponse = await fetch('/api/admin/turnstile', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    site_key: '0x4AAAAAADHG9MF8L5deVmZ2',
    secret_key: '0x4AAAAAADHG9CioVT0qjNUSWBe8kUiYPuA',
    enabled: true
  })
});
console.log(await updateResponse.json());
```
