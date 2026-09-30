import { mapCouponCodeToJson } from '@/lib/coupons/map-coupon-json'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'

/**
 * Build Prisma where for CouponCode rows under one coupon.
 * Search: code partial (insensitive contains); if the term is all digits,
 * also exact-match ticketNumber.
 *
 * @param {string} couponId
 * @param {string} businessProfileId
 * @param {string} [search]
 */
export function buildCouponCodesWhere(couponId, businessProfileId, search = '') {
  /** @type {Record<string, unknown>} */
  const where = { couponId, businessProfileId }
  const q = String(search ?? '').trim()
  if (!q) return where

  /** @type {Array<Record<string, unknown>>} */
  const or = [{ code: { contains: q, mode: 'insensitive' } }]
  if (/^\d+$/.test(q)) {
    const ticket = Number.parseInt(q, 10)
    if (Number.isFinite(ticket)) {
      or.push({ ticketNumber: ticket })
    }
  }
  where.OR = or
  return where
}

/**
 * Paginated codes for a UNIQUE_BATCH coupon.
 *
 * @param {{
 *   db: import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma
 *   couponId: string
 *   businessProfileId: string
 *   searchParams: URLSearchParams
 * }} opts
 */
export async function queryCouponCodesPage({
  db,
  couponId,
  businessProfileId,
  searchParams,
}) {
  const search = (searchParams.get('search') ?? '').trim()
  const where = buildCouponCodesWhere(couponId, businessProfileId, search)
  const { page, limit, skip } = parseListPagination(searchParams, {
    defaultLimit: 10,
  })
  const [total, rows] = await Promise.all([
    db.couponCode.count({ where }),
    db.couponCode.findMany({
      where,
      orderBy: { ticketNumber: 'asc' },
      skip,
      take: limit,
    }),
  ])
  return {
    codes: rows.map(mapCouponCodeToJson),
    pagination: buildPaginationMeta(page, limit, total),
    search,
  }
}

/**
 * All codes for CSV export (no search/page filter).
 * When `availableOnly` is true, only unused codes (`usedCount` 0) — same
 * meaning as the detail table’s “Available” label.
 *
 * @param {{
 *   db: import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma
 *   couponId: string
 *   businessProfileId: string
 *   availableOnly?: boolean
 * }} opts
 */
export async function queryAllCouponCodes({
  db,
  couponId,
  businessProfileId,
  availableOnly = false,
}) {
  /** @type {Record<string, unknown>} */
  const where = { couponId, businessProfileId }
  if (availableOnly) {
    where.usedCount = 0
  }
  const rows = await db.couponCode.findMany({
    where,
    orderBy: { ticketNumber: 'asc' },
  })
  return rows.map(mapCouponCodeToJson)
}
