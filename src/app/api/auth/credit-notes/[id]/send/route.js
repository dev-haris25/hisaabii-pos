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
import { humanizeZatcaError } from '@/lib/zatca/humanize-zatca-error'
import { runNoteZatcaSend } from '@/lib/zatca/run-note-zatca-send'

/**
 * Manual "Report to ZATCA" for pending/failed credit notes.
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

    const profile = await prisma.businessProfile.findUnique({
      where: { id: auth.profileId },
      select: { zatcaEnvironment: true },
    })
    const device = await prisma.zatcaDevice.findUnique({
      where: { businessProfileId: auth.profileId },
    })
    if (!device?.productionCsid) {
      return jsonError(
        403,
        'ZATCA_NOT_ONBOARDED',
        'Complete ZATCA onboarding first',
      )
    }

    try {
      await runNoteZatcaSend({
        note,
        device,
        documentNature: 'credit',
        selectedEnvironment: profile?.zatcaEnvironment,
      })
      await prisma.creditNote.update({
        where: { id: note.id },
        data: {
          zatcaReportAttempts: { increment: 1 },
          zatcaLastAttemptAt: new Date(),
          zatcaLastError: null,
        },
      })
      return jsonOk({ reported: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const humanized = humanizeZatcaError(msg)
      const first = humanized.issues?.[0]
      const summary = first?.message
        ? [first.title, first.message, first.actionHint]
            .filter(Boolean)
            .join(' — ')
        : msg
      await prisma.creditNote.update({
        where: { id: note.id },
        data: {
          zatcaStatus: 'failed',
          zatcaReportAttempts: { increment: 1 },
          zatcaLastAttemptAt: new Date(),
          zatcaLastError: summary.slice(0, 1000),
        },
      })
      void emitZatcaReportFailed({
        businessProfileId: auth.profileId,
        actorUserId: auth.session?.id,
        documentKind: 'credit',
        documentId: note.id,
        documentNumber: note.creditNoteNumber,
      })
      console.error('[credit-notes/send] ZATCA_ERROR:', msg)
      return jsonError(502, 'ZATCA_ERROR', 'Could not report the note to ZATCA')
    }
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/credit-notes/[id]/send')
  }
}
