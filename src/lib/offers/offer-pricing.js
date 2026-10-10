/**
 * Offers & Deals pricing engine — pure (client + server).
 *
 * The POS and the QR menu run it for display; checkout / E-Waiter submit run it
 * again on the server with freshly loaded offers, and the server result is the
 * only one that is saved (rules §23 — money as strings, shared helpers).
 *
 * Kinds:
 * - DISCOUNT     % or SAR (ex-VAT) off each unit, whole menu or TARGET items.
 * - BUY_X_GET_Y  automatic once the BUY items are in the cart; repeats per set
 *                (capped by maxPerOrder). BUY units are reserved first (most
 *                expensive), GET units are the cheapest remaining ones.
 * - COMBO        only when added as a deal (`deals`); fixed price per box,
 *                saving spread over the component lines.
 *
 * Each normal cart line gets at most one offer — the best one for the customer.
 *
 * Offer shape (from `mapOfferForPricing`):
 * {
 *   id, kind, discountType, discountValue, appliesToAllItems, comboPrice,
 *   maxPerOrder, remainingUses (null = unlimited),
 *   items: [{ id, role, menuItemId, quantity, discountPercent,
 *             allowedVariantOptions: [{ variantOptionId, groupId }] }]
 * }
 */

import { lineMatchesRuleVariants } from '@/lib/coupons/coupon-item-discount'
import {
  allocateOrderDiscount,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/** @param {number} n */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** @param {unknown} q */
function qty(q) {
  return Math.max(0, Math.round(Number(q)) || 0)
}

/**
 * Offer item → rule shape understood by `lineMatchesRuleVariants`.
 * @param {{ menuItemId: string, allowedVariantOptions?: Array<{ variantOptionId: string, groupId: string }> }} item
 */
function asRule(item) {
  return {
    menuItemId: item.menuItemId,
    allowedVariantOptions: (item.allowedVariantOptions ?? []).map((o) => ({
      variantOptionId: o.variantOptionId,
      variantOption: { id: o.variantOptionId, groupId: o.groupId },
    })),
  }
}

/**
 * @param {{ menuItemId: string, variantOptionIds?: string[] }} line
 * @param {{ menuItemId: string, allowedVariantOptions?: Array<{ variantOptionId: string, groupId: string }> }} item
 */
export function lineMatchesOfferItem(line, item) {
  if (line.menuItemId !== item.menuItemId) return false
  return lineMatchesRuleVariants(
    { ...line, quantity: 1, unitPrice: '0' },
    asRule(item),
  )
}

/**
 * Per-unit discount a DISCOUNT offer gives a line (0 when it does not apply).
 * @param {object} offer
 * @param {{ menuItemId: string, unitPrice: string, variantOptionIds?: string[] }} line
 */
export function discountOfferUnitDiscount(offer, line) {
  if (offer.kind !== 'DISCOUNT') return 0
  const applies =
    offer.appliesToAllItems === true ||
    (offer.items ?? []).some(
      (it) => it.role === 'TARGET' && lineMatchesOfferItem(line, it),
    )
  if (!applies) return 0
  const unit = parseMoney(line.unitPrice)
  const value = parseMoney(offer.discountValue)
  if (unit <= 0 || value <= 0) return 0
  if (offer.discountType === 'PERCENTAGE') {
    return round2((unit * Math.min(100, value)) / 100)
  }
  return round2(Math.min(value, unit))
}

/**
 * @param {Array<{ menuItemId: string, unitPrice: string, variantOptionIds?: string[] }>} lines
 * @param {number[]} pool units still free per line
 * @param {object} item offer item
 * @param {number} need
 * @param {'asc' | 'desc'} order
 * @returns {Map<number, number>} lineIndex → units taken (removed from pool)
 */
function takeUnits(lines, pool, item, need, order) {
  /** @type {Map<number, number>} */
  const taken = new Map()
  let remaining = need
  const idxs = lines
    .map((l, i) => i)
    .filter((i) => pool[i] > 0 && lineMatchesOfferItem(lines[i], item))
    .sort((a, b) => {
      const pa = parseMoney(lines[a].unitPrice)
      const pb = parseMoney(lines[b].unitPrice)
      if (pa !== pb) return order === 'desc' ? pb - pa : pa - pb
      return a - b
    })
  for (const i of idxs) {
    if (remaining <= 0) break
    const use = Math.min(pool[i], remaining)
    taken.set(i, use)
    pool[i] -= use
    remaining -= use
  }
  return taken
}

/**
 * @param {object} offer DISCOUNT
 * @param {Array<{ menuItemId: string, quantity: number, unitPrice: string, variantOptionIds?: string[] }>} lines
 * @param {boolean[]} claimed
 */
function evaluateDiscountOffer(offer, lines, claimed) {
  const amounts = lines.map(() => 0)
  /** @type {Array<{ i: number, unit: number }>} */
  const units = []
  lines.forEach((line, i) => {
    if (claimed[i]) return
    const unit = discountOfferUnitDiscount(offer, line)
    if (unit > 0) units.push({ i, unit })
  })
  units.sort((a, b) => b.unit - a.unit || a.i - b.i)
  let budget = offer.maxPerOrder == null ? Infinity : qty(offer.maxPerOrder)
  /** @type {Set<number>} */
  const involved = new Set()
  for (const { i, unit } of units) {
    if (budget <= 0) break
    const n = Math.min(qty(lines[i].quantity), budget)
    if (n <= 0) continue
    amounts[i] += n * unit
    budget -= n
    involved.add(i)
  }
  return { amounts, involved, sets: involved.size > 0 ? 1 : 0 }
}

/**
 * @param {object} offer BUY_X_GET_Y
 * @param {Array<{ menuItemId: string, quantity: number, unitPrice: string, variantOptionIds?: string[] }>} lines
 * @param {boolean[]} claimed
 */
function evaluateBuyGetOffer(offer, lines, claimed) {
  const amounts = lines.map(() => 0)
  /** @type {Set<number>} */
  const involved = new Set()
  const buys = (offer.items ?? []).filter((it) => it.role === 'BUY')
  const gets = (offer.items ?? []).filter((it) => it.role === 'GET')
  if (buys.length === 0 || gets.length === 0) {
    return { amounts, involved, sets: 0 }
  }
  const pool = lines.map((l, i) => (claimed[i] ? 0 : qty(l.quantity)))
  const maxSets = offer.maxPerOrder == null ? Infinity : qty(offer.maxPerOrder)
  let sets = 0

  while (sets < maxSets) {
    const before = [...pool]
    /** @type {Array<Map<number, number>>} */
    const reservations = []
    let buyOk = true
    for (const buy of buys) {
      const need = qty(buy.quantity)
      const taken = takeUnits(lines, pool, buy, need, 'desc')
      const got = [...taken.values()].reduce((a, b) => a + b, 0)
      if (need < 1 || got < need) {
        buyOk = false
        break
      }
      reservations.push(taken)
    }
    if (!buyOk) {
      pool.splice(0, pool.length, ...before)
      break
    }

    const setAmounts = lines.map(() => 0)
    let rewarded = false
    for (const get of gets) {
      const need = qty(get.quantity)
      const snapshot = [...pool]
      const taken = takeUnits(lines, pool, get, need, 'asc')
      const got = [...taken.values()].reduce((a, b) => a + b, 0)
      if (need < 1 || got < need) {
        // Missing GET item → this rule contributes nothing (same as coupons).
        pool.splice(0, pool.length, ...snapshot)
        continue
      }
      const percent = Math.min(100, Math.max(0, parseMoney(get.discountPercent ?? '100')))
      for (const [i, units] of taken) {
        setAmounts[i] += units * parseMoney(lines[i].unitPrice) * (percent / 100)
        involved.add(i)
      }
      rewarded = true
    }
    if (!rewarded) {
      pool.splice(0, pool.length, ...before)
      break
    }
    for (const taken of reservations) {
      for (const i of taken.keys()) involved.add(i)
    }
    setAmounts.forEach((a, i) => {
      amounts[i] += a
    })
    sets += 1
  }

  return { amounts, involved, sets }
}

/**
 * @param {number[]} amounts
 * @param {Array<{ quantity: number, unitPrice: string }>} lines
 */
function capToGross(amounts, lines) {
  return amounts.map((a, i) => {
    const gross = round2(qty(lines[i].quantity) * parseMoney(lines[i].unitPrice))
    return round2(Math.min(Math.max(0, a), gross))
  })
}

/**
 * @typedef {{
 *   menuItemId: string
 *   quantity: number
 *   unitPrice: string
 *   variantOptionIds?: string[]
 * }} OfferCartLine
 */

/**
 * @typedef {{
 *   offerId: string
 *   quantity: number
 *   components: Array<{ offerItemId: string, unitPrice: string, variantOptionIds?: string[] }>
 * }} OfferCartDeal
 */

/**
 * Price a cart against the active offers.
 *
 * @param {{
 *   lines: OfferCartLine[]
 *   deals?: OfferCartDeal[]
 *   offers: object[]
 * }} input
 */
export function priceCartWithOffers({ lines, deals = [], offers }) {
  const list = Array.isArray(lines) ? lines : []
  const active = Array.isArray(offers) ? offers : []
  const byId = new Map(active.map((o) => [o.id, o]))

  /** @type {Map<string, { quantity: number, discount: number }>} */
  const usage = new Map()
  const addUsage = (offerId, uses, discount) => {
    const prev = usage.get(offerId) ?? { quantity: 0, discount: 0 }
    usage.set(offerId, {
      quantity: prev.quantity + uses,
      discount: prev.discount + discount,
    })
  }

  // ---- Combo deals -------------------------------------------------------
  /** @type {Array<{ offerId: string, groupKey: string, quantity: number, components: Array<{ offerItemId: string, menuItemId: string, quantity: number, unitPrice: string, variantOptionIds: string[], discount: string }> }>} */
  const dealResults = []
  /** @type {Map<string, number>} */
  const boxesByOffer = new Map()

  for (const [index, deal] of (Array.isArray(deals) ? deals : []).entries()) {
    const offer = byId.get(deal.offerId)
    if (!offer || offer.kind !== 'COMBO') {
      return { ok: false, error: { code: 'OFFER_NOT_AVAILABLE', offerId: deal.offerId } }
    }
    const boxes = qty(deal.quantity)
    const items = (offer.items ?? []).filter((it) => it.role === 'COMBO_ITEM')
    const comps = Array.isArray(deal.components) ? deal.components : []
    if (boxes < 1 || items.length === 0 || comps.length !== items.length) {
      return { ok: false, error: { code: 'OFFER_DEAL_INVALID', offerId: offer.id } }
    }
    const lineSet = []
    for (const item of items) {
      const comp = comps.find((c) => c.offerItemId === item.id)
      if (
        !comp ||
        !lineMatchesOfferItem(
          { menuItemId: item.menuItemId, variantOptionIds: comp.variantOptionIds ?? [] },
          item,
        )
      ) {
        return { ok: false, error: { code: 'OFFER_DEAL_INVALID', offerId: offer.id } }
      }
      lineSet.push({
        offerItemId: item.id,
        menuItemId: item.menuItemId,
        quantity: qty(item.quantity) * boxes,
        unitPrice: String(comp.unitPrice ?? '0'),
        variantOptionIds: comp.variantOptionIds ?? [],
      })
    }
    const normalPerBox = lineSet.reduce(
      (sum, l) => sum + (l.quantity / boxes) * parseMoney(l.unitPrice),
      0,
    )
    const savings = round2(
      Math.max(0, normalPerBox - parseMoney(offer.comboPrice)) * boxes,
    )
    const split = allocateOrderDiscount(lineSet, decimalStringFromNumber(savings))
    dealResults.push({
      offerId: offer.id,
      groupKey: `${offer.id}:${index + 1}`,
      quantity: boxes,
      components: lineSet.map((l, i) => ({ ...l, discount: split[i] })),
    })
    boxesByOffer.set(offer.id, (boxesByOffer.get(offer.id) ?? 0) + boxes)
    addUsage(offer.id, boxes, parseMoney(decimalStringFromNumber(savings)))
  }

  for (const [offerId, boxes] of boxesByOffer) {
    const offer = byId.get(offerId)
    if (offer.maxPerOrder != null && boxes > qty(offer.maxPerOrder)) {
      return { ok: false, error: { code: 'OFFER_MAX_PER_ORDER', offerId, max: qty(offer.maxPerOrder) } }
    }
    if (offer.remainingUses != null && boxes > offer.remainingUses) {
      return { ok: false, error: { code: 'OFFER_LIMIT_REACHED', offerId } }
    }
  }

  // ---- Discount + Buy X Get Y on normal lines (best offer per line) -------
  const claimed = list.map(() => false)
  const lineDiscounts = list.map(() => 0)
  /** @type {Array<string | null>} */
  const lineOfferIds = list.map(() => null)
  const candidates = active.filter(
    (o) =>
      (o.kind === 'DISCOUNT' || o.kind === 'BUY_X_GET_Y') &&
      (o.remainingUses == null || o.remainingUses > 0),
  )
  const used = new Set()

  for (;;) {
    let best = null
    for (const offer of candidates) {
      if (used.has(offer.id)) continue
      const result =
        offer.kind === 'DISCOUNT'
          ? evaluateDiscountOffer(offer, list, claimed)
          : evaluateBuyGetOffer(offer, list, claimed)
      const amounts = capToGross(result.amounts, list)
      const total = round2(amounts.reduce((a, b) => a + b, 0))
      if (total > 0 && (!best || total > best.total)) {
        best = { offer, amounts, involved: result.involved, total }
      }
    }
    if (!best) break
    used.add(best.offer.id)
    for (const i of best.involved) {
      claimed[i] = true
      lineOfferIds[i] = best.offer.id
      lineDiscounts[i] = best.amounts[i]
    }
    addUsage(best.offer.id, 1, best.total)
  }

  const lineResults = list.map((line, i) => ({
    discount: decimalStringFromNumber(lineDiscounts[i]),
    offerId: lineOfferIds[i],
  }))

  let total = lineDiscounts.reduce((a, b) => a + b, 0)
  for (const d of dealResults) {
    for (const c of d.components) total += parseMoney(c.discount)
  }

  return {
    ok: true,
    lines: lineResults,
    deals: dealResults,
    usage: [...usage.entries()].map(([offerId, u]) => ({
      offerId,
      quantity: u.quantity,
      discountAmount: decimalStringFromNumber(u.discount),
    })),
    totalDiscount: decimalStringFromNumber(round2(total)),
    applied: dealResults.length > 0 || lineOfferIds.some(Boolean),
  }
}

/**
 * Display helper: discounted unit price for a menu item card (best DISCOUNT
 * offer only; BUY_X_GET_Y depends on the cart, so it is not a card price).
 *
 * @param {object[]} offers
 * @param {{ menuItemId: string, unitPrice: string, variantOptionIds?: string[] }} line
 * @returns {{ offerId: string, unitPrice: string } | null}
 */
export function bestDisplayDiscount(offers, line) {
  let best = null
  for (const offer of Array.isArray(offers) ? offers : []) {
    if (offer.kind !== 'DISCOUNT') continue
    if (offer.remainingUses != null && offer.remainingUses <= 0) continue
    const d = discountOfferUnitDiscount(offer, line)
    if (d > 0 && (!best || d > best.d)) best = { offerId: offer.id, d }
  }
  if (!best) return null
  return {
    offerId: best.offerId,
    unitPrice: decimalStringFromNumber(Math.max(0, parseMoney(line.unitPrice) - best.d)),
  }
}

/**
 * Menu item ids a DISCOUNT offer applies to (for "filter to offer items").
 * Null = the whole menu.
 * @param {object} offer
 * @returns {string[] | null}
 */
export function offerMenuItemIds(offer) {
  if (offer.kind === 'DISCOUNT' && offer.appliesToAllItems) return null
  return [...new Set((offer.items ?? []).map((it) => it.menuItemId))]
}
