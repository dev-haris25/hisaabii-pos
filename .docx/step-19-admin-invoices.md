# Step 19 — Admin Invoices list + detail

## Summary
ADMIN-only **Invoices** area (sidebar) to browse all POS sales, open detail, re-report failed/pending invoices to ZATCA, and print via the print bridge when a Phase-2 QR exists.

## Behavior
- **List** (`/invoices`): server-side search (invoice # / cashier), ZATCA status filter, payment filter, pagination (URL query params — rules.md #3)
- **Detail** (`/invoices/[id]`): `PageBackButton`, seller snapshot, lines, totals, QR, humanized ZATCA error if failed
- **Report to ZATCA**: visible on list + detail for `pending` / `failed` / null (rules.md #19); uses `runInvoiceZatcaSend`
- **Print**: detail only when QR present → existing `POST /api/auth/pos/print`
- **Roles**: ADMIN only via `(app)` layout + `requireAdminRestaurant` on send API; cashiers cannot open `/invoices`

## Key files
- `src/app/[locale]/(app)/invoices/page.js`
- `src/app/[locale]/(app)/invoices/invoices-list-view.jsx`
- `src/app/[locale]/(app)/invoices/[id]/page.js`
- `src/app/[locale]/(app)/invoices/[id]/invoice-detail-view.jsx`
- `src/app/api/auth/invoices/[id]/send/route.js`
- `src/lib/invoices/map-invoice-json.js`
- `src/components/invoices/zatca-status-badge.jsx`
- `src/components/app-shell/admin-app-shell.jsx` (nav)
- `messages/en.json`, `messages/ar.json`

## Out of scope (vs Hisabi)
No B2B drafts, clients, CN/DN, email-to-client, or multi-company.
