# Endpoint Catalog


## Admin
- `GET    /roles` —
- `POST   /hash` —
- `POST   /users` —

## Auth
- `GET    /evotechmail/api/auth/me` — Return current session user info.
- `POST   /evotechmail/api/auth/login` — Log in with email/password. Sets a session cookie.
- `POST   /evotechmail/api/auth/logout` — Invalidate the session cookie.

## Reports
- `DELETE /:id` — Read/Update/Delete entity by id (contextual).
- `GET    /` — Create or list entities (contextual).
- `GET    /:id` — Read/Update/Delete entity by id (contextual).
- `GET    /:id/execute/tsv` — Download specific report section as TSV.
- `POST   /` — Create or list entities (contextual).
- `POST   /:id/execute` — Execute a saved report and return JSON sections.
- `POST   /verify` — Verify a SQL report runs safely.
- `PUT    /:id` — Read/Update/Delete entity by id (contextual).

## Evomail Core
- `GET    /compliance/subscribers` — Compliance view of subscribers (filters, paging).
- `GET    /compliance/subscribers/:id/notes` — Get compliance notes for a subscriber.
- `GET    /fetch-all` — Return active subscribers with selected columns.
- `GET    /header-values` — Return UI header labels (PMB, First Name, etc.).
- `GET    /health` —
- `GET    /lookups` — Return dropdown lookup values (statuses, sources, BCG, mail types/statuses).
- `GET    /mail/export-emails` — Export email list for chosen groups.
- `GET    /mail/group-emails` — Return group email addresses used for BCC by partner.
- `GET    /mail/group-emails/:partner_cd` —
- `GET    /mailinbox/:mailId/image` — Download a mail image.
- `GET    /mailinbox/mail/:mailId/events` — Get mail events (status changes).
- `GET    /mailinbox/statuses` — List mail statuses.
- `GET    /mailinbox/subscribers/:id/inbox` — Fetch a subscriber's inbox/received mail.
- `GET    /notifications` — List notification rows (email send attempts).
- `GET    /notifications/:id` — Get single notification by ID.
- `GET    /notifications/batch/:batchId` — Get all notifications in a batch.
- `POST   /mail/send` — Send email with batching + logo CID substitution.
- `POST   /mailinbox/mail/:mailId/action` — Apply an action to mail item (e.g., forward/discard).
- `POST   /notifications/:id/resend` — Resend a notification by ID.
- `POST   /search` — Search subscribers with filters (pmb, firstName, lastName, company, phone, email, primaryAddress, status, source, bcg).
- `POST   /subscribers` — List subscribers for scan intake (no partner portal).
- `POST   /subscribers/:id/compliance` — Create a compliance note/record for a subscriber.
- `POST   /subscribers/:id/inactivate` — Set subscriber status to inactive.
- `POST   /subscribers/:id/reactivate` — Set subscriber status to active.
- `PUT    /subscribers/by-id/:id` — Update a subscriber by ID; supports notes/addresses payload.

## Scan / Mail Intake
- `GET    /allsubscribers` — List all subscribers for scan intake.
- `GET    /subscribers` — List subscribers for scan intake (no partner portal).
- `POST   /OLDupload` —
- `POST   /insert` — Insert a mail record, optionally notify.
- `POST   /upload` — Image upload (multipart/form-data, field 'image').