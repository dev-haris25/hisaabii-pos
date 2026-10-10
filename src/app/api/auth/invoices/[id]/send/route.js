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
import { reportDocumentToZatca } from '@/lib/zatca/zatca-document-chain'

/**
 * Manual "Report to ZATCA" for pending/failed invoices (rules.md #19).
 * Resends the stored signed document when present (same UUID/hash, rules §18);
 * only an invoice that was never signed gets signed into the chain here.
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
        kind: 'invoice',
        id: invoice.id,
        businessProfileId: auth.profileId,
      })
    } catch (err) {
      void emitZatcaReportFailed({
        businessProfileId: auth.profileId,
        actorUserId: auth.session?.id,
        documentKind: 'invoice',
        documentId: invoice.id,
        documentNumber: invoice.invoiceNumber,
      })
      return jsonError(502, 'ZATCA_ERROR', 'Could not report the invoice to ZATCA')
    }

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
    return handleRouteError(err, 'POST /api/auth/invoices/[id]/send')
  }
}
