import {
  mapTableSessionFlagsJson,
  mapTableWaiterCallJson,
} from '@/lib/e-waiter/map-table-session-flags'
import { resolveCheckoutModifiers } from '@/lib/menu/resolve-checkout-modifiers'

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asIdArray(value) {
  if (!Array.isArray(value)) return []
  return value.map(String).filter(Boolean)
}

/**
 * Staff floor/detail DTO for an open TableSession + table waiter flags.
 *
 * @param {{
 *   id: string
 *   status?: string
 *   billRequestedAt?: Date | null
 *   requestedRedeemPoints?: string | null
 *   loyaltyAccountId?: string | null
 *   openedAt?: Date
 *   tableId?: string
 *   table: {
 *     id: string
 *     name: string
 *     status: string
 *     waiterCallRequestedAt?: Date | null
 *     waiterCallResolvedAt?: Date | null
 *   }
 *   kitchenOrders: Array<{
 *     id: string
 *     orderNumber: number
 *     roundNumber: number | null
 *     status: string
 *     createdAt: Date
 *     completedAt?: Date | null
 *   }>
 *   lines: Array<{
 *     id: string
 *     kitchenOrderId: string
 *     menuItemId: string
 *     quantity: number
 *     variantOptionIds: unknown
 *     customizationIds: unknown
 *     lineNote: string | null
 *     cancelled: boolean
 *     menuItem: {
 *       id: string
 *       nameAr: string
 *       nameEn: string | null
 *       price: string
 *       vatPreset?: string
 *       businessProfileId: string
 *       variantGroups: Array<{
 *         options: Array<{
 *           id: string
 *           nameAr: string
 *           nameEn: string | null
 *           priceChange: string
 *         }>
 *       }>
 *       customizations: Array<{
 *         id: string
 *         nameAr: string
 *         nameEn: string | null
 *         priceChange: string
 *       }>
 *     }
 *   }>
 * }} session
 * @param {{ businessProfileId: string }} opts
 */
export function mapTableSessionDetailJson(session, opts) {
  const roundCount = session.kitchenOrders.filter(
    (o) => o.status !== 'cancelled',
  ).length

  const sessionFlags = mapTableSessionFlagsJson(session, {
    tableName: session.table.name,
    tableStatus: session.table.status,
    roundCount,
  })

  const waiterCall = mapTableWaiterCallJson(session.table)

  const rounds = session.kitchenOrders
    .slice()
    .sort((a, b) => {
      const ra = a.roundNumber ?? 0
      const rb = b.roundNumber ?? 0
      if (ra !== rb) return ra - rb
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      roundNumber: o.roundNumber ?? null,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt ? o.completedAt.toISOString() : null,
    }))

  /** @type {Array<Record<string, unknown>>} */
  const lines = []
  for (const line of session.lines) {
    if (line.cancelled) continue
    const item = line.menuItem
    if (!item || item.businessProfileId !== opts.businessProfileId) continue

    const variantOptionIds = asIdArray(line.variantOptionIds)
    const customizationIds = asIdArray(line.customizationIds)

    /** @type {string} */
    let unitPrice = item.price
    /** @type {unknown} */
    let modifiersSnapshot = { variantOptions: [], customizations: [] }

    try {
      const resolved = resolveCheckoutModifiers(
        item,
        variantOptionIds,
        customizationIds,
      )
      unitPrice = resolved.unitPrice
      modifiersSnapshot = resolved.modifiersSnapshot
    } catch {
      // Keep base price / empty modifiers if historical combo no longer resolves.
    }

    lines.push({
      id: line.id,
      kitchenOrderId: line.kitchenOrderId,
      menuItemId: line.menuItemId,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      quantity: line.quantity,
      unitPrice,
      vatPreset: item.vatPreset ?? 'standard',
      lineNote: line.lineNote,
      variantOptionIds,
      customizationIds,
      modifiersSnapshot,
      offerId: line.offerId ?? null,
      offerGroupKey: line.offerGroupKey ?? null,
      offerDiscount: line.offerDiscount ?? null,
      // Name kept even after the offer ends (deal header on the floor view).
      offerNameAr: line.offer?.nameAr ?? null,
      offerNameEn: line.offer?.nameEn ?? null,
    })
  }

  return {
    table: {
      id: session.table.id,
      name: session.table.name,
      status: session.table.status,
    },
    session: sessionFlags,
    waiterCall,
    rounds,
    lines,
  }
}
