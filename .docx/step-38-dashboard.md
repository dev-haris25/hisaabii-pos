# Step 38 — Restaurant POS dashboard

## Summary

Replaced the placeholder home page with a role-aware restaurant dashboard (Hisabi design system + recharts), and ensured cashiers never land on `/`.

## Features

- Today KPIs: sales, orders, average ticket, cash, card (+ vs yesterday %)
- Attention chips: ZATCA failed/pending, visas expiring, outstanding advances
- 7-day sales area chart + category mix pie
- Top sellers today + cashier ranking (bar) / VAT panel for accountant
- Recent sales table
- Quick actions
- HR lean KPIs when variant is `hr`

## Role behavior

| Role | Dashboard |
|------|-----------|
| Owner / Admin / Manager | `full` |
| Accountant | `accountant` (sales + VAT focus, no cashier chart) |
| HR | `hr` lean (visas / advances / payroll) — gained `Dashboard` read |
| Cashier | No `Dashboard`; `/` redirects to first accessible route (`/pos`) |

## Key files

- `src/lib/dashboard/query-pos-dashboard.js`
- `src/app/api/auth/dashboard/route.js`
- `src/app/[locale]/(app)/dashboard-client.jsx`
- `src/app/[locale]/(app)/page.js` (CASL redirect)
- RBAC: HR seed + `/dashboard` API permission
- `recharts` dependency
- i18n `Dashboard` namespace (en/ar)

## Notes

- Server filters payload by ability (sales vs HR sections).
- Chart colors match design tokens via constants (recharts fill/stroke props).
