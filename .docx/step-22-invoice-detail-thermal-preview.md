# Step 22 — Invoice detail thermal receipt preview

## Goal
Show the same printable receipt on the invoice detail page as the post-checkout modal.

## Changes
- Extracted shared `PosThermalReceiptPreview` (thermal layout matching print-bridge / checkout modal).
- Invoice detail page now renders that preview instead of the previous document-style layout.
- Checkout success modal uses the same component (one source of truth).
- Added `Invoices.receiptPreviewHint` (en/ar).

## Files
- `src/components/invoices/pos-thermal-receipt-preview.jsx` (new)
- `src/app/[locale]/(app)/invoices/[id]/invoice-detail-view.jsx`
- `src/app/[locale]/pos/pos-checkout-view.jsx`
- `messages/en.json`, `messages/ar.json`
