# Step 14 — Cashiers module + POS checkout

## Summary
Implemented the complete cashiers admin module and the standalone POS checkout screen, including login-code auth (replacing PIN), encrypted code storage, and ZATCA-signed simplified invoice checkout with on-screen Phase-2 QR.

## Auth & data model
- `BusinessProfile.slug` (unique, auto-generated `r-…`) used as the prefix for cashier login codes.
- `Staff` cashiers use `loginCodeEnc` (AES-GCM, reversible for admin display) + `loginCodeLookupHash` (unique, for auth).
- Migration: `prisma/migrations/20260912120000_cashier_login_codes_and_slug/`
- Login UI: Restaurant (email/password) vs Cashier (single login-code field) on `/login`.
- Cashier post-login lands on `/pos` only; admin-only pages redirect cashiers to `/pos`.

## Cashiers (ADMIN)
- Sidebar group: Cashiers list (`/cashiers`), Add cashier (`/cashiers/new`), plus Open POS (`/pos`).
- APIs: `GET/POST /api/auth/cashiers`, `PATCH/DELETE /api/auth/cashiers/[id]` (DELETE soft-deactivates).
- List: server-side search/active filters via URL; copy login code; activate/deactivate icon actions.
- Add: name only → shows generated code with copy.

## POS
- Route `/pos` outside the admin `(app)` shell; gated by `requirePosAppUser` (ADMIN or CASHIER).
- Menu catalog: `GET /api/auth/pos/menu` (active categories/items).
- Checkout: `POST /api/auth/pos/checkout` → allocate invoice number, create invoice + lines, run ZATCA send, return Phase-2 QR.
- UI: category chips, item grid, cart qty controls, cash/card + tendered/change, receipt overlay with QR (no browser print — print bridge later).
- Menu item images served via `requirePosRestaurant` so cashiers can load thumbs.

## Notable decisions
- Login codes are immutable; deactivate + create new cashier instead of rotating codes.
- Checkout blocks receipt until ZATCA signing/reporting succeeds (rules.md #20).
- Money remains string-based via `invoice-compute-totals`.
- No inventory fields; no hard-delete of cashiers (invoice attribution).

## Key files
- `src/lib/auth/cashier-login-code.js`, `src/lib/staff/cashier-service.js`
- `src/lib/pos/checkout-pos-sale.js`
- `src/app/[locale]/(app)/cashiers/*`, `src/app/[locale]/pos/*`
- `src/app/api/auth/cashiers/*`, `cashier-login`, `pos/menu`, `pos/checkout`
- `messages/en.json`, `messages/ar.json`
