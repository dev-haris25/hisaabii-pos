import { ANALYTICS_SCOPE_ALL } from '@/lib/auth/analytics-scope-query'
import { prisma } from '@/lib/prisma'

export { ANALYTICS_SCOPE_ALL }

/**
 * Prisma filter for one restaurant or several (`{ in: ids }`).
 * @param {string | string[]} scope
 */
export function prismaProfileId(scope) {
  const ids = (Array.isArray(scope) ? scope : [scope]).filter(
    (id) => typeof id === 'string' && id.length > 0,
  )
  if (ids.length <= 1) return ids[0] ?? ''
  return { in: ids }
}

/**
 * Owner analytics scope. Never changes the active restaurant.
 * Non-owners and single-restaurant owners always get the active profile.
 *
 * @param {{
 *   session: { id: string, isRestaurantOwner?: boolean } | null | undefined
 *   activeProfileId: string | null | undefined
 *   scopeRaw: string | null | undefined
 * }} opts
 * @returns {Promise<{ ids: string[], scope: string }>}
 */
export async function resolveOwnerAnalyticsScope(opts) {
  const activeId = opts.activeProfileId?.trim() || ''
  const fallback = { ids: activeId ? [activeId] : [], scope: 'active' }

  if (!opts.session?.id || opts.session.isRestaurantOwner !== true || !activeId) {
    return fallback
  }

  const owned = await prisma.businessProfile.findMany({
    where: { ownerUserId: opts.session.id },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  const ownedIds = owned.map((r) => r.id)
  if (ownedIds.length <= 1) return fallback

  const raw = opts.scopeRaw?.trim() || ''
  if (raw === ANALYTICS_SCOPE_ALL) {
    return { ids: ownedIds, scope: ANALYTICS_SCOPE_ALL }
  }
  if (ownedIds.includes(raw)) {
    return { ids: [raw], scope: raw }
  }
  return fallback
}
