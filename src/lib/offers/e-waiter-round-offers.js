import {
  isOfferErrorCode,
  offerError,
  resolveCartOffers,
} from '@/lib/offers/resolve-cart-offers'

/**
 * Price an E-Waiter round with offers inside the round's transaction.
 * Prices are locked on the TableSessionLines (kept at settle, rules agreed
 * 2026-10-10), so the authoritative pass runs under offer row locks.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   businessProfileId: string
 *   resolvedLines: Array<{ menuItemId: string, quantity: number, unitPrice: string, variantOptionIds: string[] }>
 *   deals?: Array<{ offerId: string, quantity: number, components: Array<{ offerItemId: string, variantOptionIds?: string[] }> }>
 * }} args
 */
export async function priceEWaiterRoundInTx(tx, args) {
  const first = await resolveCartOffers({
    businessProfileId: args.businessProfileId,
    db: tx,
    lines: args.resolvedLines,
    deals: args.deals ?? [],
  })
  if (!first.pricing.applied) return first
  const locked = await resolveCartOffers({
    businessProfileId: args.businessProfileId,
    db: tx,
    lines: args.resolvedLines,
    deals: args.deals ?? [],
    lockIds: first.pricing.usage.map((u) => u.offerId),
  })
  if (locked.pricing.totalDiscount !== first.pricing.totalDiscount) {
    throw offerError('OFFER_PRICES_CHANGED')
  }
  return locked
}

/**
 * TableSessionLine payloads (normal lines first, then deal components).
 *
 * @param {Array<{
 *   menuItemId: string
 *   nameAr: string
 *   nameEn: string | null
 *   quantity: number
 *   lineNote: string | null
 *   variantOptionIds: string[]
 *   customizationIds: string[]
 *   modifiersSnapshot: unknown
 * }>} resolvedLines
 * @param {Awaited<ReturnType<typeof resolveCartOffers>>} priced
 */
export function roundLinesWithOffers(resolvedLines, priced) {
  return [
    ...resolvedLines.map((line, i) => {
      const r = priced.pricing.lines[i]
      return {
        ...line,
        offerId: r?.offerId ?? null,
        offerGroupKey: null,
        offerDiscount: r?.offerId ? r.discount : null,
      }
    }),
    ...priced.dealLines.map((d) => ({
      menuItemId: d.menuItemId,
      nameAr: d.nameAr,
      nameEn: d.nameEn,
      quantity: d.quantity,
      lineNote: null,
      variantOptionIds: d.variantOptionIds,
      customizationIds: [],
      modifiersSnapshot: d.modifiersSnapshot,
      offerId: d.offerId,
      offerGroupKey: d.offerGroupKey,
      offerDiscount: d.discount,
    })),
  ]
}

/**
 * Map a thrown offer error to the E-Waiter `{ ok:false }` result shape.
 * @param {unknown} err
 */
export function eWaiterOfferErrorResult(err) {
  const code =
    err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
  if (!isOfferErrorCode(code)) return null
  return {
    ok: false,
    status: 409,
    code,
    message: err instanceof Error ? err.message : 'Offer error',
  }
}
