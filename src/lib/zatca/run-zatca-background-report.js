import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { emitZatcaReportFailed } from '@/lib/notifications/emit-zatca-report-failed'
import { emitZatcaReportStillFailed } from '@/lib/notifications/emit-zatca-report-still-failed'
import { emitZatcaReportSuccess } from '@/lib/notifications/emit-zatca-report-success'
import { prisma } from '@/lib/prisma'
import {
  ZATCA_BACKGROUND_BATCH_PER_BUSINESS,
  ZATCA_BACKGROUND_MAX_BUSINESSES,
  ZATCA_DEADLINE_RETRY_MS,
  ZATCA_PENDING_MIN_AGE_MS,
} from '@/lib/zatca/zatca-background-constants'
import { reportDocumentToZatca } from '@/lib/zatca/zatca-document-chain'

/**
 * The worker runs under Bun, whose crypto cannot do ZATCA's secp256k1 ECDSA, so
 * it only RESENDS documents that the app (Node) already signed into the chain.
 * Unsigned pending/failed invoices stay visible with "Report to ZATCA" (rules §19).
 */
const SIGNED_ONLY = { cryptographicStamp: { not: null }, xmlPayload: { not: null } }

/**
 * Next stuck pending invoice for a restaurant (chain order = createdAt asc).
 * Only invoices older than {@link ZATCA_PENDING_MIN_AGE_MS} — younger ones are
 * still being reported by their own checkout / note request.
 * @param {string} businessProfileId
 * @param {Date} pendingBefore
 */
async function findNextPendingInvoice(businessProfileId, pendingBefore) {
  return prisma.invoice.findFirst({
    where: {
      businessProfileId,
      status: 'completed',
      zatcaStatus: 'pending',
      createdAt: { lte: pendingBefore },
      ...SIGNED_ONLY,
      ...WHERE_NOT_DELETED,
    },
    select: { id: true, invoiceNumber: true },
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
      ...SIGNED_ONLY,
      ...WHERE_NOT_DELETED,
    },
    select: { id: true, invoiceNumber: true },
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

  const deadlineBefore = new Date(Date.now() - ZATCA_DEADLINE_RETRY_MS)
  const pendingBefore = new Date(Date.now() - ZATCA_PENDING_MIN_AGE_MS)

  let processed = 0
  let reported = 0
  let failed = 0

  for (let i = 0; i < limit; i += 1) {
    let invoice = await findNextPendingInvoice(businessProfileId, pendingBefore)
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
    }

    processed += 1

    try {
      await reportDocumentToZatca({
        kind: 'invoice',
        id: invoice.id,
        businessProfileId,
        withTransientRetry: true,
      })
      reported += 1
      void emitZatcaReportSuccess({
        businessProfileId,
        documentId: invoice.id,
        documentNumber: invoice.invoiceNumber,
      })
    } catch (err) {
      failed += 1
      if (err && typeof err === 'object' && 'code' in err && err.code === 'NOT_FOUND') {
        continue
      }
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

  const pendingBefore = new Date(Date.now() - ZATCA_PENDING_MIN_AGE_MS)
  const pendingBiz = await prisma.invoice.findMany({
    where: {
      status: 'completed',
      zatcaStatus: 'pending',
      createdAt: { lte: pendingBefore },
      ...SIGNED_ONLY,
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
      ...SIGNED_ONLY,
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
