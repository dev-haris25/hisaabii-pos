import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  cashierWindowForbiddenResponse,
  requireInvoiceRestaurant,
} from '@/lib/auth/require-invoice-restaurant'
import { createCancellationNote } from '@/lib/notes/create-cancellation-note'
import { mapCreditNoteDetailToJson } from '@/lib/notes/map-note-json'
import { prisma } from '@/lib/prisma'

/**
 * Cancel a reported invoice: one credit note for everything still outstanding
 * (reason prefilled server-side). The invoice is voided once ZATCA accepts it.
 */
export async function POST(_request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Invoice id required')
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
      const { note, documentNature } = await createCancellationNote({
        profileId: auth.profileId,
        invoiceId: invoice.id,
        staffId: auth.session.id,
      })
      return jsonOk({
        documentNature,
        note: mapCreditNoteDetailToJson(note),
      })
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String(err.code)
          : ''
      if (
        code === 'INVOICE_VOIDED' ||
        code === 'INVOICE_NOT_REPORTED' ||
        code === 'VALIDATION_ERROR' ||
        code === 'NOTE_AMOUNT_INVALID' ||
        code === 'NOTE_PENDING_FOR_INVOICE' ||
        code === 'CREDIT_EXCEEDS_INVOICE_BALANCE'
      ) {
        return jsonError(409, code, err instanceof Error ? err.message : code)
      }
      if (code === 'NOT_FOUND') {
        return jsonError(404, 'NOT_FOUND', 'Invoice not found')
      }
      if (code === 'ZATCA_ERROR') {
        const noteId =
          err && typeof err === 'object' && 'noteId' in err
            ? String(err.noteId)
            : null
        const raw = err instanceof Error ? err.message : 'ZATCA_ERROR'
        console.error('[invoices/cancel] ZATCA_ERROR:', raw, { noteId })
        return jsonError(
          502,
          'ZATCA_ERROR',
          'Could not report the cancellation credit note to ZATCA. Open Credit Notes to retry reporting.',
          { noteId, documentNature: 'credit' },
        )
      }
      throw err
    }
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/invoices/[id]/cancel')
  }
}
