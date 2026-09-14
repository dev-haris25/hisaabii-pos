# Step 4 — Copy and adapt ZATCA lib from Hisabi

**Date:** 2026-09-12  
**Project:** hisabi-pos

## What was built

Adapted Hisabi’s ZATCA library into `hisabi-pos` for **Simplified (B2C) reporting only** — no Standard/B2B clearance, no credit/debit notes, no OCR/QR decode, no Phase-1 draft QR, no journal-entry posting.

## Files added / adapted

### Near-verbatim (`src/lib/zatca/`)
- `env.js` — EGS vendor label set to `1-HisabiPOS|2-WebApp|…`
- `postal-address-from-fields.js`
- `seller-party-validate.js`
- `compliance-csid.js`
- `compliance-check.js` (kept all 6 sandbox compliance checks for Production CSID)
- `onboard.js`
- `key-cert-match.js`
- `assert-signing-certificate.js`
- `certificate-vat.js`
- `errors.js`
- `submit-errors.js`
- `submission-readiness.js`
- `fatoora-portal.js`
- `invalidate-zatca-onboarding.js`
- `humanize-zatca-error.js`
- `secrets.js` (already present from Step 3)

### Helpers
- `src/lib/invoices/extract-qr-from-xml.js`
- `src/lib/db/prisma-interactive-transaction-options.js`

### Simplified rewrites
- `src/lib/zatca/map-invoice-to-zatca.js` — always `profileId: reporting:1.0`, `invoiceTypeCodeName: 0200000`, no customer block, no custom VAT
- `src/lib/zatca/submit-invoice.js` — always `submitForReporting`; Standard/sandbox-standard paths removed
- `src/lib/zatca/assert-zatca-submit-ready.js` — seller + line-name validation only
- `src/lib/zatca/run-invoice-zatca-send.js` — no journal entry; never updates `Invoice.status`; always `zatcaStatus: reported`
- `src/lib/invoices/invoice-compute-totals.js` — standard|zero|exempt only; no `invoiceTypeFromGrandTotal`
- `src/lib/invoices/invoice-validate.js` — line-name validation only

## Not copied (out of scope)
- `sandbox-invoice-xml.js`, credit/debit note modules, `decode-qr`/`decode-tlv`, Phase-1 QR, mobile send-job DTO

## Notable decisions
1. CSR `invoiceType: 1100` still runs all six compliance categories so Production CSID exchange works, even though live invoices are Simplified-only.
2. `Invoice.status` (`completed|voided`) stays independent of ZATCA; only `zatcaStatus` / QR / XML / hash-chain fields are updated on report success.
3. Package used: `@talha7k/zatca` (already in package.json).

## Verification
- All new modules import cleanly under Bun.
- Fixture smoke script exercised map/totals/address/humanize/XML generation (then deleted per rules.md #9).
- `bunx eslint .` exited 0.
