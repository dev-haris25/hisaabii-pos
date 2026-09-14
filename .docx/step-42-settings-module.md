# Step 42 — Settings module (Profile / Restaurant / Data)

## What

Implemented the Hisabi-style Settings area for Hisabi POS with three tabs:

1. **Profile** (all roles) — account name/email/language, change password, notification toggles (`notifyZatca`, `notifyHr`, `notifySalesOps`, `notifyTeam`).
2. **Restaurant** (Owner/Admin via `BusinessSettings`) — Hisabi-parity inline identity (logo upload + bilingual address + tax registration with re-onboard confirm), contact, printer, document prefixes/padding, default VAT, formats; unified Save.
3. **Data** (Owner/Admin) — record counts + permission-gated CSV exports.

## Schema

- Added `BusinessSettings` (1:1 with `BusinessProfile`) for invoice/CN/DN/SS prefixes, number padding, date/number formats, default document language.
- Migration: `prisma/migrations/20260913220000_business_settings`.
- Seeded on register + create restaurant; backfill for existing profiles in migration.

## Numbering

Allocate helpers now read prefixes/padding from `BusinessSettings` (with defaults):

- POS checkout invoices
- Credit / debit notes
- Salary slips

## Routes / APIs

- `/settings` → redirects to `/settings/profile`
- `/settings/profile`, `/settings/restaurant`, `/settings/data`
- `GET/PATCH /api/auth/account/profile`
- `POST /api/auth/change-password`
- `GET/PATCH /api/auth/settings` (ops settings + contact + VAT + printer)
- `GET /api/auth/settings/data-summary`
- `GET /api/auth/settings/data-export?entity=…`
- Printer API now uses `BusinessSettings` permission via `authorizeBusinessRequest`

## Access

- Sidebar Settings visible to all authenticated roles.
- Restaurant/Data tabs + pages gated to Owner/Admin (`BusinessSettings` / full access).
- APIs for restaurant/data remain permission-checked.
