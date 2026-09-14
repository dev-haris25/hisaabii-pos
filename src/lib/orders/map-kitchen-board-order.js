/**
 * @param {{
 *   invoiceId: string
 *   orderNumber: number
 *   status: string
 *   itemsUpdatedAt: Date
 *   linesSnapshot: unknown
 *   createdAt: Date
 *   completedAt?: Date | null
 * }} row
 * @param {'kitchen' | 'display'} view
 */
export function mapKitchenBoardOrder(row, view) {
  /** @type {Record<string, unknown>} */
  const base = {
    invoiceId: row.invoiceId,
    orderNumber: row.orderNumber,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }
  if (view === 'kitchen') {
    const lines = Array.isArray(row.linesSnapshot) ? row.linesSnapshot : []
    base.lines = lines
    base.itemsUpdatedAt = row.itemsUpdatedAt.toISOString()
    base.updated = row.itemsUpdatedAt.getTime() - row.createdAt.getTime() > 2000
    base.completedAt = row.completedAt ? row.completedAt.toISOString() : null
  }
  return base
}
