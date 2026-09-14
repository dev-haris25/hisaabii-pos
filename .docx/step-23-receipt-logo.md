# Step 23 — Restaurant logo on receipt print + previews

## Goal
Show the restaurant logo on printed receipts and both thermal previews when a logo is set; otherwise show the restaurant name.

## Behavior
- **Logo present:** print/preview header = logo only (no name text).
- **No logo (or logo print fails):** header = restaurant name (double-height on printer).
- VAT / CR lines still print under the header either way.

## Implementation
- `loadReceiptLogoPngBase64` — reads `public/…` logo, resizes, converts to PNG via `sharp` for ESC/POS.
- `restaurantLogoPreviewUrl` — authenticated `/api/auth/business-profiles/:id/logo` URL for UI.
- Print API attaches `logoPngBase64` to the bridge payload.
- Print bridge `layoutReceipt` is async; uses `printImageBuffer` when logo is present.
- `PosThermalReceiptPreview` accepts `logoUrl` and swaps name ↔ image.
- Wired from POS page (checkout modal) and invoice detail page.

## Files
- `src/lib/print/load-receipt-logo.js` (new)
- `src/lib/print/build-receipt-from-invoice.js`
- `src/app/api/auth/pos/print/route.js`
- `scripts/print-bridge-server.mjs`
- `src/components/invoices/pos-thermal-receipt-preview.jsx`
- `src/app/[locale]/pos/page.js`
- `src/app/[locale]/pos/pos-checkout-view.jsx`
- `src/app/[locale]/(app)/invoices/[id]/page.js`
- `src/app/[locale]/(app)/invoices/[id]/invoice-detail-view.jsx`
- `package.json` / lockfile (`sharp`)
