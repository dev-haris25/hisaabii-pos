import { minuteToTimeString } from '@/lib/offers/offer-schedule'

/**
 * @param {any} item offer item row (with allowedVariantOptions → variantOption)
 */
function mapItemForPricing(item) {
  return {
    id: item.id,
    role: item.role,
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    discountPercent: item.discountPercent ?? null,
    allowedVariantOptions: (item.allowedVariantOptions ?? [])
      .filter((o) => o.variantOption)
      .map((o) => ({
        variantOptionId: o.variantOptionId,
        groupId: o.variantOption.groupId,
      })),
  }
}

/**
 * Engine shape (`priceCartWithOffers`).
 * @param {any} offer row from `loadActiveOffers`
 */
export function mapOfferForPricing(offer) {
  return {
    id: offer.id,
    kind: offer.kind,
    discountType: offer.discountType ?? null,
    discountValue: offer.discountValue ?? null,
    appliesToAllItems: offer.appliesToAllItems === true,
    comboPrice: offer.comboPrice ?? null,
    maxPerOrder: offer.maxPerOrder ?? null,
    remainingUses:
      typeof offer.remainingUses === 'number' ? offer.remainingUses : null,
    items: (offer.items ?? []).map(mapItemForPricing),
  }
}

/**
 * @param {'pos' | 'public'} audience
 * @param {{ id: string, updatedAt: Date }} offer
 * @param {'banner' | 'image'} kind
 * @param {string} [slug]
 */
function offerImageUrl(audience, offer, kind, slug) {
  const t = encodeURIComponent(offer.updatedAt.toISOString())
  if (audience === 'public') {
    return `/api/public/offers/${encodeURIComponent(slug ?? '')}/${offer.id}/image?kind=${kind}&t=${t}`
  }
  return `/api/auth/pos/offers/${offer.id}/image?kind=${kind}&t=${t}`
}

/**
 * Active offer for the POS / QR menu (pricing fields + display fields).
 * @param {any} offer row from `loadActiveOffers`
 * @param {{ audience: 'pos' | 'public', slug?: string }} opts
 */
export function mapOfferForClient(offer, opts) {
  return {
    ...mapOfferForPricing(offer),
    nameAr: offer.nameAr,
    nameEn: offer.nameEn ?? null,
    endsAt: offer.endsAt ? offer.endsAt.toISOString() : null,
    bannerUrl: offer.bannerImagePath
      ? offerImageUrl(opts.audience, offer, 'banner', opts.slug)
      : null,
    imageUrl: offer.imagePath
      ? offerImageUrl(opts.audience, offer, 'image', opts.slug)
      : null,
    items: (offer.items ?? []).map((item) => ({
      ...mapItemForPricing(item),
      nameAr: item.menuItem?.nameAr ?? '',
      nameEn: item.menuItem?.nameEn ?? null,
    })),
  }
}

/**
 * Admin list / form JSON.
 * @param {any} offer row with items (+ menuItem, allowedVariantOptions)
 * @param {{ usedTotal?: number, usedToday?: number, liveNow?: boolean }} [extra]
 */
export function mapOfferAdminJson(offer, extra = {}) {
  return {
    id: offer.id,
    nameAr: offer.nameAr,
    nameEn: offer.nameEn ?? null,
    kind: offer.kind,
    discountType: offer.discountType ?? null,
    discountValue: offer.discountValue ?? null,
    appliesToAllItems: offer.appliesToAllItems === true,
    comboPrice: offer.comboPrice ?? null,
    startsAt: offer.startsAt ? offer.startsAt.toISOString() : null,
    endsAt: offer.endsAt ? offer.endsAt.toISOString() : null,
    dailyStartTime: minuteToTimeString(offer.dailyStartMinute),
    dailyEndTime: minuteToTimeString(offer.dailyEndMinute),
    weekdays: Array.isArray(offer.weekdays) ? offer.weekdays : [],
    totalUsageLimit: offer.totalUsageLimit ?? null,
    dailyUsageLimit: offer.dailyUsageLimit ?? null,
    maxPerOrder: offer.maxPerOrder ?? null,
    active: offer.active === true,
    sortOrder: offer.sortOrder ?? 0,
    bannerUrl: offer.bannerImagePath ? offerImageUrl('pos', offer, 'banner') : null,
    imageUrl: offer.imagePath ? offerImageUrl('pos', offer, 'image') : null,
    usedTotal: extra.usedTotal ?? 0,
    usedToday: extra.usedToday ?? 0,
    liveNow: extra.liveNow === true,
    items: (offer.items ?? []).map((item) => ({
      id: item.id,
      role: item.role,
      menuItemId: item.menuItemId,
      menuItemNameAr: item.menuItem?.nameAr ?? '',
      menuItemNameEn: item.menuItem?.nameEn ?? null,
      menuItemActive: item.menuItem?.active !== false,
      quantity: item.quantity,
      discountPercent: item.discountPercent ?? null,
      variantOptionIds: (item.allowedVariantOptions ?? []).map((o) => o.variantOptionId),
    })),
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  }
}
