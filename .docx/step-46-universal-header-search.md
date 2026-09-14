# Step 46 — Universal header search

## Goal

Hisabi-parity global search in the admin header: desktop inline bar + mobile full-screen sheet, RBAC-filtered results, debounced API.

## Entities (≤5 each)

| Group | Model | Match | href |
|-------|--------|-------|------|
| Menu items | MenuItem | nameAr, nameEn | `/menu/items/:id/edit` |
| Categories | MenuCategory | nameAr, nameEn | `/menu/categories` |
| Invoices | Invoice | invoiceNumber, notes | `/invoices/:id` |
| Credit notes | CreditNote | number, invoice snapshot, reason | `/invoices/credit-notes/:id` |
| Debit notes | DebitNote | number, invoice snapshot, reason | `/invoices/debit-notes/:id` |
| Employees | Employee | name, email, mobile, idNumber | `/hr/employees/:id` |

No SKU on MenuItem (schema). Invoices are B2C — no buyer fields; subtitle uses total + payment method.

## Files

- `src/components/app-shell/global-search.jsx`
- `src/lib/global-search-client.js`
- `src/lib/global-search-service.js`
- `src/app/api/auth/search/route.js`
- `src/components/app-shell/admin-app-shell.jsx` (desktop + mobile host)
- `messages/en.json`, `messages/ar.json` (`AppShell.search*`)

CSS tokens/classes already present in `hisabi-design-system.css`.
