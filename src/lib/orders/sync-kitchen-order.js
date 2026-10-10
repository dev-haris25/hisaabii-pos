import { kitchenLinesSnapshot } from '@/lib/orders/kitchen-lines-snapshot'

/**
 * Refresh kitchen lines and put the ticket back to preparing after an invoice edit.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/generated/prisma/client').PrismaClient} db
 * @param {string} invoiceId
 * @param {Array<{ nameAr?: string | null, nameEn?: string | null, quantity?: number }>} lines
 */
export async function refreshKitchenOrderAfterEdit(db, invoiceId, lines) {
  // invoiceId is indexed, not unique (E-Waiter can have multiple rounds).
  const existing = await db.kitchenOrder.findFirst({
    where: { invoiceId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!existing) return null
  return db.kitchenOrder.update({
    where: { id: existing.id },
    data: {
      status: 'preparing',
      linesSnapshot: kitchenLinesSnapshot(lines),
      itemsUpdatedAt: new Date(),
    },
  })
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/generated/prisma/client').PrismaClient} db
 * @param {string} invoiceId
 */
export async function cancelKitchenOrderForInvoice(db, invoiceId) {
  // invoiceId is indexed, not unique — cancel every ticket linked to the invoice.
  const existing = await db.kitchenOrder.findMany({
    where: { invoiceId },
    select: { id: true },
  })
  if (existing.length === 0) return null
  await db.kitchenOrder.updateMany({
    where: { invoiceId },
    data: { status: 'cancelled' },
  })
  return existing
}

const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'ready'])

/**
 * Active columns can move freely. Served (`completed`) is allowed from Ready.
 *
 * @param {string} current
 * @param {string} next
 */
export function canTransitionKitchenStatus(current, next) {
  if (!current || !next || current === next) return false
  if (current === 'cancelled' || current === 'completed') return false
  if (ACTIVE_STATUSES.has(current) && ACTIVE_STATUSES.has(next)) return true
  if (current === 'ready' && next === 'completed') return true
  return false
}

/** @param {string} next */
export function kitchenStatusUpdateData(next) {
  if (next === 'completed') {
    return { status: 'completed', completedAt: new Date() }
  }
  return { status: next, completedAt: null }
}
