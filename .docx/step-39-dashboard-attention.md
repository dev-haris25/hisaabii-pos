# Step 39 — Dashboard Attention block always visible

## Problem

Attention / alerts (ZATCA failed, ZATCA pending, visas expiring, outstanding advances) were implemented but only rendered when a count was `> 0`, so the section looked missing on a clean restaurant.

## Fix

- Always show an **Attention** section under the hero for roles that can act on those items.
- Four linked cards with count/amount, tone (danger / warn / info / ok), and deep links:
  - ZATCA failed → `/reports/zatca-status`
  - ZATCA pending → `/reports/zatca-status`
  - Visas expiring → `/hr/visa-status`
  - Outstanding advances → `/reports/advances`
- API payload initializes `alerts` with zeros so the UI always has numbers.
- HR attention cards only for `full` / `hr` variants (not accountant-only).

## Files

- `src/app/[locale]/(app)/dashboard-client.jsx`
- `src/lib/dashboard/query-pos-dashboard.js`
- `messages/en.json`, `messages/ar.json`
