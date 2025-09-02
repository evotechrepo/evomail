# Admin Endpoints

### POST `/hash`
**Auth:** Admin privileges required (session cookie).

**Example**
```bash
curl -X POST "{BASE}/hash" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### GET `/roles`
**Auth:** Admin privileges required (session cookie).

**Example**
```bash
curl -X GET "{BASE}/roles" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### POST `/users`
**Auth:** Admin privileges required (session cookie).

**Example**
```bash
curl -X POST "{BASE}/users" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```
