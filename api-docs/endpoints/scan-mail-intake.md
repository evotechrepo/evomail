# Scan / Mail Intake Endpoints

### POST `/OLDupload`
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X POST "{BASE}/OLDupload" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### GET `/allsubscribers`

**What it does:** List all subscribers for scan intake.
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X GET "{BASE}/allsubscribers" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### POST `/insert`

**What it does:** Insert a mail record, optionally notify.
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X POST "{BASE}/insert" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### GET `/subscribers`

**What it does:** List subscribers for scan intake (no partner portal).
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X GET "{BASE}/subscribers" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### POST `/upload`

**What it does:** Image upload (multipart/form-data, field 'image').
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X POST "{BASE}/upload" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```
