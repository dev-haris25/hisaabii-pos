/**
 * Classic POS invoices still have exactly one kitchen ticket.
 * E-Waiter settlement may attach many rounds — callers that only need the
 * "receipt order #" should use the earliest ticket (same as former 1:1).
 */

/** @type {{ createdAt: 'asc' }} */
export const PRIMARY_KITCHEN_ORDER_ORDER_BY = { createdAt: 'asc' }

/**
 * Prisma `include` / `select` fragment for the primary (oldest) kitchen ticket.
 * @param {{ withStatus?: boolean }} [opts]
 */
export function primaryKitchenOrderInclude(opts = {}) {
  const withStatus = opts.withStatus !== false
  return {
    select: {
      orderNumber: true,
      ...(withStatus ? { status: true } : {}),
    },
    take: 1,
    orderBy: PRIMARY_KITCHEN_ORDER_ORDER_BY,
  }
}

/**
 * @param {{ kitchenOrders?: Array<{ orderNumber?: number | null, status?: string | null }> | null } | null | undefined} invoice
 * @returns {{ orderNumber?: number | null, status?: string | null } | null}
 */
export function primaryKitchenOrder(invoice) {
  const rows = invoice?.kitchenOrders
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows[0] ?? null
}
