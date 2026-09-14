# Step 27 — Failed invoice/note edit + soft delete

## What

Failed (`zatcaStatus === 'failed'`) invoices and credit/debit notes can be:

1. **Edited in place** (repair lines / reason, clear ZATCA artifacts → `pending`, then Report)
2. **Soft-deleted** via `deletedAt` (hidden from all lists/detail; document numbers stay reserved)

Reported/cleared invoices keep the existing credit/debit-note correction and cancel flows.

## Schema

- `deletedAt DateTime?` on `Invoice`, `CreditNote`, `DebitNote`
- Indexes on `[businessProfileId, deletedAt]`
- Migration: `20260912202037_add_invoice_note_soft_delete`

## Backend

- `WHERE_NOT_DELETED` in `src/lib/db/soft-delete-scope.js`
- Capability helpers: `canRepairFailedInvoice` / `canSoftDeleteInvoice`, `canRepairFailedNote` / `canSoftDeleteNote`
- `DELETE` + `PATCH` on `/api/auth/invoices/[id]`, `/credit-notes/[id]`, `/debit-notes/[id]`
- Shared line rebuild: `src/lib/notes/repair-failed-document.js`
- All list/detail/send/print/edit/cancel reads scoped with `deletedAt: null`

## UI

- Invoice list/detail: Edit + Delete for failed; Report unchanged
- Invoice edit page: `mode: 'repair' | 'correction'`
- Credit/debit list/detail: Edit + Delete for failed
- Edit pages: `/invoices/credit-notes/[id]/edit`, `/invoices/debit-notes/[id]/edit`
- Confirm modal: `SoftDeleteConfirmModal`

## Notes

- Soft delete does not rewind invoice/note counters or ZATCA hash chain
- Pending documents remain Report-only (not editable/deletable in this step)
