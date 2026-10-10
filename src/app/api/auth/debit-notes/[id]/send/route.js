import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  cashierWindowForbiddenResponse,
  requireInvoiceRestaurant,
} from '@/lib/auth/require-invoice-restaurant'
import { canReportNoteToZatca } from '@/lib/notes/map-note-json'
import { prisma } from '@/lib/prisma'
import { emitZatcaReportFailed } from '@/lib/notifications/emit-zatca-report-failed'
import { reportDocumentToZatca } from '@/lib/zatca/zatca-document-chain'

/**
 * Manual "Report to ZATCA" for pending/failed debit notes.
 */
export async function POST(_request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Debit note id required')
    }

    const note = await prisma.debitNote.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!note) {
      return jsonError(404, 'NOT_FOUND', 'Debit note not found')
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
        'Debit note is already reported to ZATCA',
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
        kind: 'debit',
        id: note.id,
        businessProfileId: auth.profileId,
      })
      return jsonOk({ reported: true })
    } catch {
      void emitZatcaReportFailed({
        businessProfileId: auth.profileId,
        actorUserId: auth.session?.id,
        documentKind: 'debit',
        documentId: note.id,
        documentNumber: note.debitNoteNumber,
      })
      return jsonError(502, 'ZATCA_ERROR', 'Could not report the note to ZATCA')
    }
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/debit-notes/[id]/send')
  }
}
