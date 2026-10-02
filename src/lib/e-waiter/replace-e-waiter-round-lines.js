import { kitchenLinesSnapshot } from '@/lib/orders/kitchen-lines-snapshot'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
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
 * Empty `resolvedLines` → auto-cancel the round (no empty kitchen ticket).
 * Does NOT force status to preparing (unlike invoice-edit refresh).
 *
 * @param {{
 *   kitchenOrderId: string
 *   tableSessionId: string
 *   resolvedLines: Array<{
 *     menuItemId: string
 *     nameAr: string
 *     nameEn: string | null
 *     quantity: number
 *     lineNote: string | null
 *     variantOptionIds: string[]
 *     customizationIds: string[]
 *     modifiersSnapshot: unknown
 *   }>
 * }} args
 */
export async function replaceEWaiterRoundLines({
  kitchenOrderId,
  tableSessionId,
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

    if (resolvedLines.length === 0) {
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

    await tx.tableSessionLine.deleteMany({
      where: { kitchenOrderId },
    })
    await tx.tableSessionLine.createMany({
      data: resolvedLines.map((line) => ({
        tableSessionId,
        kitchenOrderId,
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        variantOptionIds: line.variantOptionIds,
        customizationIds: line.customizationIds,
        lineNote: line.lineNote,
      })),
    })

    const updated = await tx.kitchenOrder.update({
      where: { id: kitchenOrderId },
      data: {
        // Stay pending — customer edit must not mimic invoice-edit → preparing.
        status: 'pending',
        linesSnapshot: kitchenLinesSnapshot(resolvedLines),
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
