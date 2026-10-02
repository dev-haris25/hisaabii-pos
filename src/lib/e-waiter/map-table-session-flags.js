/**
 * Whether a waiter call is still active (requested, and not yet resolved after that request).
 *
 * @param {{
 *   waiterCallRequestedAt?: Date | null
 *   waiterCallResolvedAt?: Date | null
 * }} row
 */
export function isWaiterCallActive(row) {
  return Boolean(
    row.waiterCallRequestedAt &&
      (!row.waiterCallResolvedAt ||
        row.waiterCallResolvedAt.getTime() < row.waiterCallRequestedAt.getTime()),
  )
}

/**
 * Map Table waiter-call flags (session-independent).
 *
 * @param {{
 *   id: string
 *   name?: string
 *   status?: string
 *   waiterCallRequestedAt?: Date | null
 *   waiterCallResolvedAt?: Date | null
 * }} row
 */
export function mapTableWaiterCallJson(row) {
  const waiterCallRequestedAt = row.waiterCallRequestedAt
    ? row.waiterCallRequestedAt.toISOString()
    : null
  const waiterCallResolvedAt = row.waiterCallResolvedAt
    ? row.waiterCallResolvedAt.toISOString()
    : null
  return {
    tableId: row.id,
    tableName: row.name ?? null,
    tableStatus: row.status ?? null,
    waiterCallActive: isWaiterCallActive(row),
    waiterCallRequestedAt,
    waiterCallResolvedAt,
  }
}

/**
 * Map TableSession bill / ordering flags (no waiter — waiter lives on Table).
 *
 * @param {{
 *   id: string
 *   status?: string
 *   billRequestedAt?: Date | null
 *   requestedRedeemPoints?: string | null
 *   loyaltyAccountId?: string | null
 *   openedAt?: Date
 *   tableId?: string
 * }} row
 * @param {{
 *   tableName?: string | null
 *   tableStatus?: string | null
 *   roundCount?: number
 * }=} [extra]
 */
export function mapTableSessionFlagsJson(row, extra = {}) {
  const billRequestedAt = row.billRequestedAt
    ? row.billRequestedAt.toISOString()
    : null

  /** @type {Record<string, unknown>} */
  const out = {
    sessionId: row.id,
    status: row.status ?? 'open',
    billRequested: Boolean(row.billRequestedAt),
    billRequestedAt,
    requestedRedeemPoints: row.requestedRedeemPoints ?? null,
    loyaltyAccountId: row.loyaltyAccountId ?? null,
  }

  if (row.tableId != null) out.tableId = row.tableId
  if (row.openedAt instanceof Date) out.openedAt = row.openedAt.toISOString()
  if (extra.tableName != null) out.tableName = extra.tableName
  if (extra.tableStatus != null) out.tableStatus = extra.tableStatus
  if (typeof extra.roundCount === 'number') out.roundCount = extra.roundCount

  return out
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/generated/prisma/client').PrismaClient} db
 * @param {string} tableId
 */
export async function findOpenTableSession(db, tableId) {
  return db.tableSession.findFirst({
    where: { tableId, status: 'open' },
  })
}
