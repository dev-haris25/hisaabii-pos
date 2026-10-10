import { z } from 'zod'

import { parseMoney } from '@/lib/invoices/invoice-compute-totals'
import { comboHighestNormalTotal } from '@/lib/offers/combo-normal-total'
import { timeStringToMinute } from '@/lib/offers/offer-schedule'

export const OFFER_COMBO_MIN_ITEMS = 2
export const OFFER_COMBO_MAX_ITEMS = 3

const money = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^\d+(\.\d{1,4})?$/)

const optionalMoney = z
  .union([z.literal(''), z.null(), money])
  .optional()
  .transform((v) => (v == null || v === '' ? null : v))

const optionalInstant = z
  .union([z.string().trim().min(1), z.null(), z.literal('')])
  .optional()
  .transform((v, ctx) => {
    if (v == null || v === '') return null
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'INVALID_DATE' })
      return z.NEVER
    }
    return d
  })

const optionalTime = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => (v == null || v === '' ? null : v))

const optionalLimit = z
  .union([z.number().int().min(1).max(1_000_000), z.null()])
  .optional()
  .transform((v) => v ?? null)

const imageFields = {
  imageBase64: z.string().trim().max(15_000_000).optional(),
  imageMimeType: z.string().trim().max(64).optional(),
  clearImage: z.boolean().optional(),
  bannerBase64: z.string().trim().max(15_000_000).optional(),
  bannerMimeType: z.string().trim().max(64).optional(),
  clearBanner: z.boolean().optional(),
}

const offerItemSchema = z.object({
  role: z.enum(['TARGET', 'BUY', 'GET', 'COMBO_ITEM']),
  menuItemId: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(99).optional().default(1),
  discountPercent: optionalMoney,
  variantOptionIds: z.array(z.string().trim().min(1)).max(40).optional().default([]),
})

export const offerBodySchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  kind: z.enum(['DISCOUNT', 'BUY_X_GET_Y', 'COMBO']),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional().nullable(),
  discountValue: optionalMoney,
  appliesToAllItems: z.boolean().optional().default(false),
  comboPrice: optionalMoney,
  startsAt: optionalInstant,
  endsAt: optionalInstant,
  dailyStartTime: optionalTime,
  dailyEndTime: optionalTime,
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().default([]),
  totalUsageLimit: optionalLimit,
  dailyUsageLimit: optionalLimit,
  maxPerOrder: optionalLimit,
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  items: z.array(offerItemSchema).max(40).optional().default([]),
  ...imageFields,
})

/**
 * @param {string} code
 * @param {string} message
 */
function fail(code, message) {
  return { ok: false, code, message }
}

/**
 * Domain rules per offer kind (after zod). Menu-item ownership is checked
 * separately against the DB (`validateOfferMenuRefs`).
 *
 * @param {z.infer<typeof offerBodySchema>} d
 * @returns {{ ok: true, data: Record<string, unknown> } | { ok: false, code: string, message: string }}
 */
export function validateOfferDomain(d) {
  const items = d.items ?? []

  if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) {
    return fail('OFFER_DATE_RANGE_INVALID', 'End date must be after the start date')
  }
  const start = d.dailyStartTime == null ? null : timeStringToMinute(d.dailyStartTime)
  const end = d.dailyEndTime == null ? null : timeStringToMinute(d.dailyEndTime)
  if (
    (d.dailyStartTime != null && start == null) ||
    (d.dailyEndTime != null && end == null) ||
    (start == null) !== (end == null) ||
    (start != null && start === end)
  ) {
    return fail('OFFER_TIME_WINDOW_INVALID', 'Enter both a daily start and end time, and they must differ')
  }

  /** @type {Record<string, unknown>} */
  const base = {
    nameAr: d.nameAr,
    nameEn: d.nameEn?.trim() || null,
    kind: d.kind,
    startsAt: d.startsAt ?? null,
    endsAt: d.endsAt ?? null,
    dailyStartMinute: start,
    dailyEndMinute: end,
    weekdays: [...new Set(d.weekdays ?? [])].sort(),
    totalUsageLimit: d.totalUsageLimit,
    dailyUsageLimit: d.dailyUsageLimit,
    maxPerOrder: d.maxPerOrder,
    active: d.active,
    sortOrder: d.sortOrder,
    discountType: null,
    discountValue: null,
    appliesToAllItems: false,
    comboPrice: null,
  }

  if (d.kind === 'DISCOUNT') {
    if (!d.discountType) return fail('OFFER_DISCOUNT_TYPE_REQUIRED', 'Choose percentage or fixed amount')
    const value = parseMoney(d.discountValue)
    if (!d.discountValue || value <= 0) {
      return fail('OFFER_DISCOUNT_VALUE_INVALID', 'Discount must be greater than zero')
    }
    if (d.discountType === 'PERCENTAGE' && value > 100) {
      return fail('OFFER_PERCENT_OUT_OF_RANGE', 'Percentage must be between 0 and 100')
    }
    if (items.some((it) => it.role !== 'TARGET')) {
      return fail('OFFER_ITEMS_INVALID', 'Discount offers only take discounted items')
    }
    if (!d.appliesToAllItems && items.length === 0) {
      return fail('OFFER_TARGET_ITEMS_REQUIRED', 'Select at least one item, or apply to the whole menu')
    }
    return {
      ok: true,
      data: {
        ...base,
        discountType: d.discountType,
        discountValue: d.discountValue,
        appliesToAllItems: d.appliesToAllItems === true,
      },
      items: d.appliesToAllItems ? [] : items,
    }
  }

  if (d.kind === 'BUY_X_GET_Y') {
    const buys = items.filter((it) => it.role === 'BUY')
    const gets = items.filter((it) => it.role === 'GET')
    if (buys.length === 0 || gets.length === 0 || buys.length + gets.length !== items.length) {
      return fail('OFFER_BUY_GET_REQUIRED', 'Add at least one item to buy and one item to get')
    }
    for (const get of gets) {
      const p = get.discountPercent == null ? 100 : parseMoney(get.discountPercent)
      if (p <= 0 || p > 100) {
        return fail('OFFER_PERCENT_OUT_OF_RANGE', 'Percentage must be between 0 and 100')
      }
    }
    return {
      ok: true,
      data: base,
      items: items.map((it) =>
        it.role === 'GET' ? { ...it, discountPercent: it.discountPercent ?? '100' } : { ...it, discountPercent: null },
      ),
    }
  }

  // COMBO
  if (
    items.some((it) => it.role !== 'COMBO_ITEM') ||
    items.length < OFFER_COMBO_MIN_ITEMS ||
    items.length > OFFER_COMBO_MAX_ITEMS
  ) {
    return fail(
      'OFFER_COMBO_ITEMS_RANGE',
      `A deal needs ${OFFER_COMBO_MIN_ITEMS} to ${OFFER_COMBO_MAX_ITEMS} items`,
    )
  }
  if (!d.comboPrice || parseMoney(d.comboPrice) <= 0) {
    return fail('OFFER_COMBO_PRICE_INVALID', 'Deal price must be greater than zero')
  }
  return {
    ok: true,
    data: { ...base, comboPrice: d.comboPrice },
    items: items.map((it) => ({ ...it, discountPercent: null })),
  }
}

/**
 * Menu items + variant options must belong to this restaurant; combo price
 * must save money against the items' normal total at the highest-priced
 * allowed options (a cheaper choice just pays its normal price — the engine
 * never charges more than normal).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {{ kind: string, comboPrice?: string | null }} data
 * @param {Array<{ menuItemId: string, quantity: number, variantOptionIds?: string[] }>} items
 */
export async function validateOfferMenuRefs(db, businessProfileId, data, items) {
  if (items.length === 0) return { ok: true }
  const ids = [...new Set(items.map((it) => it.menuItemId))]
  const rows = await db.menuItem.findMany({
    where: { id: { in: ids }, businessProfileId, active: true },
    select: {
      id: true,
      price: true,
      variantGroups: {
        select: { options: { select: { id: true, priceChange: true } } },
      },
    },
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const it of items) {
    const row = byId.get(it.menuItemId)
    if (!row) return fail('OFFER_ITEM_NOT_FOUND', 'One or more selected items are unavailable')
    const optionIds = new Set(
      row.variantGroups.flatMap((g) => g.options.map((o) => o.id)),
    )
    if ((it.variantOptionIds ?? []).some((id) => !optionIds.has(id))) {
      return fail('OFFER_VARIANT_INVALID', 'One or more selected options are invalid')
    }
  }
  if (data.kind === 'COMBO') {
    const normal = comboHighestNormalTotal(items, byId) ?? 0
    if (parseMoney(data.comboPrice) >= normal) {
      return fail('OFFER_COMBO_NO_SAVINGS', 'The deal price must be lower than the items’ normal total at their highest-priced allowed options')
    }
  }
  return { ok: true }
}
