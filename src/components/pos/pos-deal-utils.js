/**
 * POS helpers for COMBO deals (Offers & Deals): allowed variant options per
 * component, default choices, normal (pre-deal) price and cart entry building.
 *
 * Offer shape: `GET /api/auth/pos/menu` → `offers[]` (see map-offer-json).
 * Menu item shape: `GET /api/auth/pos/menu` → `items[]`.
 */

import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import {
  buildModifiersSnapshotFromItem,
  computeUnitPriceFromItem,
  optionIdsFromSelection,
} from '@/lib/menu/item-modifiers'

/** Max boxes in one deal cart entry (server schema: quantity ≤ 99). */
export const DEAL_ENTRY_MAX_QTY = 99

/**
 * @param {Record<string, unknown> | null | undefined} offer
 * @returns {Array<Record<string, any>>}
 */
export function comboItemsOf(offer) {
  return (Array.isArray(offer?.items) ? offer.items : []).filter(
    (it) => it?.role === 'COMBO_ITEM',
  )
}

/** @param {unknown} q */
function qtyOf(q) {
  return Math.max(1, Math.round(Number(q)) || 1)
}

/**
 * Options of one variant group the offer item allows. No restriction for the
 * group (or for the whole item) means every option is allowed.
 *
 * @param {Record<string, any>} offerItem
 * @param {{ id: string, options?: Array<Record<string, any>> }} group
 */
export function allowedGroupOptions(offerItem, group) {
  const options = Array.isArray(group?.options) ? group.options : []
  const allowedIds = new Set(
    (offerItem?.allowedVariantOptions ?? [])
      .filter((o) => o?.groupId === group.id)
      .map((o) => o.variantOptionId),
  )
  if (allowedIds.size === 0) return options
  return options.filter((o) => allowedIds.has(o.id))
}

/**
 * Default choice per group: the item's default option when allowed, else the
 * first allowed option.
 *
 * @param {Record<string, any>} offerItem
 * @param {Record<string, any> | undefined} menuItem
 * @returns {Record<string, string>}
 */
export function defaultComponentSelection(offerItem, menuItem) {
  /** @type {Record<string, string>} */
  const sel = {}
  for (const group of menuItem?.variantGroups ?? []) {
    const options = allowedGroupOptions(offerItem, group)
    const pick = options.find((o) => o.isDefault) ?? options[0]
    if (pick?.id) sel[group.id] = pick.id
  }
  return sel
}

/**
 * True when the cashier has to choose at least one option for this component.
 * @param {Record<string, any>} offerItem
 * @param {Record<string, any> | undefined} menuItem
 */
export function componentNeedsChoice(offerItem, menuItem) {
  return (menuItem?.variantGroups ?? []).some(
    (group) => allowedGroupOptions(offerItem, group).length > 1,
  )
}

/**
 * A COMBO offer the POS can sell right now (every component item is on the
 * menu with at least one allowed option per variant group, uses left).
 *
 * @param {Record<string, any>} offer
 * @param {Map<string, Record<string, any>>} itemsById
 */
export function dealIsSellable(offer, itemsById) {
  if (offer?.kind !== 'COMBO') return false
  if (offer.remainingUses != null && Number(offer.remainingUses) <= 0) {
    return false
  }
  if (parseMoney(offer.comboPrice) <= 0) return false
  const comps = comboItemsOf(offer)
  if (comps.length === 0) return false
  return comps.every((oi) => {
    const item = itemsById.get(oi.menuItemId)
    if (!item) return false
    return (item.variantGroups ?? []).every(
      (group) => allowedGroupOptions(oi, group).length > 0,
    )
  })
}

/**
 * Normal price of one box with default choices (for the struck-through price).
 * @param {Record<string, any>} offer
 * @param {Map<string, Record<string, any>>} itemsById
 */
export function dealNormalTotal(offer, itemsById) {
  let total = 0
  for (const oi of comboItemsOf(offer)) {
    const item = itemsById.get(oi.menuItemId)
    if (!item) continue
    const optionIds = optionIdsFromSelection(defaultComponentSelection(oi, item))
    total += qtyOf(oi.quantity) * parseMoney(computeUnitPriceFromItem(item, optionIds, []))
  }
  return decimalStringFromNumber(total)
}

/**
 * @typedef {{
 *   offerItemId: string
 *   menuItemId: string
 *   quantity: number
 *   variantOptionIds: string[]
 *   variantSelection: Record<string, string>
 *   unitPrice: string
 *   vatPreset: string
 *   nameAr: string
 *   nameEn: string
 *   imageUrl: string | null
 *   modifiersSnapshot: unknown
 * }} DealComponent
 */

/**
 * @typedef {{
 *   entryKey: string
 *   offerId: string
 *   nameAr: string
 *   nameEn: string
 *   imageUrl: string | null
 *   comboPrice: string
 *   quantity: number
 *   components: DealComponent[]
 * }} DealEntry
 */

/**
 * @param {Record<string, any>} offer
 * @param {Map<string, Record<string, any>>} itemsById
 * @param {Record<string, Record<string, string>>} [selections] offerItemId → groupId → optionId
 * @returns {DealComponent[]}
 */
export function buildDealComponents(offer, itemsById, selections = {}) {
  return comboItemsOf(offer).map((oi) => {
    const item = itemsById.get(oi.menuItemId) ?? {}
    const selection =
      selections[oi.id] ?? defaultComponentSelection(oi, item)
    const variantOptionIds = optionIdsFromSelection(selection)
    return {
      offerItemId: String(oi.id),
      menuItemId: String(oi.menuItemId),
      quantity: qtyOf(oi.quantity),
      variantOptionIds,
      variantSelection: selection,
      unitPrice: computeUnitPriceFromItem(item, variantOptionIds, []),
      vatPreset: String(item.vatPreset ?? 'standard'),
      nameAr: String(item.nameAr ?? oi.nameAr ?? ''),
      nameEn: String(item.nameEn ?? oi.nameEn ?? ''),
      imageUrl:
        typeof item.imageUrl === 'string' && item.imageUrl ? item.imageUrl : null,
      modifiersSnapshot: buildModifiersSnapshotFromItem(item, variantOptionIds, []),
    }
  })
}

/**
 * Same deal + same choices → same cart entry (quantity goes up).
 * @param {string} offerId
 * @param {Array<{ offerItemId: string, variantOptionIds: string[] }>} components
 */
export function dealEntryKey(offerId, components) {
  const parts = components
    .map((c) => `${c.offerItemId}:${[...c.variantOptionIds].sort().join(',')}`)
    .sort()
  return `deal|${offerId}|${parts.join('|')}`
}

/**
 * Max boxes of one offer per order (maxPerOrder and remaining uses).
 * @param {Record<string, any> | undefined} offer
 * @returns {number}
 */
export function dealOrderLimit(offer) {
  let limit = Infinity
  if (offer?.maxPerOrder != null) limit = Math.min(limit, Number(offer.maxPerOrder))
  if (offer?.remainingUses != null) {
    limit = Math.min(limit, Number(offer.remainingUses))
  }
  return Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Infinity
}
