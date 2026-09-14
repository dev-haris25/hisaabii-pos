# Step 20 — Invoices list view styling parity

## Goal
Match the Invoices list layout/colors to Menu, Cashiers, and Hisabi list views.

## Changes
- Wrapped toolbar + table + pagination in the shared white card (`rounded-xl border … bg-white shadow-sm`).
- Moved ZATCA status into header filter pills (same pattern as active/inactive on cashiers/menu).
- Payment filter stays in the table toolbar select.
- Sticky first column for invoice #; shared `listTable*` classes; pagination footer inside the card (menu style).
- `ZatcaStatusBadge` tones aligned with Hisabi: teal (reported/cleared), red (failed), slate (pending).
- i18n keys for loading/showing/range/pagination labels updated in `en.json` / `ar.json`.

## Files
- `src/app/[locale]/(app)/invoices/invoices-list-view.jsx`
- `src/components/invoices/zatca-status-badge.jsx`
- `messages/en.json`, `messages/ar.json`
