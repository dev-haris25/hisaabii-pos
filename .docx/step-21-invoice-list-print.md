# Step 21 — Invoice list print action

## Goal
Add a print icon on the invoices list that uses the same checkout print path (`POST /api/auth/pos/print`).

## Changes
- Print `ActionIconButton` on each row in `invoices-list-view.jsx`
- Calls `authPost('/pos/print', { invoiceId })` (same as POS checkout + invoice detail)
- Disabled when `hasQr` is false (ZATCA QR required); tooltip shows `printBlockedNoQr`
- Success toasts match checkout (`printSuccess` / `printDryRunSuccess`)

## Files
- `src/app/[locale]/(app)/invoices/invoices-list-view.jsx`
