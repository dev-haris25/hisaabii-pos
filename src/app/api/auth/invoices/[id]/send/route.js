import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  canReportInvoiceToZatca,
  mapInvoiceDetailToJson,
} from '@/lib/invoices/map-invoice-json'
import {
  cashierWindowForbiddenResponse,
  requireInvoiceRestaurant,
} from '@/lib/auth/require-invoice-restaurant'
import { prisma } from '@/lib/prisma'
import { emitZatcaReportFailed } from '@/lib/notifications/emit-zatca-report-failed'
import { emitZatcaReportSuccess } from '@/lib/notifications/emit-zatca-report-success'
import { reportInvoiceToZatca } from '@/lib/zatca/report-invoice-to-zatca'
import { zatcaAttemptErrorSummary } from '@/lib/zatca/zatca-attempt-error-summary'

/**
 * Manual "Report to ZATCA" for pending/failed invoices (rules.md #19).
 * Reuses pre-signed hash/UUID when present (offline sales); otherwise signs.
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

    if (!canReportInvoiceToZatca(invoice.zatcaStatus)) {
      return jsonError(
        409,
        'NOT_APPLICABLE',
        'Invoice is already reported to ZATCA',
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
      await reportInvoiceToZatca({
        invoice,
        device,
        selectedEnvironment: profile?.zatcaEnvironment,
        withTransientRetry: false,
      })
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          zatcaReportAttempts: { increment: 1 },
          zatcaLastAttemptAt: new Date(),
          zatcaLastError: null,
        },
      })
      void emitZatcaReportSuccess({
        businessProfileId: auth.profileId,
        actorUserId: auth.session?.id,
        documentId: invoice.id,
        documentNumber: invoice.invoiceNumber,
      })
      const reported = await prisma.invoice.findFirst({
        where: { id: invoice.id, ...WHERE_NOT_DELETED },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
          createdByStaff: { select: { id: true, name: true } },
        },
      })
      if (!reported) {
        return jsonOk({ reported: true })
      }
      return jsonOk({
        reported: true,
        invoice: mapInvoiceDetailToJson(reported),
      })
    } catch (err) {
      const summary = zatcaAttemptErrorSummary(err)
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          zatcaStatus: 'failed',
          zatcaReportAttempts: { increment: 1 },
          zatcaLastAttemptAt: new Date(),
          zatcaLastError: summary,
        },
      })
      void emitZatcaReportFailed({
        businessProfileId: auth.profileId,
        actorUserId: auth.session?.id,
        documentKind: 'invoice',
        documentId: invoice.id,
        documentNumber: invoice.invoiceNumber,
      })
      console.error('[invoices/send] ZATCA_ERROR:', summary)
      return jsonError(502, 'ZATCA_ERROR', 'Could not report the invoice to ZATCA')
    }
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/invoices/[id]/send')
  }
}
