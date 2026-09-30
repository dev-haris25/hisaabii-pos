/**
 * Map LoyaltyAccount → API JSON (money/balance stay strings).
 *
 * @param {{
 *   id: string
 *   phone: string | null
 *   balance: string
 *   createdAt: Date
 *   updatedAt?: Date
 * }} row
 */
export function mapLoyaltyAccountToJson(row) {
  return {
    id: row.id,
    phone: row.phone ?? null,
    balance: row.balance,
    createdAt: row.createdAt.toISOString(),
    ...(row.updatedAt
      ? { updatedAt: row.updatedAt.toISOString() }
      : {}),
  }
}

/**
 * @param {{
 *   id: string
 *   type: string
 *   points: string
 *   discountAmount?: string | null
 *   invoiceId: string
 *   cashierUserId: string
 *   createdAt: Date
 *   invoice?: { id: string, invoiceNumber: string } | null
 *   cashierUser?: { id: string, name: string | null } | null
 * }} row
 */
export function mapLoyaltyTransactionToJson(row) {
  return {
    id: row.id,
    type: row.type,
    points: row.points,
    discountAmount: row.discountAmount ?? null,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice?.invoiceNumber ?? null,
    cashierUserId: row.cashierUserId,
    cashierName: row.cashierUser?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
