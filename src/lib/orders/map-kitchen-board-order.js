/**
 * @param {{
 *   id: string
 *   invoiceId: string | null
 *   orderNumber: number
 *   status: string
 *   itemsUpdatedAt: Date
 *   linesSnapshot: unknown
 *   createdAt: Date
 *   completedAt?: Date | null
 *   tableSessionId?: string | null
 *   roundNumber?: number | null
 *   tableSession?: {
 *     id?: string
 *     table?: { name?: string | null } | null
 *   } | null
 * }} row
 * @param {'kitchen' | 'display'} view
 */
export function mapKitchenBoardOrder(row, view) {
  /** Stable board key: kitchen ticket id (E-Waiter may have null invoiceId). */
  const boardId = row.id
  const tableSessionId = row.tableSessionId ?? row.tableSession?.id ?? null
  const tableName =
    tableSessionId && row.tableSession?.table?.name
      ? String(row.tableSession.table.name).trim() || null
      : null

  /** @type {Record<string, unknown>} */
  const base = {
    id: boardId,
    /** @deprecated Prefer `id` — kept for POS tickets where invoiceId was the card key. */
    invoiceId: row.invoiceId ?? boardId,
    orderNumber: row.orderNumber,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    tableSessionId,
    roundNumber: row.roundNumber ?? null,
    tableName,
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
