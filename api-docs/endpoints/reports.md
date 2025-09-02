# Reports Endpoints

### GET `/`

**What it does:** Create or list entities (contextual).
**Auth:** Admin privileges required (session cookie).

**Example**
```bash
curl -X GET "{BASE}/" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### POST `/`

**What it does:** Create or list entities (contextual).
**Auth:** Admin privileges required (session cookie).

**Example**
```bash
curl -X POST "{BASE}/" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### DELETE `/:id`

**What it does:** Read/Update/Delete entity by id (contextual).
**Auth:** Admin privileges required (session cookie).
**Path params:** `id`
**Query params:** `hard`

**Example**
```bash
curl -X DELETE "{BASE}/:id" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### GET `/:id`

**What it does:** Read/Update/Delete entity by id (contextual).
**Auth:** Admin privileges required (session cookie).
**Path params:** `id`

**Example**
```bash
curl -X GET "{BASE}/:id" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### PUT `/:id`

**What it does:** Read/Update/Delete entity by id (contextual).
**Auth:** Admin privileges required (session cookie).
**Path params:** `id`

**Example**
```bash
curl -X PUT "{BASE}/:id" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### POST `/:id/execute`

**What it does:** Execute a saved report and return JSON sections.
**Auth:** Admin privileges required (session cookie).
**Path params:** `id`

**Example**
```bash
curl -X POST "{BASE}/:id/execute" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```

### GET `/:id/execute/tsv`

**What it does:** Download specific report section as TSV.
**Auth:** Admin privileges required (session cookie).
**Path params:** `id`
**Query params:** `section`

**Example**
```bash
curl -X GET "{BASE}/:id/execute/tsv" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>"
```

### POST `/verify`

**What it does:** Verify a SQL report runs safely.
**Auth:** Admin privileges required (session cookie).

**Example**
```bash
curl -X POST "{BASE}/verify" \
  -H "Content-Type: application/json" \
  -b "evomail_sid=<YOUR_SID>" \
  -d '{ }'
```
