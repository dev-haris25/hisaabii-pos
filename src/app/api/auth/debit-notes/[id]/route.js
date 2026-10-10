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
import { mapDebitNoteDetailToJson } from '@/lib/notes/map-note-json'
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
    const note = await prisma.debitNote.findFirst({
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
      note: mapDebitNoteDetailToJson(note),
      logoUrl: restaurantLogoPreviewUrl(profile),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/debit-notes/[id]')
  }
}

export async function DELETE(_request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Debit note id required')
    }

    const note = await prisma.debitNote.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
    })
    if (!note) {
      return jsonError(404, 'NOT_FOUND', 'Debit note not found')
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
        'Only failed debit notes can be deleted',
      )
    }

    await prisma.debitNote.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return jsonOk({ deleted: true })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/debit-notes/[id]')
  }
}

export async function PATCH(request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Debit note id required')
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

    const note = await prisma.debitNote.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
    })
    if (!note) {
      return jsonError(404, 'NOT_FOUND', 'Debit note not found')
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
        'Only failed debit notes can be edited',
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

    const updated = await prisma.$transaction(async (tx) => {
      if (!(await lockUnsignedDocumentForRepair(tx, 'debit', id))) {
        throw Object.assign(new Error('Document was signed meanwhile'), {
          code: 'NOT_EDITABLE',
        })
      }
      await tx.debitNoteLine.deleteMany({ where: { debitNoteId: id } })
      return tx.debitNote.update({
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

    return jsonOk({ note: mapDebitNoteDetailToJson(updated) })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/debit-notes/[id]')
  }
}
