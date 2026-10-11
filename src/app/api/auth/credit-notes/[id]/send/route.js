import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  cashierWindowForbiddenResponse,
  requireInvoiceRestaurant,
} from '@/lib/auth/require-invoice-restaurant'
import { canReportNoteToZatca } from '@/lib/notes/map-note-json'
import { voidInvoiceIfFullyCredited } from '@/lib/notes/void-invoice'
import { prisma } from '@/lib/prisma'
import { emitZatcaReportFailed } from '@/lib/notifications/emit-zatca-report-failed'
import { reportDocumentToZatca } from '@/lib/zatca/zatca-document-chain'

/**
 * Manual "Report to ZATCA" for pending/failed credit notes. Once accepted, the
 * invoice is voided if nothing is left outstanding (e.g. a cancellation note
 * that failed at first) — the void runs once only.
 */
export async function POST(_request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Credit note id required')
    }

    const note = await prisma.creditNote.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!note) {
      return jsonError(404, 'NOT_FOUND', 'Credit note not found')
    }
    const windowErr = cashierWindowForbiddenResponse(
      auth.isCashier,
      note.noteDate,
    )
    if (windowErr) return windowErr

    if (!canReportNoteToZatca(note.zatcaStatus)) {
      return jsonError(
        409,
        'NOT_APPLICABLE',
        'Credit note is already reported to ZATCA',
      )
    }

    const device = await prisma.zatcaDevice.findUnique({
      where: { businessProfileId: auth.profileId },
      select: { productionCsid: true },
    })
    if (!device?.productionCsid) {
      return jsonError(
        403,
        'ZATCA_NOT_ONBOARDED',
        'Complete ZATCA onboarding first',
      )
    }

    try {
      await reportDocumentToZatca({
        kind: 'credit',
        id: note.id,
        businessProfileId: auth.profileId,
      })
    } catch {
      void emitZatcaReportFailed({
        businessProfileId: auth.profileId,
        actorUserId: auth.session?.id,
        documentKind: 'credit',
        documentId: note.id,
        documentNumber: note.creditNoteNumber,
      })
      return jsonError(502, 'ZATCA_ERROR', 'Could not report the note to ZATCA')
    }

    if (note.invoiceId) {
      await voidInvoiceIfFullyCredited({
        invoiceId: note.invoiceId,
        businessProfileId: auth.profileId,
        actorUserId: auth.session?.id ?? null,
      })
    }
    return jsonOk({ reported: true })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/credit-notes/[id]/send')
  }
}
