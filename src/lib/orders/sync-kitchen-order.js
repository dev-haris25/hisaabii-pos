import { kitchenLinesSnapshot } from '@/lib/orders/kitchen-lines-snapshot'

/**
 * Refresh kitchen lines and put the ticket back to preparing after an invoice edit.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/generated/prisma/client').PrismaClient} db
 * @param {string} invoiceId
 * @param {Array<{ nameAr?: string | null, nameEn?: string | null, quantity?: number }>} lines
 */
export async function refreshKitchenOrderAfterEdit(db, invoiceId, lines) {
  const existing = await db.kitchenOrder.findUnique({
    where: { invoiceId },
    select: { id: true },
  })
  if (!existing) return null
  return db.kitchenOrder.update({
    where: { invoiceId },
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
  const existing = await db.kitchenOrder.findUnique({
    where: { invoiceId },
    select: { id: true },
  })
  if (!existing) return null
  return db.kitchenOrder.update({
    where: { invoiceId },
    data: { status: 'cancelled' },
  })
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
