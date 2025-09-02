# Evomail Core Endpoints

### GET `/compliance/subscribers`

**What it does:** Compliance view of subscribers (filters, paging).
**Auth:** Session cookie required (authenticated user).
**Query params:** `compliant`, `limit`, `offset`, `q`, `status`

**Example**
```bash
curl -X GET "{BASE}/compliance/subscribers" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/compliance/subscribers/:id/notes`

**What it does:** Get compliance notes for a subscriber.
**Auth:** Session cookie required (authenticated user).
**Path params:** `id`

**Example**
```bash
curl -X GET "{BASE}/compliance/subscribers/:id/notes" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/fetch-all`

**What it does:** Return active subscribers with selected columns.
**Auth:** Session cookie required (authenticated user).
**Query params:** `limit`, `offset`

**Example**
```bash
curl -X GET "{BASE}/fetch-all" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/header-values`

**What it does:** Return UI header labels (PMB, First Name, etc.).
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X GET "{BASE}/header-values" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/health`
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X GET "{BASE}/health" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/lookups`

**What it does:** Return dropdown lookup values (statuses, sources, BCG, mail types/statuses).
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X GET "{BASE}/lookups" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/mail/export-emails`

**What it does:** Export email list for chosen groups.
**Auth:** Session cookie required (authenticated user).
**Query params:** `business_owner`, `partners`, `status`

**Example**
```bash
curl -X GET "{BASE}/mail/export-emails" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/mail/group-emails`

**What it does:** Return group email addresses used for BCC by partner.
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X GET "{BASE}/mail/group-emails" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/mail/group-emails/:partner_cd`
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X GET "{BASE}/mail/group-emails/:partner_cd" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### POST `/mail/send`

**What it does:** Send email with batching + logo CID substitution.
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X POST "{BASE}/mail/send" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### GET `/mailinbox/:mailId/image`

**What it does:** Download a mail image.
**Auth:** Session cookie required (authenticated user).
**Path params:** `mailId`

**Example**
```bash
curl -X GET "{BASE}/mailinbox/:mailId/image" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### POST `/mailinbox/mail/:mailId/action`

**What it does:** Apply an action to mail item (e.g., forward/discard).
**Auth:** Session cookie required (authenticated user).
**Path params:** `mailId`

**Example**
```bash
curl -X POST "{BASE}/mailinbox/mail/:mailId/action" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### GET `/mailinbox/mail/:mailId/events`

**What it does:** Get mail events (status changes).
**Auth:** Session cookie required (authenticated user).
**Path params:** `mailId`

**Example**
```bash
curl -X GET "{BASE}/mailinbox/mail/:mailId/events" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/mailinbox/statuses`

**What it does:** List mail statuses.
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X GET "{BASE}/mailinbox/statuses" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/mailinbox/subscribers/:id/inbox`

**What it does:** Fetch a subscriber's inbox/received mail.
**Auth:** Session cookie required (authenticated user).
**Path params:** `id`

**Example**
```bash
curl -X GET "{BASE}/mailinbox/subscribers/:id/inbox" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/notifications`

**What it does:** List notification rows (email send attempts).
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X GET "{BASE}/notifications" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/notifications/:id`

**What it does:** Get single notification by ID.
**Auth:** Session cookie required (authenticated user).
**Path params:** `id`

**Example**
```bash
curl -X GET "{BASE}/notifications/:id" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### POST `/notifications/:id/resend`

**What it does:** Resend a notification by ID.
**Auth:** Session cookie required (authenticated user).
**Path params:** `id`

**Example**
```bash
curl -X POST "{BASE}/notifications/:id/resend" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### GET `/notifications/batch/:batchId`

**What it does:** Get all notifications in a batch.
**Auth:** Session cookie required (authenticated user).
**Path params:** `batchId`

**Example**
```bash
curl -X GET "{BASE}/notifications/batch/:batchId" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### POST `/search`

**What it does:** Search subscribers with filters (pmb, firstName, lastName, company, phone, email, primaryAddress, status, source, bcg).
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X POST "{BASE}/search" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### POST `/subscribers`

**What it does:** List subscribers for scan intake (no partner portal).
**Auth:** Session cookie required (authenticated user).

**Example**
```bash
curl -X POST "{BASE}/subscribers" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### POST `/subscribers/:id/compliance`

**What it does:** Create a compliance note/record for a subscriber.
**Auth:** Session cookie required (authenticated user).
**Path params:** `id`

**Example**
```bash
curl -X POST "{BASE}/subscribers/:id/compliance" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### POST `/subscribers/:id/inactivate`

**What it does:** Set subscriber status to inactive.
**Auth:** Session cookie required (authenticated user).
**Path params:** `id`

**Example**
```bash
curl -X POST "{BASE}/subscribers/:id/inactivate" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### POST `/subscribers/:id/reactivate`

**What it does:** Set subscriber status to active.
**Auth:** Session cookie required (authenticated user).
**Path params:** `id`

**Example**
```bash
curl -X POST "{BASE}/subscribers/:id/reactivate" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### PUT `/subscribers/by-id/:id`

**What it does:** Update a subscriber by ID; supports notes/addresses payload.
**Auth:** Session cookie required (authenticated user).
**Path params:** `id`

**Example**
```bash
curl -X PUT "{BASE}/subscribers/by-id/:id" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```
