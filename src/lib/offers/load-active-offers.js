import { prisma } from '@/lib/prisma'
import { isOfferScheduledAt, riyadhClock } from '@/lib/offers/offer-schedule'

export const offerWithItemsInclude = {
  items: {
    orderBy: { sortOrder: 'asc' },
    include: {
      menuItem: {
        select: { id: true, active: true, nameAr: true, nameEn: true },
      },
      allowedVariantOptions: {
        include: { variantOption: { select: { id: true, groupId: true } } },
      },
    },
  },
}

/**
 * Drop offer items whose menu item is inactive; returns null when the offer can
 * no longer work (a combo with an inactive item is hidden entirely).
 *
 * @param {any} offer
 */
function withSellableItems(offer) {
  const items = (offer.items ?? []).filter((it) => it.menuItem?.active === true)
  if (offer.kind === 'COMBO') {
    return items.length === offer.items.length && items.length >= 2
      ? { ...offer, items }
      : null
  }
  if (offer.kind === 'BUY_X_GET_Y') {
    const allBuys = offer.items.filter((it) => it.role === 'BUY')
    const buys = items.filter((it) => it.role === 'BUY')
    const gets = items.filter((it) => it.role === 'GET')
    return buys.length === allBuys.length && buys.length > 0 && gets.length > 0
      ? { ...offer, items }
      : null
  }
  if (!offer.appliesToAllItems && items.length === 0) return null
  return { ...offer, items }
}

/**
 * Remaining uses per offer from live (unreleased) usage rows.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} db
 * @param {Array<{ id: string, totalUsageLimit: number | null, dailyUsageLimit: number | null }>} offers
 * @param {string} riyadhDay
 * @returns {Promise<Map<string, number | null>>}
 */
async function remainingUsesByOffer(db, offers, riyadhDay) {
  const limited = offers.filter(
    (o) => o.totalUsageLimit != null || o.dailyUsageLimit != null,
  )
  /** @type {Map<string, number | null>} */
  const out = new Map(offers.map((o) => [o.id, null]))
  if (limited.length === 0) return out

  const ids = limited.map((o) => o.id)
  const [totals, today] = await Promise.all([
    db.offerUsage.groupBy({
      by: ['offerId'],
      where: { offerId: { in: ids }, releasedAt: null },
      _sum: { quantity: true },
    }),
    db.offerUsage.groupBy({
      by: ['offerId'],
      where: { offerId: { in: ids }, releasedAt: null, riyadhDay },
      _sum: { quantity: true },
    }),
  ])
  const totalBy = new Map(totals.map((r) => [r.offerId, r._sum.quantity ?? 0]))
  const todayBy = new Map(today.map((r) => [r.offerId, r._sum.quantity ?? 0]))

  for (const o of limited) {
    let remaining = Infinity
    if (o.totalUsageLimit != null) {
      remaining = Math.min(remaining, o.totalUsageLimit - (totalBy.get(o.id) ?? 0))
    }
    if (o.dailyUsageLimit != null) {
      remaining = Math.min(remaining, o.dailyUsageLimit - (todayBy.get(o.id) ?? 0))
    }
    out.set(o.id, Math.max(0, remaining))
  }
  return out
}

/**
 * Offers that are live right now for a restaurant: active, not deleted, inside
 * their schedule, items still sellable. Each row gets `remainingUses`.
 *
 * Pass `lockIds` inside a transaction to row-lock those offers first, so two
 * checkouts can never both take the last use (`SELECT … FOR UPDATE`).
 *
 * @param {{
 *   businessProfileId: string
 *   db?: import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma
 *   now?: Date
 *   lockIds?: string[]
 * }} opts
 */
export async function loadActiveOffers({
  businessProfileId,
  db = prisma,
  now = new Date(),
  lockIds = [],
}) {
  const ids = [...new Set(lockIds)].sort()
  for (const id of ids) {
    await db.$queryRaw`SELECT "id" FROM "offers" WHERE "id" = ${id} AND "businessProfileId" = ${businessProfileId} FOR UPDATE`
  }

  const rows = await db.offer.findMany({
    where: { businessProfileId, active: true, deletedAt: null },
    include: offerWithItemsInclude,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  const live = rows
    .filter((o) => isOfferScheduledAt(o, now))
    .map(withSellableItems)
    .filter(Boolean)

  const remaining = await remainingUsesByOffer(db, live, riyadhClock(now).day)
  return live.map((o) => ({ ...o, remainingUses: remaining.get(o.id) ?? null }))
}
