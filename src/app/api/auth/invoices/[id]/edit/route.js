import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  cashierWindowForbiddenResponse,
  requireInvoiceRestaurant,
} from '@/lib/auth/require-invoice-restaurant'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { createNoteFromInvoiceEdit } from '@/lib/notes/create-note-from-invoice-edit'
import { refreshKitchenOrderAfterEdit } from '@/lib/orders/sync-kitchen-order'
import {
  mapCreditNoteDetailToJson,
  mapDebitNoteDetailToJson,
} from '@/lib/notes/map-note-json'
import { prisma } from '@/lib/prisma'

const editLineSchema = z.object({
  invoiceLineId: z.string().trim().min(1).optional().nullable(),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  quantity: z.number().int().min(0).max(999),
  unitPrice: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,4})?$/),
  vatPreset: z.enum(['standard', 'zero', 'exempt']),
})

const editBodySchema = z.object({
  reasonAr: z.string().trim().min(1).max(500),
  reasonEn: z.string().trim().max(500).optional().nullable(),
  lines: z.array(editLineSchema).min(1).max(100),
})

/**
 * Edit a reported invoice by creating a credit or debit note (never mutates Invoice).
 */
export async function POST(request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Invoice id required')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = editBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    // Drop zero-qty lines (treated as removals via matching).
    const editedLines = parsed.data.lines.filter((l) => l.quantity > 0)
    if (editedLines.length === 0) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        'At least one line with quantity > 0 is required',
      )
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!invoice) {
      return jsonError(404, 'NOT_FOUND', 'Invoice not found')
    }
    const windowErr = cashierWindowForbiddenResponse(
      auth.isCashier,
      invoice.invoiceDate,
    )
    if (windowErr) return windowErr


    const profile = await prisma.businessProfile.findUnique({
      where: { id: auth.profileId },
    })
    const device = await prisma.zatcaDevice.findUnique({
      where: { businessProfileId: auth.profileId },
    })
    if (!profile || !device?.productionCsid) {
      return jsonError(
        403,
        'ZATCA_NOT_ONBOARDED',
        'Complete ZATCA onboarding first',
      )
    }

    try {
      const { note, documentNature } = await createNoteFromInvoiceEdit({
        profile,
        device,
        invoice,
        staffId: auth.session.id,
        reasonAr: parsed.data.reasonAr,
        reasonEn: parsed.data.reasonEn,
        editedLines,
      })
      await refreshKitchenOrderAfterEdit(prisma, invoice.id, editedLines)

      const mapped =
        documentNature === 'credit'
          ? mapCreditNoteDetailToJson(note)
          : mapDebitNoteDetailToJson(note)

      return jsonOk({
        documentNature,
        note: mapped,
      })
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String(err.code)
          : ''
      if (
        code === 'EDIT_NO_CHANGE' ||
        code === 'EDIT_MIXED_CHANGES' ||
        code === 'INVOICE_VOIDED' ||
        code === 'INVOICE_NOT_REPORTED' ||
        code === 'NOTE_REASON_REQUIRED' ||
        code === 'NOTE_AMOUNT_INVALID' ||
        code === 'VALIDATION_ERROR'
      ) {
        return jsonError(409, code, err instanceof Error ? err.message : code)
      }
      if (code === 'ZATCA_ERROR') {
        const noteId =
          err && typeof err === 'object' && 'noteId' in err
            ? String(err.noteId)
            : null
        const documentNature =
          err && typeof err === 'object' && 'documentNature' in err
            ? String(err.documentNature)
            : null
        return jsonError(502, 'ZATCA_ERROR', 'Could not report the note to ZATCA', {
          noteId,
          documentNature,
        })
      }
      throw err
    }
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/invoices/[id]/edit')
  }
}
