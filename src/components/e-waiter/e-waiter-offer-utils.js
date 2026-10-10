/**
 * Offers & Deals helpers for the public QR menu (E-Waiter).
 * Display-only: the server re-prices every round with fresh offers.
 * All money goes through the shared invoice helpers (rules §23).
 */

import {
  computeLineAmounts,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { computeUnitPriceFromItem } from '@/lib/menu/item-modifiers'
import { priceCartWithOffers } from '@/lib/offers/offer-pricing'

/**
 * @param {unknown} row
 * @param {'ar' | 'en'} locale
 */
export function offerDisplayName(row, locale) {
  if (locale === 'ar') return String(row?.nameAr ?? '')
  return String(row?.nameEn ?? '').trim() || String(row?.nameAr ?? '')
}

/**
 * Offer still has uses left (null = unlimited).
 * @param {Record<string, unknown>} offer
 */
export function offerHasUsesLeft(offer) {
  return offer?.remainingUses == null || Number(offer.remainingUses) > 0
}

/**
 * Max deal boxes the guest may put in one order (null = no cap).
 * @param {Record<string, unknown>} offer
 * @returns {number | null}
 */
export function dealBoxCap(offer) {
  const caps = []
  if (offer?.maxPerOrder != null) caps.push(Number(offer.maxPerOrder))
  if (offer?.remainingUses != null) caps.push(Number(offer.remainingUses))
  const valid = caps.filter((n) => Number.isFinite(n))
  return valid.length > 0 ? Math.max(0, Math.min(...valid)) : null
}

/**
 * VAT-inclusive totals for one line, with and without its offer discount.
 *
 * @param {{ quantity: number, unitPrice: string, vatPreset?: string, discount?: string | null }} line
 */
export function lineInclusiveAmounts(line) {
  const base = {
    quantity: Number(line.quantity) || 0,
    unitPrice: String(line.unitPrice ?? '0'),
    vatPreset: String(line.vatPreset ?? 'standard'),
  }
  const gross = computeLineAmounts({ ...base, discount: '0' }).lineTotal
  const net = computeLineAmounts({
    ...base,
    discount: String(line.discount ?? '0'),
  }).lineTotal
  return { grossIncl: gross, netIncl: net }
}

/**
 * Options of a variant group the offer item allows (empty constraint = all).
 *
 * @param {Record<string, unknown>} offerItem
 * @param {Record<string, unknown>} group
 * @returns {Array<Record<string, unknown>>}
 */
export function allowedOptionsForGroup(offerItem, group) {
  const options = /** @type {Array<Record<string, unknown>>} */ (
    Array.isArray(group?.options) ? group.options : []
  )
  const allowed = (
    /** @type {Array<{ variantOptionId: string, groupId: string }>} */ (
      offerItem?.allowedVariantOptions ?? []
    )
  )
    .filter((o) => o.groupId === group.id)
    .map((o) => o.variantOptionId)
  if (allowed.length === 0) return options
  return options.filter((o) => allowed.includes(String(o.id)))
}

/**
 * Default per-group selection for an offer item: the menu default when it is
 * allowed, otherwise the first allowed option.
 *
 * @param {Record<string, unknown>} offerItem
 * @param {Record<string, unknown>} menuItem
 * @returns {Record<string, string>}
 */
export function defaultOfferItemSelection(offerItem, menuItem) {
  /** @type {Record<string, string>} */
  const sel = {}
  for (const group of /** @type {Array<Record<string, unknown>>} */ (
    menuItem?.variantGroups ?? []
  )) {
    const opts = allowedOptionsForGroup(offerItem, group)
    const pick = opts.find((o) => o.isDefault) ?? opts[0]
    if (pick?.id) sel[String(group.id)] = String(pick.id)
  }
  return sel
}

/**
 * @param {Record<string, unknown>} offerItem
 * @param {Record<string, unknown>} menuItem
 */
export function offerItemNeedsChoice(offerItem, menuItem) {
  return (
    /** @type {Array<Record<string, unknown>>} */ (menuItem?.variantGroups ?? [])
  ).some((group) => allowedOptionsForGroup(offerItem, group).length > 1)
}

/**
 * @param {Record<string, unknown>} offer
 */
export function comboItemsOf(offer) {
  return (
    /** @type {Array<Record<string, unknown>>} */ (offer?.items ?? [])
  ).filter((it) => it.role === 'COMBO_ITEM')
}

/**
 * @param {Record<string, unknown>} offer
 * @param {Map<string, Record<string, unknown>>} itemsById
 */
export function dealNeedsChoice(offer, itemsById) {
  return comboItemsOf(offer).some((it) => {
    const menuItem = itemsById.get(String(it.menuItemId))
    return menuItem ? offerItemNeedsChoice(it, menuItem) : false
  })
}

/**
 * Selected option names for display.
 *
 * @param {Record<string, unknown>} menuItem
 * @param {string[]} optionIds
 * @param {'ar' | 'en'} locale
 */
export function optionNamesFor(menuItem, optionIds, locale) {
  const wanted = new Set(optionIds)
  /** @type {string[]} */
  const names = []
  for (const group of /** @type {Array<Record<string, unknown>>} */ (
    menuItem?.variantGroups ?? []
  )) {
    for (const opt of /** @type {Array<Record<string, unknown>>} */ (
      group.options ?? []
    )) {
      if (wanted.has(String(opt.id))) names.push(offerDisplayName(opt, locale))
    }
  }
  return names.filter(Boolean)
}

/**
 * Deal (cart entry) for a COMBO offer. Returns null when an item is no longer
 * on the menu.
 *
 * @param {Record<string, unknown>} offer
 * @param {Map<string, Record<string, unknown>>} itemsById
 * @param {Record<string, Record<string, string>>} [selections] offerItemId → group → option
 */
export function buildDealDraft(offer, itemsById, selections = {}) {
  const comps = comboItemsOf(offer)
  if (comps.length === 0) return null
  const components = []
  for (const it of comps) {
    const menuItem = itemsById.get(String(it.menuItemId))
    if (!menuItem) return null
    const sel = selections[String(it.id)] ?? defaultOfferItemSelection(it, menuItem)
    const variantOptionIds = Object.values(sel).filter(Boolean).sort()
    components.push({
      offerItemId: String(it.id),
      menuItemId: String(it.menuItemId),
      nameAr: menuItem.nameAr,
      nameEn: menuItem.nameEn,
      quantity: Math.max(1, Number(it.quantity) || 1),
      variantOptionIds,
      unitPrice: computeUnitPriceFromItem(menuItem, variantOptionIds, []),
      vatPreset: String(menuItem.vatPreset ?? 'standard'),
    })
  }
  const key = `${offer.id}|${components
    .map((c) => `${c.offerItemId}:${c.variantOptionIds.join(',')}`)
    .join('|')}`
  return { key, offerId: String(offer.id), components }
}

/**
 * Price the guest cart (normal lines + deals) with the shared engine and turn
 * the result into VAT-inclusive display amounts.
 *
 * @param {{
 *   lines: Array<{ menuItemId: string, quantity: number, unitPrice: string, optionIds?: string[], vatPreset?: string }>
 *   deals: Array<{ offerId: string, quantity: number, components: Array<{ offerItemId: string, unitPrice: string, variantOptionIds: string[], vatPreset?: string }> }>
 *   offers: Array<Record<string, unknown>>
 * }} input
 */
export function priceGuestCart({ lines, deals, offers }) {
  const result = priceCartWithOffers({
    lines: lines.map((l) => ({
      menuItemId: String(l.menuItemId),
      quantity: Number(l.quantity) || 0,
      unitPrice: String(l.unitPrice ?? '0'),
      variantOptionIds: Array.isArray(l.optionIds) ? l.optionIds : [],
    })),
    deals: deals.map((d) => ({
      offerId: d.offerId,
      quantity: Number(d.quantity) || 0,
      components: d.components.map((c) => ({
        offerItemId: c.offerItemId,
        unitPrice: c.unitPrice,
        variantOptionIds: c.variantOptionIds,
      })),
    })),
    offers,
  })
  const ok = result.ok === true

  const lineRows = lines.map((l, i) => {
    const r = ok ? result.lines[i] : null
    const amounts = lineInclusiveAmounts({
      quantity: Number(l.quantity) || 0,
      unitPrice: String(l.unitPrice ?? '0'),
      vatPreset: l.vatPreset,
      discount: r?.offerId ? r.discount : '0',
    })
    return { ...amounts, offerId: r?.offerId ?? null }
  })

  const dealRows = deals.map((d, j) => {
    const priced = ok ? result.deals[j] : null
    let grossIncl = 0
    let netIncl = 0
    for (const c of d.components) {
      const pc = priced?.components.find((x) => x.offerItemId === c.offerItemId)
      const perBox = Number(
        /** @type {{ quantity?: number }} */ (c).quantity ?? 1,
      )
      const amounts = lineInclusiveAmounts({
        quantity: pc ? pc.quantity : perBox * (Number(d.quantity) || 0),
        unitPrice: c.unitPrice,
        vatPreset: c.vatPreset,
        discount: pc ? pc.discount : '0',
      })
      grossIncl += amounts.grossIncl
      netIncl += amounts.netIncl
    }
    return { grossIncl, netIncl }
  })

  const grossIncl =
    lineRows.reduce((s, r) => s + r.grossIncl, 0) +
    dealRows.reduce((s, r) => s + r.grossIncl, 0)
  const netIncl =
    lineRows.reduce((s, r) => s + r.netIncl, 0) +
    dealRows.reduce((s, r) => s + r.netIncl, 0)

  return {
    ok,
    error: ok ? null : (result.error ?? { code: 'OFFER_NOT_AVAILABLE' }),
    lineRows,
    dealRows,
    grossIncl: decimalStringFromNumber(grossIncl),
    netIncl: decimalStringFromNumber(netIncl),
    savingsIncl: decimalStringFromNumber(Math.max(0, grossIncl - netIncl)),
    applied: ok && result.applied === true,
    totalDiscount: ok ? String(result.totalDiscount) : '0.00',
  }
}

/**
 * VAT-inclusive price of one deal box at the given selections.
 * Null when the engine rejects it (exhausted, invalid).
 *
 * @param {Record<string, unknown>} offer
 * @param {Map<string, Record<string, unknown>>} itemsById
 * @param {Array<Record<string, unknown>>} offers
 */
export function dealBoxDisplayPrice(offer, itemsById, offers) {
  const draft = buildDealDraft(offer, itemsById)
  if (!draft) return null
  const priced = priceGuestCart({
    lines: [],
    deals: [{ ...draft, quantity: 1 }],
    offers,
  })
  if (!priced.ok) return null
  return {
    grossIncl: decimalStringFromNumber(priced.dealRows[0].grossIncl),
    netIncl: decimalStringFromNumber(priced.dealRows[0].netIncl),
  }
}

/**
 * Offer discount (ex-VAT total) the engine expects for a set of normal lines —
 * sent as `expectedOfferDiscount` when editing a pending round.
 *
 * @param {Array<Record<string, unknown>>} lines round lines (menu item data included)
 * @param {Array<Record<string, unknown>>} offers
 * @returns {string | null}
 */
export function expectedOfferDiscountForLines(lines, offers) {
  const result = priceCartWithOffers({
    lines: lines.map((line) => {
      const optionIds = /** @type {string[]} */ (
        line.variantOptionIds ?? line.optionIds ?? []
      )
      return {
        menuItemId: String(line.menuItemId),
        quantity: Number(line.quantity) || 0,
        unitPrice: computeUnitPriceFromItem(
          line,
          optionIds,
          /** @type {string[]} */ (line.customizationIds ?? []),
        ),
        variantOptionIds: optionIds,
      }
    }),
    deals: [],
    offers,
  })
  if (!result.ok || !result.applied) return null
  return parseMoney(result.totalDiscount) > 0 ? String(result.totalDiscount) : null
}

/** Offer error codes that mean "offers changed — refresh and review". */
export const OFFER_REFRESH_CODES = new Set([
  'OFFER_PRICES_CHANGED',
  'OFFER_NOT_AVAILABLE',
  'OFFER_LIMIT_REACHED',
  'OFFER_MAX_PER_ORDER',
  'OFFER_DEAL_INVALID',
])
