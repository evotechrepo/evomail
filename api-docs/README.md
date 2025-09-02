# API Documentation

This repository exposes multiple Express routers mounted under the following base paths:

- **auth**: `/evotechmail/api/auth`, `/auth`
- **evomail**: `/`
- **scan**: `/`
- **reports**: `/`
- **admin**: `/`

## Auth model
- Cookie-based session (`evomail_sid` by default).
- Protected routes require a valid session cookie set by **POST /auth/login**.
- Admin-only routers additionally require `requireAdmin`.

## Endpoint groups
- [Auth](endpoints/auth.md)
- [Evomail Core](endpoints/evomail-core.md)
- [Scan / Mail Intake](endpoints/scan-mail-intake.md)
- [Reports](endpoints/reports.md)
- [Admin](endpoints/admin.md)