import { kitchenLinesSnapshot } from '@/lib/orders/kitchen-lines-snapshot'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { resolveCheckoutModifiers } from '@/lib/menu/resolve-checkout-modifiers'
import {
  eWaiterOfferErrorResult,
  priceEWaiterRoundInTx,
  roundLinesWithOffers,
} from '@/lib/offers/e-waiter-round-offers'
import { recordOfferUsages, releaseOfferUsages } from '@/lib/offers/offer-usage'
import { offerDiscountMatches } from '@/lib/offers/resolve-cart-offers'
import { prisma } from '@/lib/prisma'

/**
 * After cancelling a round: if the session has no non-cancelled KitchenOrders
 * left, close it (no invoice) and mark the table Available — same tx.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} db
 * @param {string | null | undefined} tableSessionId
 * @returns {Promise<{ sessionClosed: boolean }>}
 */
async function closeSessionIfNoActiveRounds(db, tableSessionId) {
  if (!tableSessionId) return { sessionClosed: false }

  const remaining = await db.kitchenOrder.count({
    where: {
      tableSessionId,
      status: { not: 'cancelled' },
    },
  })
  if (remaining > 0) return { sessionClosed: false }

  const session = await db.tableSession.findFirst({
    where: { id: tableSessionId, status: 'open' },
    select: { id: true, tableId: true },
  })
  if (!session) return { sessionClosed: false }

  const closedAt = new Date()
  await db.tableSession.update({
    where: { id: session.id },
    data: {
      status: 'closed',
      closedAt,
      // invoiceId stays null — non-billed auto-close (distinct from settle)
      billRequestedAt: null,
      requestedRedeemPoints: null,
    },
  })
  await db.table.update({
    where: { id: session.tableId },
    data: { status: 'available' },
  })
  return { sessionClosed: true }
}

/**
 * Cancel an E-Waiter round (KitchenOrder → cancelled; session lines flagged).
 * If this was the last non-cancelled round, closes the TableSession (no invoice)
 * and sets Table → available in the same transaction.
 * Caller must already know the ticket is editable (pending) or be cancelling empty.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} db
 * @param {string} kitchenOrderId
 */
export async function cancelEWaiterRoundInDb(db, kitchenOrderId) {
  const ticket = await db.kitchenOrder.findFirst({
    where: { id: kitchenOrderId },
    select: { id: true, tableSessionId: true },
  })
  if (!ticket) {
    throw Object.assign(new Error('Kitchen order not found'), {
      code: 'NOT_FOUND',
    })
  }

  await db.tableSessionLine.updateMany({
    where: { kitchenOrderId, cancelled: false },
    data: { cancelled: true },
  })
  // Offer / deal uses of this round go back into the offer limits.
  await releaseOfferUsages(db, { kitchenOrderId })
  const cancelled = await db.kitchenOrder.update({
    where: { id: kitchenOrderId },
    data: {
      status: 'cancelled',
      itemsUpdatedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      orderNumber: true,
      roundNumber: true,
      itemsUpdatedAt: true,
      tableSessionId: true,
    },
  })

  const { sessionClosed } = await closeSessionIfNoActiveRounds(
    db,
    cancelled.tableSessionId ?? ticket.tableSessionId,
  )

  return { ...cancelled, sessionClosed }
}

/**
 * Replace round lines while status is still pending.
 * Empty `resolvedLines` (and no deal in the round) → auto-cancel the round.
 * Does NOT force status to preparing (unlike invoice-edit refresh).
 *
 * Offers: normal lines are re-priced now (offer row locks). Combo deal lines
 * already in the round stay exactly as ordered — a guest removes a deal by
 * cancelling the round — so their locked price and use stay untouched.
 *
 * @param {{
 *   businessProfileId: string
 *   kitchenOrderId: string
 *   tableSessionId: string
 *   expectedOfferDiscount?: string | null
 *   resolvedLines: Array<{
 *     menuItemId: string
 *     nameAr: string
 *     nameEn: string | null
 *     quantity: number
 *     lineNote: string | null
 *     unitPrice: string
 *     variantOptionIds: string[]
 *     customizationIds: string[]
 *     modifiersSnapshot: unknown
 *   }>
 * }} args
 */
export async function replaceEWaiterRoundLines({
  businessProfileId,
  kitchenOrderId,
  tableSessionId,
  expectedOfferDiscount = null,
  resolvedLines,
}) {
  try {
    return await replaceEWaiterRoundLinesTx({
      businessProfileId,
      kitchenOrderId,
      tableSessionId,
      expectedOfferDiscount,
      resolvedLines,
    })
  } catch (err) {
    const mapped = eWaiterOfferErrorResult(err)
    if (mapped) return mapped
    throw err
  }
}

/** @param {Parameters<typeof replaceEWaiterRoundLines>[0]} args */
async function replaceEWaiterRoundLinesTx({
  businessProfileId,
  kitchenOrderId,
  tableSessionId,
  expectedOfferDiscount,
  resolvedLines,
}) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.kitchenOrder.findFirst({
      where: { id: kitchenOrderId },
      select: { id: true, status: true, tableSessionId: true },
    })
    if (!locked) {
      return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Round not found' }
    }
    if (locked.status !== 'pending') {
      return {
        ok: false,
        status: 409,
        code: 'ROUND_NOT_EDITABLE',
        message: 'This order is already being prepared',
      }
    }

    const dealLines = await tx.tableSessionLine.findMany({
      where: { kitchenOrderId, cancelled: false, offerGroupKey: { not: null } },
      include: {
        menuItem: {
          include: {
            variantGroups: { include: { options: true } },
            customizations: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (resolvedLines.length === 0 && dealLines.length === 0) {
      const cancelled = await cancelEWaiterRoundInDb(tx, kitchenOrderId)
      return {
        ok: true,
        cancelled: true,
        sessionClosed: cancelled.sessionClosed === true,
        kitchenOrderId: cancelled.id,
        status: cancelled.status,
        orderNumber: cancelled.orderNumber,
        roundNumber: cancelled.roundNumber,
      }
    }

    // Give back this round's non-deal offer uses, then re-price normal lines.
    await tx.offerUsage.updateMany({
      where: {
        kitchenOrderId,
        releasedAt: null,
        offer: { kind: { not: 'COMBO' } },
      },
      data: { releasedAt: new Date() },
    })
    const priced = await priceEWaiterRoundInTx(tx, {
      businessProfileId,
      resolvedLines,
      deals: [],
    })
    if (!offerDiscountMatches(expectedOfferDiscount, priced.pricing.totalDiscount)) {
      return {
        ok: false,
        status: 409,
        code: 'OFFER_PRICES_CHANGED',
        message: 'Offer prices changed — please review the updated total',
      }
    }
    const normalLines = roundLinesWithOffers(resolvedLines, priced)

    await tx.tableSessionLine.deleteMany({
      where: { kitchenOrderId, offerGroupKey: null },
    })
    await tx.tableSessionLine.createMany({
      data: normalLines.map((line) => ({
        tableSessionId,
        kitchenOrderId,
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        variantOptionIds: line.variantOptionIds,
        customizationIds: line.customizationIds,
        lineNote: line.lineNote,
        offerId: line.offerId,
        offerGroupKey: null,
        offerDiscount: line.offerDiscount,
      })),
    })
    await recordOfferUsages(tx, {
      businessProfileId,
      usage: priced.pricing.usage,
      kitchenOrderId,
    })

    const dealSnapshotLines = dealLines.map((line) => {
      let modifiersSnapshot = null
      try {
        modifiersSnapshot = resolveCheckoutModifiers(
          line.menuItem,
          Array.isArray(line.variantOptionIds) ? line.variantOptionIds.map(String) : [],
          [],
        ).modifiersSnapshot
      } catch {
        modifiersSnapshot = null
      }
      return {
        menuItemId: line.menuItemId,
        nameAr: line.menuItem.nameAr,
        nameEn: line.menuItem.nameEn,
        quantity: line.quantity,
        lineNote: null,
        modifiersSnapshot,
      }
    })

    const updated = await tx.kitchenOrder.update({
      where: { id: kitchenOrderId },
      data: {
        // Stay pending — customer edit must not mimic invoice-edit → preparing.
        status: 'pending',
        linesSnapshot: kitchenLinesSnapshot([...normalLines, ...dealSnapshotLines]),
        itemsUpdatedAt: new Date(),
      },
    })

    return {
      ok: true,
      cancelled: false,
      sessionClosed: false,
      kitchenOrderId: updated.id,
      status: updated.status,
      orderNumber: updated.orderNumber,
      roundNumber: updated.roundNumber,
      itemsUpdatedAt: updated.itemsUpdatedAt.toISOString(),
    }
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
}
