import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  cashierWindowForbiddenResponse,
  requireInvoiceRestaurant,
} from '@/lib/auth/require-invoice-restaurant'
import {
  canRepairFailedNote,
  canSoftDeleteNote,
} from '@/lib/notes/can-repair-failed-note'
import {
  assertCreditWithinBalance,
  noteTaxableCents,
} from '@/lib/notes/invoice-outstanding'
import {
  loadInvoiceOutstanding,
  lockInvoiceRow,
} from '@/lib/notes/load-invoice-outstanding'
import { mapCreditNoteDetailToJson } from '@/lib/notes/map-note-json'
import { restaurantLogoPreviewUrl } from '@/lib/print/load-receipt-logo'
import {
  buildRepairedDocumentLines,
  CLEARED_ZATCA_ARTIFACTS,
} from '@/lib/notes/repair-failed-document'
import { prisma } from '@/lib/prisma'
import { lockUnsignedDocumentForRepair } from '@/lib/zatca/zatca-document-chain'

const repairLineSchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  quantity: z.number().int().min(0).max(999),
  unitPrice: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,4})?$/),
  vatPreset: z.enum(['standard', 'zero', 'exempt']),
})

const repairBodySchema = z.object({
  reasonAr: z.string().trim().min(1).max(500),
  reasonEn: z.string().trim().max(500).optional().nullable(),
  lines: z.array(repairLineSchema).min(1).max(100),
})

export async function GET(_request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error
    const { id } = await context.params
    const note = await prisma.creditNote.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        createdByStaff: { select: { id: true, name: true } },
      },
    })
    if (!note) return jsonError(404, 'NOT_FOUND', 'Note not found')
    const windowErr = cashierWindowForbiddenResponse(auth.isCashier, note.noteDate)
    if (windowErr) return windowErr
    const profile = await prisma.businessProfile.findUnique({
      where: { id: auth.profileId },
      select: { id: true, logoStoragePath: true, updatedAt: true },
    })
    return jsonOk({
      note: mapCreditNoteDetailToJson(note),
      logoUrl: restaurantLogoPreviewUrl(profile),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/credit-notes/[id]')
  }
}

export async function DELETE(_request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Credit note id required')
    }

    const note = await prisma.creditNote.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
    })
    if (!note) {
      return jsonError(404, 'NOT_FOUND', 'Credit note not found')
    }
    const windowErr = cashierWindowForbiddenResponse(
      auth.isCashier,
      note.noteDate,
    )
    if (windowErr) return windowErr

    if (!canSoftDeleteNote(note)) {
      return jsonError(
        409,
        'NOT_DELETABLE',
        'Only failed credit notes can be deleted',
      )
    }

    await prisma.creditNote.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return jsonOk({ deleted: true })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/credit-notes/[id]')
  }
}

export async function PATCH(request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Credit note id required')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = repairBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const note = await prisma.creditNote.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
    })
    if (!note) {
      return jsonError(404, 'NOT_FOUND', 'Credit note not found')
    }
    const windowErr = cashierWindowForbiddenResponse(
      auth.isCashier,
      note.noteDate,
    )
    if (windowErr) return windowErr

    if (!canRepairFailedNote(note)) {
      return jsonError(
        409,
        'NOT_EDITABLE',
        'Only failed credit notes can be edited',
      )
    }

    let built
    try {
      built = buildRepairedDocumentLines(parsed.data.lines, { kind: 'note' })
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String(e.code) : 'VALIDATION_ERROR'
      return jsonError(
        400,
        code,
        e instanceof Error ? e.message : 'Invalid lines',
      )
    }

    let updated
    try {
      updated = await prisma.$transaction(async (tx) => {
        // Lock the invoice first (same order as note creation), then the note.
        let invoice = null
        if (
          note.invoiceId &&
          (await lockInvoiceRow(tx, note.invoiceId, auth.profileId))
        ) {
          invoice = await tx.invoice.findFirst({
            where: { id: note.invoiceId, businessProfileId: auth.profileId },
            include: { lines: true },
          })
        }
        if (!(await lockUnsignedDocumentForRepair(tx, 'credit', id))) {
          throw Object.assign(new Error('Document was signed meanwhile'), {
            code: 'NOT_EDITABLE',
          })
        }
        if (invoice) {
          // Cap (before VAT): this note's new amount replaces its old one.
          const outstanding = await loadInvoiceOutstanding(tx, invoice)
          const oldLines = await tx.creditNoteLine.findMany({
            where: { creditNoteId: id },
          })
          assertCreditWithinBalance(
            outstanding,
            noteTaxableCents(parsed.data.lines.filter((l) => l.quantity > 0)),
            noteTaxableCents(oldLines),
          )
        }
        await tx.creditNoteLine.deleteMany({ where: { creditNoteId: id } })
        return tx.creditNote.update({
          where: { id },
          data: {
            reasonAr: parsed.data.reasonAr.trim(),
            reasonEn: parsed.data.reasonEn?.trim() || null,
            ...built.totals,
            ...CLEARED_ZATCA_ARTIFACTS,
            lines: { create: built.lineCreates },
          },
          include: {
            lines: { orderBy: { sortOrder: 'asc' } },
            createdByStaff: { select: { id: true, name: true } },
          },
        })
      }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      if (code === 'CREDIT_EXCEEDS_INVOICE_BALANCE') {
        return jsonError(409, code, e instanceof Error ? e.message : code)
      }
      throw e
    }

    return jsonOk({ note: mapCreditNoteDetailToJson(updated) })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/credit-notes/[id]')
  }
}
