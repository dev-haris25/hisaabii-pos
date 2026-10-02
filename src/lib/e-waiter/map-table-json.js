/**
 * @param {{
 *   id: string
 *   name: string
 *   qrToken: string
 *   status: string
 *   createdAt: Date | string
 *   updatedAt: Date | string
 *   waiterCallRequestedAt?: Date | null
 *   waiterCallResolvedAt?: Date | null
 * }} row
 * @param {{ orderUrl?: string | null }} [opts]
 */
export function mapTableToJson(row, opts = {}) {
  const waiterCallRequestedAt = row.waiterCallRequestedAt
    ? row.waiterCallRequestedAt instanceof Date
      ? row.waiterCallRequestedAt.toISOString()
      : row.waiterCallRequestedAt
    : null
  const waiterCallResolvedAt = row.waiterCallResolvedAt
    ? row.waiterCallResolvedAt instanceof Date
      ? row.waiterCallResolvedAt.toISOString()
      : row.waiterCallResolvedAt
    : null
  const waiterCallActive = Boolean(
    row.waiterCallRequestedAt &&
      (!row.waiterCallResolvedAt ||
        (row.waiterCallResolvedAt instanceof Date
          ? row.waiterCallResolvedAt.getTime()
          : new Date(row.waiterCallResolvedAt).getTime()) <
          (row.waiterCallRequestedAt instanceof Date
            ? row.waiterCallRequestedAt.getTime()
            : new Date(row.waiterCallRequestedAt).getTime())),
  )

  /** @type {Record<string, unknown>} */
  const out = {
    id: row.id,
    name: row.name,
    qrToken: row.qrToken,
    status: row.status,
    waiterCallActive,
    waiterCallRequestedAt,
    waiterCallResolvedAt,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  }
  if (opts.orderUrl != null) {
    out.orderUrl = opts.orderUrl
  }
  return out
}
