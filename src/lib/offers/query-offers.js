import { offerWithItemsInclude } from '@/lib/offers/load-active-offers'
import { mapOfferAdminJson } from '@/lib/offers/map-offer-json'
import { isOfferScheduledAt, riyadhClock } from '@/lib/offers/offer-schedule'
import { prisma } from '@/lib/prisma'

export const OFFER_KIND_FILTERS = ['DISCOUNT', 'BUY_X_GET_Y', 'COMBO']
export const OFFER_STATUS_FILTERS = ['live', 'scheduled', 'inactive', 'ended']

/**
 * Server-side list query (rules §3): search, kind, status, pagination.
 * Status is derived from active / schedule, so "live" / "scheduled" / "ended"
 * are filtered after loading the restaurant's (small) offer set.
 *
 * @param {{
 *   businessProfileId: string
 *   search?: string
 *   kind?: string
 *   status?: string
 *   page: number
 *   limit: number
 *   now?: Date
 * }} args
 */
export async function queryOffersList(args) {
  const now = args.now ?? new Date()
  /** @type {Record<string, unknown>} */
  const where = { businessProfileId: args.businessProfileId, deletedAt: null }
  if (args.kind && OFFER_KIND_FILTERS.includes(args.kind)) where.kind = args.kind
  const search = (args.search ?? '').trim()
  if (search) {
    where.OR = [
      { nameAr: { contains: search, mode: 'insensitive' } },
      { nameEn: { contains: search, mode: 'insensitive' } },
    ]
  }

  const rows = await prisma.offer.findMany({
    where,
    include: offerWithItemsInclude,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  /** @param {any} o */
  const statusOf = (o) => {
    if (!o.active) return 'inactive'
    if (o.endsAt && new Date(o.endsAt) <= now) return 'ended'
    return isOfferScheduledAt(o, now) ? 'live' : 'scheduled'
  }
  const filtered =
    args.status && OFFER_STATUS_FILTERS.includes(args.status)
      ? rows.filter((o) => statusOf(o) === args.status)
      : rows

  const total = filtered.length
  const start = (args.page - 1) * args.limit
  const pageRows = filtered.slice(start, start + args.limit)

  const ids = pageRows.map((o) => o.id)
  const day = riyadhClock(now).day
  const [totals, today] = ids.length
    ? await Promise.all([
        prisma.offerUsage.groupBy({
          by: ['offerId'],
          where: { offerId: { in: ids }, releasedAt: null },
          _sum: { quantity: true },
        }),
        prisma.offerUsage.groupBy({
          by: ['offerId'],
          where: { offerId: { in: ids }, releasedAt: null, riyadhDay: day },
          _sum: { quantity: true },
        }),
      ])
    : [[], []]
  const totalBy = new Map(totals.map((r) => [r.offerId, r._sum.quantity ?? 0]))
  const todayBy = new Map(today.map((r) => [r.offerId, r._sum.quantity ?? 0]))

  return {
    total,
    offers: pageRows.map((o) => ({
      ...mapOfferAdminJson(o, {
        usedTotal: totalBy.get(o.id) ?? 0,
        usedToday: todayBy.get(o.id) ?? 0,
        liveNow: statusOf(o) === 'live',
      }),
      status: statusOf(o),
    })),
  }
}
