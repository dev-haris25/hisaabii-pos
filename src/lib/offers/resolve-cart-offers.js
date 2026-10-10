import { z } from 'zod'

import { parseMoney } from '@/lib/invoices/invoice-compute-totals'
import { resolveCheckoutModifiers } from '@/lib/menu/resolve-checkout-modifiers'
import { loadActiveOffers } from '@/lib/offers/load-active-offers'
import { mapOfferForPricing } from '@/lib/offers/map-offer-json'
import { priceCartWithOffers } from '@/lib/offers/offer-pricing'
import { prisma } from '@/lib/prisma'

export const offerDealInputSchema = z.object({
  offerId: z.string().trim().min(1).max(64),
  quantity: z.coerce.number().int().min(1).max(99),
  components: z
    .array(
      z.object({
        offerItemId: z.string().trim().min(1).max(64),
        variantOptionIds: z.array(z.string().trim().min(1)).max(40).optional().default([]),
      }),
    )
    .min(1)
    .max(10),
})

export const offerDealsInputSchema = z.array(offerDealInputSchema).max(20)

const ERROR_MESSAGES = {
  OFFER_NOT_AVAILABLE: 'This offer is no longer available',
  OFFER_DEAL_INVALID: 'The deal items or options are not valid for this offer',
  OFFER_MAX_PER_ORDER: 'This order has more of this deal than the offer allows',
  OFFER_LIMIT_REACHED: 'This offer has reached its limit',
  OFFER_PRICES_CHANGED: 'Offer prices changed — please review the updated total',
  OFFERS_EXCLUSIVE_DISCOUNT:
    'Offers and deals cannot be combined with a coupon, loyalty points or a manual discount',
}

/** @param {string} code */
export function isOfferErrorCode(code) {
  return Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code)
}

/**
 * @param {keyof typeof ERROR_MESSAGES} code
 * @param {Record<string, unknown>} [extra]
 */
export function offerError(code, extra = {}) {
  return Object.assign(new Error(ERROR_MESSAGES[code] ?? 'Offer error'), {
    code,
    ...extra,
  })
}

/**
 * Price a cart (normal priced lines + requested deals) against live offers.
 * Deal components are resolved against the live menu (variants only — deal
 * components carry no extras). Throws an offer error with `code` on invalid
 * deals / limits.
 *
 * @param {{
 *   businessProfileId: string
 *   db?: import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma
 *   lines: Array<{ menuItemId: string, quantity: number, unitPrice: string, variantOptionIds?: string[] }>
 *   deals?: z.infer<typeof offerDealsInputSchema>
 *   lockIds?: string[]
 *   now?: Date
 * }} args
 */
export async function resolveCartOffers(args) {
  const db = args.db ?? prisma
  const deals = Array.isArray(args.deals) ? args.deals : []
  const offers = await loadActiveOffers({
    businessProfileId: args.businessProfileId,
    db,
    now: args.now,
    lockIds: args.lockIds,
  })
  const offerById = new Map(offers.map((o) => [o.id, o]))

  // Resolve deal component menu items + variant prices.
  const componentItemIds = new Set()
  for (const deal of deals) {
    const offer = offerById.get(deal.offerId)
    if (!offer || offer.kind !== 'COMBO') throw offerError('OFFER_NOT_AVAILABLE', { offerId: deal.offerId })
    for (const item of offer.items) componentItemIds.add(item.menuItemId)
  }
  const menuItems = componentItemIds.size
    ? await db.menuItem.findMany({
        where: {
          id: { in: [...componentItemIds] },
          businessProfileId: args.businessProfileId,
          active: true,
        },
        include: {
          variantGroups: {
            orderBy: { sortOrder: 'asc' },
            include: { options: { orderBy: { sortOrder: 'asc' } } },
          },
          customizations: { orderBy: { sortOrder: 'asc' } },
        },
      })
    : []
  const menuById = new Map(menuItems.map((m) => [m.id, m]))

  /** @type {Map<string, { item: any, resolved: ReturnType<typeof resolveCheckoutModifiers> }>} */
  const resolvedComponents = new Map()
  const engineDeals = deals.map((deal, d) => {
    const offer = offerById.get(deal.offerId)
    return {
      offerId: deal.offerId,
      quantity: deal.quantity,
      components: deal.components.map((comp, c) => {
        const offerItem = offer.items.find((it) => it.id === comp.offerItemId)
        const menuItem = offerItem ? menuById.get(offerItem.menuItemId) : null
        if (!offerItem || !menuItem) throw offerError('OFFER_DEAL_INVALID', { offerId: deal.offerId })
        let resolved
        try {
          resolved = resolveCheckoutModifiers(menuItem, comp.variantOptionIds, [])
        } catch {
          throw offerError('OFFER_DEAL_INVALID', { offerId: deal.offerId })
        }
        resolvedComponents.set(`${d}:${c}`, { item: menuItem, resolved })
        return {
          offerItemId: comp.offerItemId,
          unitPrice: resolved.unitPrice,
          variantOptionIds: resolved.variantOptionIds,
        }
      }),
    }
  })

  const pricing = priceCartWithOffers({
    lines: args.lines,
    deals: engineDeals,
    offers: offers.map(mapOfferForPricing),
  })
  if (!pricing.ok) {
    throw offerError(/** @type {any} */ (pricing.error.code), {
      offerId: pricing.error.offerId,
    })
  }

  const dealLines = []
  pricing.deals.forEach((deal, d) => {
    const request = deals[d]
    deal.components.forEach((comp) => {
      const c = request.components.findIndex((x) => x.offerItemId === comp.offerItemId)
      const { item, resolved } = resolvedComponents.get(`${d}:${c}`)
      dealLines.push({
        menuItemId: item.id,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        vatPreset: item.vatPreset,
        quantity: comp.quantity,
        unitPrice: resolved.unitPrice,
        variantOptionIds: resolved.variantOptionIds,
        customizationIds: [],
        modifiersSnapshot: resolved.modifiersSnapshot,
        lineNote: null,
        discount: comp.discount,
        offerId: deal.offerId,
        offerGroupKey: deal.groupKey,
      })
    })
  })

  return { offers, pricing, dealLines }
}

/**
 * Optional client check: the total offer discount the customer saw.
 * @param {string | null | undefined} expected
 * @param {string} actual
 */
export function offerDiscountMatches(expected, actual) {
  if (expected == null || String(expected).trim() === '') return true
  return Math.abs(parseMoney(expected) - parseMoney(actual)) < 0.005
}
