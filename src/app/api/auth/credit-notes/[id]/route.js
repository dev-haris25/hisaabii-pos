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
import { mapCreditNoteDetailToJson } from '@/lib/notes/map-note-json'
import { restaurantLogoPreviewUrl } from '@/lib/print/load-receipt-logo'
import {
  centsToMoney,
  moneyToCents,
} from '@/lib/invoices/invoice-compute-totals'
import { CLEARED_ZATCA_ARTIFACTS } from '@/lib/notes/repair-failed-document'
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

// Credit-note lines are locked (they carry invoice-line links and units
// covered): repair changes the reason only. Lines may be omitted or sent back
// unchanged; anything else is refused.
const repairBodySchema = z.object({
  reasonAr: z.string().trim().min(1).max(500),
  reasonEn: z.string().trim().max(500).optional().nullable(),
  lines: z.array(repairLineSchema).max(100).optional(),
})

/**
 * True when the requested lines are exactly the stored ones (same order,
 * names, quantities, unit prices and VAT presets).
 *
 * @param {Array<{ nameAr: string, nameEn?: string | null, quantity: number, unitPrice: string, vatPreset: string }>} requested
 * @param {Array<{ nameAr: string, nameEn: string | null, quantity: number, unitPrice: string, vatPreset: string }>} stored
 */
function sameNoteLines(requested, stored) {
  if (requested.length !== stored.length) return false
  return requested.every((r, i) => {
    const s = stored[i]
    return (
      r.nameAr.trim() === s.nameAr.trim() &&
      (r.nameEn?.trim() || null) === (s.nameEn?.trim() || null) &&
      r.quantity === s.quantity &&
      centsToMoney(moneyToCents(r.unitPrice)) === centsToMoney(moneyToCents(s.unitPrice)) &&
      r.vatPreset === s.vatPreset
    )
  })
}

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

    let updated
    try {
      updated = await prisma.$transaction(async (tx) => {
        if (!(await lockUnsignedDocumentForRepair(tx, 'credit', id))) {
          throw Object.assign(new Error('Document was signed meanwhile'), {
            code: 'NOT_EDITABLE',
          })
        }
        if (parsed.data.lines) {
          const stored = await tx.creditNoteLine.findMany({
            where: { creditNoteId: id },
            orderBy: { sortOrder: 'asc' },
          })
          if (!sameNoteLines(parsed.data.lines, stored)) {
            throw Object.assign(
              new Error('Credit note lines cannot be changed. Delete the note and correct the invoice again.'),
              { code: 'CREDIT_NOTE_LINES_LOCKED' },
            )
          }
        }
        // Reason only: lines, invoice-line links, units covered and amounts
        // stay as they are; the note goes back to pending for a new report.
        return tx.creditNote.update({
          where: { id },
          data: {
            reasonAr: parsed.data.reasonAr.trim(),
            reasonEn: parsed.data.reasonEn?.trim() || null,
            ...CLEARED_ZATCA_ARTIFACTS,
          },
          include: {
            lines: { orderBy: { sortOrder: 'asc' } },
            createdByStaff: { select: { id: true, name: true } },
          },
        })
      }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      if (code === 'CREDIT_NOTE_LINES_LOCKED') {
        return jsonError(409, code, e instanceof Error ? e.message : code)
      }
      throw e
    }

    return jsonOk({ note: mapCreditNoteDetailToJson(updated) })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/credit-notes/[id]')
  }
}
