# Step 26 — Credit Note / Debit Note system (ZATCA Phase 2)

## What was built

Full ZATCA-compliant Credit Note (`381`) / Debit Note (`383`) support for correcting or cancelling reported simplified invoices without mutating the original `Invoice` row.

### Data model
- Added `CreditNote`, `CreditNoteLine`, `CreditNoteCounter`, `DebitNote`, `DebitNoteLine`, `DebitNoteCounter`
- Notes link to `Invoice` via nullable `invoiceId` (`onDelete: SetNull`) plus snapshots (`invoiceNumberSnapshot`, `invoiceUuidSnapshot`, `invoiceIssueDateSnapshot`)
- `reasonAr` (required, sent to ZATCA as KSA-10) + optional `reasonEn` (display only)
- Shared PIH chain via existing `ZatcaDevice.lastInvoiceHash` / `invoiceCounter`
- Migration: `prisma/migrations/20260912193509_add_credit_debit_notes`

### ZATCA pipeline
- Shared helpers extracted to `src/lib/zatca/zatca-document-shared.js`
- `map-note-to-zatca.js` + `submit-note-to-zatca.js` using package `generateCreditNoteXml` (native BillingReference / InstructionNote)
- Immediate sign+report at note creation (same pattern as checkout), with manual retry send routes

### Business flows
- **Edit** (`POST /api/auth/invoices/[id]/edit`): builds one credit or debit note from line deltas; blocks zero-delta and mixed-direction edits; shows print modal for the new note only
- **Cancel** (`POST /api/auth/invoices/[id]/cancel`): full-reversal credit note with fixed Arabic reason `تم إلغاء الفاتورة`; voids invoice after successful report; no forced print

### UI
- Edit/Cancel icon actions on invoices list + detail (only when ZATCA reported/cleared and not voided)
- Invoice detail: 2-column grid of linked note previews with dedicated print/report
- Standalone Credit Notes / Debit Notes list + detail under Invoices nav group
- Extended thermal preview + print bridge for note label / ref invoice / reason

### Notable decisions
- Original invoice is never edited after issuance
- Arabic reason is legally authoritative for ZATCA XML; English is UI-only
- One note per edit action (not both credit and debit in one save)
- `@talha7k/zatca` `generateCreditNoteXml` used instead of Hisabi’s XML string patch

## Files touched (high level)
- `prisma/schema.prisma` + migration
- `src/lib/notes/*`, `src/lib/zatca/map-note-to-zatca.js`, `submit-note-to-zatca.js`, `run-note-zatca-send.js`, …
- API: `invoices/[id]/edit`, `invoices/[id]/cancel`, `credit-notes/[id]/send`, `debit-notes/[id]/send`, extended `pos/print`
- UI under `src/app/[locale]/(app)/invoices/**`, `src/components/notes/**`, AppShell nav
- `messages/en.json`, `messages/ar.json`
- `scripts/print-bridge-server.mjs`, `PosThermalReceiptPreview`
