# Auth Endpoints

### POST `/evotechmail/api/auth/login`
_Alias:_ `/auth/login`

**What it does:** Log in with email/password. Sets a session cookie.
**Auth:** No session required for login; others use session cookie.

**Example**
```bash
curl -X POST "{BASE}/evotechmail/api/auth/login" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### POST `/evotechmail/api/auth/logout`
_Alias:_ `/auth/logout`

**What it does:** Invalidate the session cookie.
**Auth:** No session required for login; others use session cookie.

**Example**
```bash
curl -X POST "{BASE}/evotechmail/api/auth/logout" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### GET `/evotechmail/api/auth/me`
_Alias:_ `/auth/me`

**What it does:** Return current session user info.
**Auth:** No session required for login; others use session cookie.

**Example**
```bash
curl -X GET "{BASE}/evotechmail/api/auth/me" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```
