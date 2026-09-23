import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { emitZatcaReportFailed } from '@/lib/notifications/emit-zatca-report-failed'
import { emitZatcaReportStillFailed } from '@/lib/notifications/emit-zatca-report-still-failed'
import { emitZatcaReportSuccess } from '@/lib/notifications/emit-zatca-report-success'
import { prisma } from '@/lib/prisma'
import { reportInvoiceToZatca } from '@/lib/zatca/report-invoice-to-zatca'
import {
  ZATCA_BACKGROUND_BATCH_PER_BUSINESS,
  ZATCA_BACKGROUND_MAX_BUSINESSES,
  ZATCA_DEADLINE_RETRY_MS,
} from '@/lib/zatca/zatca-background-constants'
import { zatcaAttemptErrorSummary } from '@/lib/zatca/zatca-attempt-error-summary'

/**
 * Next pending invoice for a restaurant (chain order = createdAt asc).
 * @param {string} businessProfileId
 */
async function findNextPendingInvoice(businessProfileId) {
  return prisma.invoice.findFirst({
    where: {
      businessProfileId,
      status: 'completed',
      zatcaStatus: 'pending',
      ...WHERE_NOT_DELETED,
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Next failed invoice due for the one-shot ~23h deadline retry.
 * @param {string} businessProfileId
 * @param {Date} deadlineBefore
 */
async function findNextDeadlineFailedInvoice(businessProfileId, deadlineBefore) {
  return prisma.invoice.findFirst({
    where: {
      businessProfileId,
      status: 'completed',
      zatcaStatus: 'failed',
      zatcaDeadlineRetriedAt: null,
      createdAt: { lte: deadlineBefore },
      ...WHERE_NOT_DELETED,
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Claim deadline retry (or no-op if already claimed / not found).
 * @param {string} invoiceId
 */
async function claimDeadlineRetry(invoiceId) {
  const now = new Date()
  const updated = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      zatcaStatus: 'failed',
      zatcaDeadlineRetriedAt: null,
    },
    data: { zatcaDeadlineRetriedAt: now },
  })
  return updated.count === 1
}

/**
 * Process up to `limit` ZATCA reports for one restaurant.
 *
 * @param {string} businessProfileId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ processed: number, reported: number, failed: number }>}
 */
export async function processZatcaQueueForBusiness(
  businessProfileId,
  opts = {},
) {
  const limit = Math.max(
    1,
    Math.min(
      opts.limit ?? ZATCA_BACKGROUND_BATCH_PER_BUSINESS,
      ZATCA_BACKGROUND_BATCH_PER_BUSINESS,
    ),
  )

  const device = await prisma.zatcaDevice.findUnique({
    where: { businessProfileId },
    select: { productionCsid: true, productionSecretEnc: true },
  })
  if (!device?.productionCsid || !device.productionSecretEnc) {
    return { processed: 0, reported: 0, failed: 0 }
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { id: businessProfileId },
    select: { zatcaEnvironment: true },
  })
  const selectedEnvironment = profile?.zatcaEnvironment ?? null
  const deadlineBefore = new Date(Date.now() - ZATCA_DEADLINE_RETRY_MS)

  let processed = 0
  let reported = 0
  let failed = 0

  for (let i = 0; i < limit; i += 1) {
    const deviceFresh = await prisma.zatcaDevice.findUnique({
      where: { businessProfileId },
    })
    if (!deviceFresh?.productionCsid || !deviceFresh.productionSecretEnc) {
      break
    }

    let invoice = await findNextPendingInvoice(businessProfileId)
    let isDeadlineRetry = false

    if (!invoice) {
      invoice = await findNextDeadlineFailedInvoice(
        businessProfileId,
        deadlineBefore,
      )
      if (!invoice) break
      const claimed = await claimDeadlineRetry(invoice.id)
      if (!claimed) continue
      isDeadlineRetry = true
      invoice = await prisma.invoice.findFirst({
        where: { id: invoice.id, ...WHERE_NOT_DELETED },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      })
      if (!invoice) continue
    }

    processed += 1
    const attemptAt = new Date()

    try {
      await reportInvoiceToZatca({
        invoice,
        device: deviceFresh,
        selectedEnvironment,
        withTransientRetry: true,
      })
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          zatcaReportAttempts: { increment: 1 },
          zatcaLastAttemptAt: attemptAt,
          zatcaLastError: null,
        },
      })
      reported += 1
      void emitZatcaReportSuccess({
        businessProfileId,
        documentId: invoice.id,
        documentNumber: invoice.invoiceNumber,
      })
    } catch (err) {
      const summary = zatcaAttemptErrorSummary(err)
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          zatcaStatus: 'failed',
          zatcaReportAttempts: { increment: 1 },
          zatcaLastAttemptAt: attemptAt,
          zatcaLastError: summary,
        },
      })
      failed += 1
      console.error(
        `[zatca-background] report failed ${invoice.invoiceNumber}:`,
        summary,
      )
      if (isDeadlineRetry) {
        void emitZatcaReportStillFailed({
          businessProfileId,
          documentId: invoice.id,
          documentNumber: invoice.invoiceNumber,
        })
      } else {
        void emitZatcaReportFailed({
          businessProfileId,
          documentKind: 'invoice',
          documentId: invoice.id,
          documentNumber: invoice.invoiceNumber,
        })
      }
    }
  }

  return { processed, reported, failed }
}

/**
 * Scan restaurants that have pending/failed invoices needing work.
 *
 * @param {{ maxBusinesses?: number, perBusinessLimit?: number }} [opts]
 */
export async function processZatcaQueueGlobal(opts = {}) {
  const maxBusinesses =
    opts.maxBusinesses ?? ZATCA_BACKGROUND_MAX_BUSINESSES
  const perBusinessLimit =
    opts.perBusinessLimit ?? ZATCA_BACKGROUND_BATCH_PER_BUSINESS
  const deadlineBefore = new Date(Date.now() - ZATCA_DEADLINE_RETRY_MS)

  const pendingBiz = await prisma.invoice.findMany({
    where: {
      status: 'completed',
      zatcaStatus: 'pending',
      ...WHERE_NOT_DELETED,
    },
    select: { businessProfileId: true },
    distinct: ['businessProfileId'],
    take: maxBusinesses,
    orderBy: { createdAt: 'asc' },
  })

  const failedBiz = await prisma.invoice.findMany({
    where: {
      status: 'completed',
      zatcaStatus: 'failed',
      zatcaDeadlineRetriedAt: null,
      createdAt: { lte: deadlineBefore },
      ...WHERE_NOT_DELETED,
    },
    select: { businessProfileId: true },
    distinct: ['businessProfileId'],
    take: maxBusinesses,
    orderBy: { createdAt: 'asc' },
  })

  const ids = [
    ...new Set([
      ...pendingBiz.map((r) => r.businessProfileId),
      ...failedBiz.map((r) => r.businessProfileId),
    ]),
  ].slice(0, maxBusinesses)

  let processed = 0
  let reported = 0
  let failed = 0

  for (const businessProfileId of ids) {
    const result = await processZatcaQueueForBusiness(businessProfileId, {
      limit: perBusinessLimit,
    })
    processed += result.processed
    reported += result.reported
    failed += result.failed
  }

  return {
    businesses: ids.length,
    processed,
    reported,
    failed,
  }
}
