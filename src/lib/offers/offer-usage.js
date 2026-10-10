import { riyadhClock } from '@/lib/offers/offer-schedule'

/**
 * Record one usage row per offer for an order (invoice or E-Waiter round).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   businessProfileId: string
 *   usage: Array<{ offerId: string, quantity: number, discountAmount: string }>
 *   invoiceId?: string | null
 *   kitchenOrderId?: string | null
 *   now?: Date
 * }} args
 */
export async function recordOfferUsages(tx, args) {
  const rows = (args.usage ?? []).filter((u) => u.quantity > 0)
  if (rows.length === 0) return
  const riyadhDay = riyadhClock(args.now ?? new Date()).day
  await tx.offerUsage.createMany({
    data: rows.map((u) => ({
      offerId: u.offerId,
      businessProfileId: args.businessProfileId,
      invoiceId: args.invoiceId ?? null,
      kitchenOrderId: args.kitchenOrderId ?? null,
      quantity: u.quantity,
      riyadhDay,
      discountAmount: u.discountAmount,
    })),
  })
}

/**
 * Give uses back when an order is voided, deleted or a round is cancelled.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/lib/prisma').prisma} db
 * @param {{ invoiceId?: string, kitchenOrderId?: string }} where
 */
export async function releaseOfferUsages(db, where) {
  if (!where.invoiceId && !where.kitchenOrderId) return
  await db.offerUsage.updateMany({
    where: {
      releasedAt: null,
      ...(where.invoiceId ? { invoiceId: where.invoiceId } : {}),
      ...(where.kitchenOrderId ? { kitchenOrderId: where.kitchenOrderId } : {}),
    },
    data: { releasedAt: new Date() },
  })
}

/**
 * Settlement: E-Waiter round usages now belong to the table's invoice.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string[]} kitchenOrderIds
 * @param {string} invoiceId
 */
export async function attachRoundOfferUsagesToInvoice(tx, kitchenOrderIds, invoiceId) {
  if (!kitchenOrderIds.length) return
  await tx.offerUsage.updateMany({
    where: { kitchenOrderId: { in: kitchenOrderIds }, releasedAt: null },
    data: { invoiceId },
  })
}
