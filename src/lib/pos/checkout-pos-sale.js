import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import {
  computeInvoiceTotals,
  decimalStringFromNumber,
  parseMoney,
  allocateOrderDiscount,
} from '@/lib/invoices/invoice-compute-totals'
import {
  checkCouponEligibility,
  mapCouponCalcReasonToError,
} from '@/lib/coupons/check-coupon-eligibility'
import { computeCouponDiscountForPricedLines } from '@/lib/coupons/compute-coupon-discount-for-priced-lines'
import {
  incrementBatchCouponCodeUsageGuarded,
  incrementSharedCouponUsageGuarded,
} from '@/lib/coupons/increment-coupon-usage-guarded'
import {
  normalizeCouponCodeInput,
  resolveCouponCode,
} from '@/lib/coupons/resolve-coupon-code'
import { orderVatInclusiveSubtotalFromLines } from '@/lib/coupons/coupon-order-discount'
import {
  allocateLoyaltyRedeemDiscount,
  computeLoyaltyRedeemCeilings,
  computeRedeemableValueInCart,
  pointsToRedeemMoney,
} from '@/lib/loyalty/compute-loyalty-redeem-ceilings'
import { decrementLoyaltyBalanceGuarded } from '@/lib/loyalty/decrement-loyalty-balance-guarded'
import { loadOwnedLoyaltyAccount } from '@/lib/loyalty/load-owned-loyalty-account'
import {
  checkLoyaltyMinOrderValue,
  checkLoyaltyRedeemEligibility,
  validateLoyaltyRedeemAmount,
} from '@/lib/loyalty/loyalty-redeem-eligibility'
import { menuItemInclude } from '@/lib/menu/map-menu-json'
import { resolveCheckoutModifiers } from '@/lib/menu/resolve-checkout-modifiers'
import { createKitchenOrderInTx } from '@/lib/orders/create-kitchen-order'
import {
  isDiscountWithinCap,
  isValidDiscountPercent,
  orderDiscountMoneyFromPercent,
} from '@/lib/pos/discount-cap'
import { getOrCreateBusinessSettings } from '@/lib/settings/get-or-create-business-settings'
import { excludeBulkStockNeeds } from '@/lib/stock/exclude-bulk-stock-needs'
import {
  aggregateRecipeStockNeeds,
  loadRecipesByMenuItemIds,
} from '@/lib/stock/recipe-stock-needs'
import { prisma } from '@/lib/prisma'
import { humanizeZatcaError } from '@/lib/zatca/humanize-zatca-error'
import { runInvoiceZatcaSend } from '@/lib/zatca/run-invoice-zatca-send'
import { emitZatcaReportFailed } from '@/lib/notifications/emit-zatca-report-failed'
import { z } from 'zod'

const moneyOptionalSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/)
  .optional()
  .nullable()

const checkoutLineSchema = z.object({
  menuItemId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(999),
  variantOptionIds: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  customizationIds: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  lineNote: z.string().trim().max(300).optional().nullable(),
})

export const posCheckoutBodySchema = z.object({
  lines: z.array(checkoutLineSchema).min(1).max(100),
  paymentMethod: z.enum(['cash', 'card']),
  amountTendered: moneyOptionalSchema,
  /** Order-level discount percent (0–100); converted to SAR then allocated by gross share. */
  discount: moneyOptionalSchema,
  /** Typed coupon code — mutually exclusive with `discount` and loyalty redeem. */
  couponCode: z.string().trim().min(1).max(64).optional().nullable(),
  /** Linked loyalty account for redeem — mutually exclusive with coupon / manual discount. */
  loyaltyAccountId: z.string().trim().min(1).max(64).optional().nullable(),
  /** Points to redeem (money-string). Requires loyaltyAccountId. */
  loyaltyRedeemPoints: moneyOptionalSchema,
  notes: z.string().trim().max(500).optional().nullable(),
  /** When restaurant allows negative stock, cashier confirms override. */
  allowNegativeStock: z.boolean().optional(),
  /** When kitchen stock mode is on and an item has no open kitchen stock, confirm deduct from main. */
  allowMainStockIfNoKitchenStock: z.boolean().optional(),
  /** @deprecated use allowMainStockIfNoKitchenStock */
  allowMainStockIfNoAllotment: z.boolean().optional(),
  /** Desktop till id for hardware binding / audit. */
  tillId: z.string().trim().min(1).max(64).optional().nullable(),
})

/**
 * @param {string} code
 * @param {string} message
 */
function throwCheckoutError(code, message) {
  throw Object.assign(new Error(message), { code })
}

/**
 * @param {string | undefined} reason
 */
function throwLoyaltyAmountCheckError(reason) {
  if (reason === 'not_positive') {
    throwCheckoutError(
      'LOYALTY_REDEEM_AMOUNT_NOT_POSITIVE',
      'Redeem points must be greater than zero',
    )
  }
  if (reason === 'exceeds_ceiling') {
    throwCheckoutError(
      'LOYALTY_REDEEM_EXCEEDS_CEILING',
      'Redeem points exceed the allowed ceiling for this order',
    )
  }
  throwCheckoutError(
    'LOYALTY_REDEEM_AMOUNT_INVALID',
    'Redeem points amount is invalid',
  )
}

/**
 * Fresh redeemable menu-item ids for this restaurant (never cached).
 *
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} db
 * @returns {Promise<string[]>}
 */
async function loadRedeemableMenuItemIds(businessProfileId, db) {
  const rows = await db.menuItem.findMany({
    where: {
      businessProfileId,
      loyaltyRedeemable: true,
      active: true,
    },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

/**
 * Human-facing POS invoice number, e.g. INV-0001.
 * @param {number | string} n
 * @param {string} [prefix]
 * @param {number} [padding]
 */
export function formatInvoiceNumber(n, prefix = 'INV-', padding = 4) {
  const num = Number.parseInt(String(n), 10)
  const pad = Math.max(1, Math.min(10, Number(padding) || 4))
  if (!Number.isFinite(num) || num < 1) {
    return `${prefix}${String(1).padStart(pad, '0')}`
  }
  return `${prefix}${String(num).padStart(pad, '0')}`
}

/**
 * Atomically allocate the next sequential invoice number for a restaurant.
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @returns {Promise<string>} e.g. INV-0001
 */
async function allocateInvoiceNumber(businessProfileId, tx) {
  const settings = await tx.businessSettings.findUnique({
    where: { businessProfileId },
    select: { invoicePrefix: true, numberPadding: true },
  })
  const row = await tx.invoiceCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return formatInvoiceNumber(
    row.lastNumber,
    settings?.invoicePrefix || 'INV-',
    settings?.numberPadding ?? 4,
  )
}

/**
 * Create completed simplified invoice, sign + report to ZATCA (Phase-2 QR).
 *
 * @param {{
 *   profileId: string
 *   staffId: string
 *   body: z.infer<typeof posCheckoutBodySchema>
 * }} opts
 */
export async function checkoutPosSale({ profileId, staffId, body }) {
  const profile = await prisma.businessProfile.findUnique({
    where: { id: profileId },
  })
  if (!profile?.onboardingCompletedAt) {
    throw Object.assign(new Error('Restaurant profile incomplete'), {
      code: 'BUSINESS_PROFILE_REQUIRED',
    })
  }

  const device = await prisma.zatcaDevice.findUnique({
    where: { businessProfileId: profileId },
  })
  if (!device?.productionCsid) {
    throw Object.assign(new Error('ZATCA not onboarded'), {
      code: 'ZATCA_NOT_ONBOARDED',
    })
  }

  const itemIds = [...new Set(body.lines.map((l) => l.menuItemId))]
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: itemIds },
      businessProfileId: profileId,
      active: true,
    },
    include: menuItemInclude,
  })
  /** @type {Map<string, (typeof menuItems)[number]>} */
  const byId = new Map(menuItems.map((m) => [m.id, m]))
  for (const line of body.lines) {
    if (!byId.has(line.menuItemId)) {
      throw Object.assign(new Error('Invalid menu item'), {
        code: 'INVALID_MENU_ITEM',
      })
    }
  }

  const pricedLines = body.lines.map((l) => {
    const item = byId.get(l.menuItemId)
    const resolved = resolveCheckoutModifiers(
      item,
      l.variantOptionIds,
      l.customizationIds,
    )
    return {
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      unitPrice: resolved.unitPrice,
      vatPreset: item.vatPreset,
      variantOptionIds: resolved.variantOptionIds,
      modifiersSnapshot: resolved.modifiersSnapshot,
      lineNote: l.lineNote?.trim() || null,
    }
  })

  const bizSettings = await getOrCreateBusinessSettings(profileId)
  const recipesByMenuItemId = await loadRecipesByMenuItemIds(
    prisma,
    profileId,
    itemIds,
  )
  const { needs } = aggregateRecipeStockNeeds(
    body.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
    recipesByMenuItemId,
  )

  const fromMain = await excludeBulkStockNeeds(prisma, profileId, needs)
  const shortfalls = fromMain.filter((n) => n.shortfall)
  if (shortfalls.length > 0) {
    if (bizSettings.allowNegativeStock === true) {
      // Restaurant already allows negative stock — continue without a confirm modal.
    } else if (body.allowNegativeStock === true) {
      // Cashier confirmed via POS modal: persist the restaurant setting, then continue.
      await prisma.businessSettings.upsert({
        where: { businessProfileId: profileId },
        create: {
          businessProfileId: profileId,
          allowNegativeStock: true,
        },
        update: { allowNegativeStock: true },
      })
    } else {
      throw Object.assign(new Error('Confirm allow negative stock'), {
        code: 'INSUFFICIENT_STOCK_CONFIRM',
        shortfalls,
      })
    }
  }

  const couponCodeRaw =
    body.couponCode != null && String(body.couponCode).trim() !== ''
      ? String(body.couponCode).trim()
      : null
  const discountProvided =
    body.discount != null && String(body.discount).trim() !== ''
  const loyaltyAccountRaw =
    body.loyaltyAccountId != null && String(body.loyaltyAccountId).trim() !== ''
      ? String(body.loyaltyAccountId).trim()
      : null
  const loyaltyPointsRaw =
    body.loyaltyRedeemPoints != null &&
    String(body.loyaltyRedeemPoints).trim() !== ''
      ? String(body.loyaltyRedeemPoints).trim()
      : null
  const loyaltyRedeemProvided = Boolean(loyaltyAccountRaw || loyaltyPointsRaw)

  // 3-way mutual exclusivity — exactly one specific pairwise error per request.
  {
    const present = [
      couponCodeRaw ? 'coupon' : null,
      discountProvided ? 'manual' : null,
      loyaltyRedeemProvided ? 'loyalty' : null,
    ].filter(Boolean)
    if (present.length > 1) {
      const set = new Set(present)
      if (set.has('coupon') && set.has('manual')) {
        throwCheckoutError(
          'COUPON_AND_MANUAL_DISCOUNT_CONFLICT',
          'Cannot apply a coupon and a manual discount on the same order',
        )
      }
      if (set.has('coupon') && set.has('loyalty')) {
        throwCheckoutError(
          'COUPON_AND_LOYALTY_CONFLICT',
          'Cannot apply a coupon and loyalty points on the same order',
        )
      }
      if (set.has('manual') && set.has('loyalty')) {
        throwCheckoutError(
          'LOYALTY_AND_MANUAL_DISCOUNT_CONFLICT',
          'Cannot apply a manual discount and loyalty points on the same order',
        )
      }
    }
  }

  if (loyaltyRedeemProvided) {
    if (!loyaltyAccountRaw) {
      throwCheckoutError(
        'LOYALTY_ACCOUNT_ID_REQUIRED',
        'Loyalty account is required to redeem points',
      )
    }
    if (!loyaltyPointsRaw) {
      throwCheckoutError(
        'LOYALTY_REDEEM_POINTS_REQUIRED',
        'Loyalty redeem points are required',
      )
    }
  }

  const baseLines = pricedLines.map((l) => ({
    menuItemId: l.menuItemId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    vatPreset: l.vatPreset,
    variantOptionIds: l.variantOptionIds,
  }))

  /** @type {string[]} */
  let lineDiscounts
  /** @type {ReturnType<typeof computeInvoiceTotals>} */
  let totals

  if (couponCodeRaw) {
    // Preview totals for tender check only — authoritative re-validate inside the tx.
    const previewResolved = await resolveCouponCode(profileId, couponCodeRaw)
    if (!previewResolved || previewResolved.coupon.businessProfileId !== profileId) {
      throwCheckoutError('INVALID_COUPON_CODE', 'Coupon code was not found')
    }
    const previewElig = checkCouponEligibility(
      previewResolved.coupon,
      previewResolved.couponCode,
    )
    if (previewElig) {
      throwCheckoutError(previewElig.code, previewElig.message)
    }
    const previewCalc = await computeCouponDiscountForPricedLines(
      previewResolved.coupon,
      baseLines,
      prisma,
    )
    if (!previewCalc.eligible) {
      const mapped = mapCouponCalcReasonToError(
        previewCalc.reason ?? 'invalid_value',
      )
      throwCheckoutError(mapped.code, mapped.message)
    }
    lineDiscounts = previewCalc.lineDiscounts ?? baseLines.map(() => '0.00')
    totals = computeInvoiceTotals(
      baseLines.map((l, i) => ({
        ...l,
        discount: lineDiscounts[i],
      })),
    )
  } else if (loyaltyAccountRaw && loyaltyPointsRaw) {
    // Preview totals for tender check — authoritative re-validate inside the tx.
    const previewAccount = await loadOwnedLoyaltyAccount(
      profileId,
      loyaltyAccountRaw,
    )
    if (!previewAccount) {
      throwCheckoutError(
        'LOYALTY_ACCOUNT_NOT_FOUND',
        'Loyalty account not found',
      )
    }
    const previewSettings = await prisma.loyaltySettings.findUnique({
      where: { businessProfileId: profileId },
    })
    if (!previewSettings || previewSettings.enabled !== true) {
      throwCheckoutError(
        'LOYALTY_MODULE_DISABLED',
        'Loyalty points are not enabled for this restaurant',
      )
    }
    const balanceElig = checkLoyaltyRedeemEligibility(
      previewAccount,
      previewSettings,
    )
    if (!balanceElig.eligible) {
      throwCheckoutError(
        'LOYALTY_BELOW_MIN_BALANCE',
        'Balance is below the minimum required to redeem',
      )
    }
    const vatInclusive = orderVatInclusiveSubtotalFromLines(baseLines)
    const minOrderElig = checkLoyaltyMinOrderValue(vatInclusive, previewSettings)
    if (!minOrderElig.eligible) {
      throwCheckoutError(
        'LOYALTY_BELOW_MIN_ORDER',
        'Order total is below the minimum required to redeem',
      )
    }
    const previewRedeemableIds = await loadRedeemableMenuItemIds(
      profileId,
      prisma,
    )
    const previewRedeemSettings = {
      redeemRatePoints: previewSettings.redeemRatePoints,
      redeemRateAmount: previewSettings.redeemRateAmount,
      maxPointsPerOrder: previewSettings.maxPointsPerOrder,
      redeemableMenuItemIds: previewRedeemableIds,
    }
    const previewRedeemableMoney = computeRedeemableValueInCart(
      baseLines,
      previewRedeemSettings,
    )
    if (
      previewRedeemableIds.length > 0 &&
      parseMoney(previewRedeemableMoney) <= 0
    ) {
      throwCheckoutError(
        'LOYALTY_NO_REDEEMABLE_ITEMS',
        'No redeemable items in the cart',
      )
    }
    const previewCeilings = computeLoyaltyRedeemCeilings(
      previewAccount,
      previewRedeemSettings,
      baseLines,
      null,
    )
    const previewAmount = validateLoyaltyRedeemAmount(
      loyaltyPointsRaw,
      previewCeilings,
    )
    if (!previewAmount.valid) {
      throwLoyaltyAmountCheckError(previewAmount.reason)
    }
    const previewDiscountMoney = pointsToRedeemMoney(
      loyaltyPointsRaw,
      previewRedeemSettings,
    )
    lineDiscounts = allocateLoyaltyRedeemDiscount(
      baseLines,
      previewDiscountMoney,
      previewRedeemableIds,
    )
    totals = computeInvoiceTotals(
      baseLines.map((l, i) => ({
        ...l,
        discount: lineDiscounts[i],
      })),
    )
  } else {
    const settings = await prisma.businessSettings.findUnique({
      where: { businessProfileId: profileId },
      select: { discountCap: true },
    })
    const discountPercent = body.discount ?? '0'
    if (
      String(discountPercent).trim() &&
      (!isValidDiscountPercent(discountPercent) ||
        !isDiscountWithinCap(discountPercent, settings?.discountCap))
    ) {
      throw Object.assign(new Error('Discount exceeds restaurant cap'), {
        code: 'DISCOUNT_EXCEEDS_CAP',
      })
    }

    const discountMoney = orderDiscountMoneyFromPercent(
      baseLines,
      discountPercent,
    )
    lineDiscounts = allocateOrderDiscount(baseLines, discountMoney)
    totals = computeInvoiceTotals(
      baseLines.map((l, i) => ({
        ...l,
        discount: lineDiscounts[i],
      })),
    )
  }

  if (body.paymentMethod === 'cash') {
    const tendered = parseMoney(body.amountTendered)
    const grand = parseMoney(totals.grandTotal)
    if (!body.amountTendered || tendered < grand) {
      throw Object.assign(new Error('Insufficient tender'), {
        code: 'INSUFFICIENT_TENDER',
      })
    }
  }

  let changeGiven =
    body.paymentMethod === 'cash'
      ? decimalStringFromNumber(
          parseMoney(body.amountTendered) - parseMoney(totals.grandTotal),
        )
      : null

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await allocateInvoiceNumber(profileId, tx)

    /** @type {string | null} */
    let couponId = null
    /** @type {string | null} */
    let couponCodeSnapshot = null
    /** @type {string | null} */
    let couponCodeId = null
    /** @type {string | null} */
    let orderDiscountAmount = null
    /** @type {string | null} */
    let loyaltyAccountIdForInvoice = null
    /** @type {string | null} */
    let loyaltyPointsRedeemed = null
    /** @type {string | null} */
    let loyaltyDiscountAmount = null
    /** @type {string[]} */
    let finalLineDiscounts = lineDiscounts
    /** @type {ReturnType<typeof computeInvoiceTotals>} */
    let finalTotals = totals

    if (couponCodeRaw) {
      const resolved = await resolveCouponCode(profileId, couponCodeRaw, tx)
      if (!resolved || resolved.coupon.businessProfileId !== profileId) {
        throwCheckoutError('INVALID_COUPON_CODE', 'Coupon code was not found')
      }

      const { coupon, couponCode } = resolved
      const eligibilityError = checkCouponEligibility(coupon, couponCode)
      if (eligibilityError) {
        throwCheckoutError(eligibilityError.code, eligibilityError.message)
      }

      const calc = await computeCouponDiscountForPricedLines(
        coupon,
        baseLines,
        tx,
      )
      if (!calc.eligible) {
        const mapped = mapCouponCalcReasonToError(calc.reason ?? 'invalid_value')
        throwCheckoutError(mapped.code, mapped.message)
      }

      if (coupon.codeType === 'SHARED') {
        const ok = await incrementSharedCouponUsageGuarded(tx, coupon)
        if (!ok) {
          throwCheckoutError(
            'COUPON_USAGE_LIMIT_REACHED',
            'This coupon has reached its usage limit',
          )
        }
      } else if (couponCode) {
        const ok = await incrementBatchCouponCodeUsageGuarded(tx, couponCode)
        if (!ok) {
          throwCheckoutError(
            'COUPON_CODE_USAGE_LIMIT_REACHED',
            'This coupon code has reached its usage limit',
          )
        }
      } else {
        throwCheckoutError('INVALID_COUPON_CODE', 'Coupon code was not found')
      }

      finalLineDiscounts = calc.lineDiscounts ?? baseLines.map(() => '0.00')
      finalTotals = computeInvoiceTotals(
        baseLines.map((l, i) => ({
          ...l,
          discount: finalLineDiscounts[i],
        })),
      )
      if (body.paymentMethod === 'cash') {
        const tendered = parseMoney(body.amountTendered)
        const grand = parseMoney(finalTotals.grandTotal)
        if (!body.amountTendered || tendered < grand) {
          throwCheckoutError(
            'INSUFFICIENT_TENDER',
            'Amount tendered is less than the total',
          )
        }
        changeGiven = decimalStringFromNumber(tendered - grand)
      }

      couponId = coupon.id
      couponCodeSnapshot =
        couponCode?.code ??
        coupon.code ??
        normalizeCouponCodeInput(couponCodeRaw)
      couponCodeId = couponCode?.id ?? null
      orderDiscountAmount = calc.discountAmount
    } else if (loyaltyAccountRaw && loyaltyPointsRaw) {
      const account = await loadOwnedLoyaltyAccount(
        profileId,
        loyaltyAccountRaw,
        tx,
      )
      if (!account) {
        throwCheckoutError(
          'LOYALTY_ACCOUNT_NOT_FOUND',
          'Loyalty account not found',
        )
      }

      const loyaltySettings = await tx.loyaltySettings.findUnique({
        where: { businessProfileId: profileId },
      })
      if (!loyaltySettings || loyaltySettings.enabled !== true) {
        throwCheckoutError(
          'LOYALTY_MODULE_DISABLED',
          'Loyalty points are not enabled for this restaurant',
        )
      }

      const balanceElig = checkLoyaltyRedeemEligibility(account, loyaltySettings)
      if (!balanceElig.eligible) {
        throwCheckoutError(
          'LOYALTY_BELOW_MIN_BALANCE',
          'Balance is below the minimum required to redeem',
        )
      }

      const vatInclusive = orderVatInclusiveSubtotalFromLines(baseLines)
      const minOrderElig = checkLoyaltyMinOrderValue(
        vatInclusive,
        loyaltySettings,
      )
      if (!minOrderElig.eligible) {
        throwCheckoutError(
          'LOYALTY_BELOW_MIN_ORDER',
          'Order total is below the minimum required to redeem',
        )
      }

      const redeemableMenuItemIds = await loadRedeemableMenuItemIds(
        profileId,
        tx,
      )
      const redeemSettings = {
        redeemRatePoints: loyaltySettings.redeemRatePoints,
        redeemRateAmount: loyaltySettings.redeemRateAmount,
        maxPointsPerOrder: loyaltySettings.maxPointsPerOrder,
        redeemableMenuItemIds,
      }

      const redeemableMoney = computeRedeemableValueInCart(
        baseLines,
        redeemSettings,
      )
      if (
        redeemableMenuItemIds.length > 0 &&
        parseMoney(redeemableMoney) <= 0
      ) {
        throwCheckoutError(
          'LOYALTY_NO_REDEEMABLE_ITEMS',
          'No redeemable items in the cart',
        )
      }

      const ceilings = computeLoyaltyRedeemCeilings(
        account,
        redeemSettings,
        baseLines,
        null,
      )
      const amountCheck = validateLoyaltyRedeemAmount(
        loyaltyPointsRaw,
        ceilings,
      )
      if (!amountCheck.valid) {
        throwLoyaltyAmountCheckError(amountCheck.reason)
      }

      const discountMoney = pointsToRedeemMoney(
        loyaltyPointsRaw,
        redeemSettings,
      )
      if (parseMoney(discountMoney) <= 0) {
        throwCheckoutError(
          'LOYALTY_REDEEM_AMOUNT_INVALID',
          'Redeem points amount is invalid',
        )
      }

      finalLineDiscounts = allocateLoyaltyRedeemDiscount(
        baseLines,
        discountMoney,
        redeemableMenuItemIds,
      )
      finalTotals = computeInvoiceTotals(
        baseLines.map((l, i) => ({
          ...l,
          discount: finalLineDiscounts[i],
        })),
      )
      if (body.paymentMethod === 'cash') {
        const tendered = parseMoney(body.amountTendered)
        const grand = parseMoney(finalTotals.grandTotal)
        if (!body.amountTendered || tendered < grand) {
          throwCheckoutError(
            'INSUFFICIENT_TENDER',
            'Amount tendered is less than the total',
          )
        }
        changeGiven = decimalStringFromNumber(tendered - grand)
      }

      const decremented = await decrementLoyaltyBalanceGuarded(
        tx,
        account.id,
        loyaltyPointsRaw,
      )
      if (!decremented) {
        throwCheckoutError(
          'LOYALTY_BALANCE_CHANGED_RETRY',
          'Loyalty balance changed — try again',
        )
      }

      loyaltyAccountIdForInvoice = account.id
      loyaltyPointsRedeemed = decimalStringFromNumber(
        parseMoney(loyaltyPointsRaw),
      )
      loyaltyDiscountAmount = discountMoney
      orderDiscountAmount = discountMoney
    }

    const created = await tx.invoice.create({
      data: {
        businessProfileId: profileId,
        invoiceNumber,
        status: 'completed',
        type: 'simplified',
        createdByStaffId: staffId,
        sellerCompanyNameAr: profile.companyNameAr,
        sellerCompanyNameEn: profile.companyNameEn,
        sellerVatNumber: profile.vatNumber,
        sellerCrNumber: profile.crNumber,
        sellerAddressAr: profile.addressAr,
        sellerAddressEn: profile.addressEn,
        sellerStreetAr: profile.streetAr,
        sellerStreetEn: profile.streetEn,
        sellerDistrictAr: profile.districtAr,
        sellerDistrictEn: profile.districtEn,
        sellerCityAr: profile.cityAr,
        sellerCityEn: profile.cityEn,
        sellerBuildingNumber: profile.buildingNumber,
        sellerSecondaryNumber: profile.secondaryNumber,
        sellerPostalCode: profile.postalCode,
        sellerShortAddress: profile.shortAddress,
        sellerEmail: profile.email?.trim() || null,
        sellerPhone: profile.phone?.trim() || null,
        paymentMethod: body.paymentMethod,
        amountTendered:
          body.paymentMethod === 'cash' ? body.amountTendered : null,
        changeGiven,
        subtotal: finalTotals.subtotal,
        totalVat: finalTotals.totalVat,
        grandTotal: finalTotals.grandTotal,
        notes: body.notes?.trim() || null,
        zatcaStatus: 'pending',
        couponId,
        couponCode: couponCodeSnapshot,
        discountAmount: orderDiscountAmount,
        loyaltyAccountId: loyaltyAccountIdForInvoice,
        loyaltyPointsRedeemed,
        loyaltyDiscountAmount,
        lines: {
          create: body.lines.map((l, idx) => {
            const item = byId.get(l.menuItemId)
            const priced = pricedLines[idx]
            const a = finalTotals.perLine[idx]
            return {
              menuItemId: item.id,
              nameAr: item.nameAr,
              nameEn: item.nameEn,
              quantity: a.quantity,
              unitPrice: priced.unitPrice,
              discount: a.discountStr,
              vatPreset: item.vatPreset,
              vatAmount: a.vatAmountStr,
              lineTotal: a.lineTotalStr,
              sortOrder: idx,
              lineNote: null,
              modifiersSnapshot: priced.modifiersSnapshot,
            }
          }),
        },
      },
      include: { lines: true },
    })

    if (couponId && couponCodeSnapshot && orderDiscountAmount) {
      await tx.couponUsage.create({
        data: {
          couponId,
          couponCodeId,
          invoiceId: created.id,
          cashierUserId: staffId,
          codeSnapshot: couponCodeSnapshot,
          discountAmount: orderDiscountAmount,
        },
      })
    }

    if (
      loyaltyAccountIdForInvoice &&
      loyaltyPointsRedeemed &&
      loyaltyDiscountAmount
    ) {
      await tx.loyaltyTransaction.create({
        data: {
          accountId: loyaltyAccountIdForInvoice,
          invoiceId: created.id,
          type: 'REDEEM',
          points: loyaltyPointsRedeemed,
          discountAmount: loyaltyDiscountAmount,
          cashierUserId: staffId,
        },
      })
    }

    await createKitchenOrderInTx(tx, {
      businessProfileId: profileId,
      invoiceId: created.id,
      lines: body.lines.map((l, idx) => {
        const item = byId.get(l.menuItemId)
        const priced = pricedLines[idx]
        return {
          menuItemId: item.id,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          quantity: priced.quantity,
          lineNote: priced.lineNote,
          modifiersSnapshot: priced.modifiersSnapshot,
        }
      }),
    })
    return created
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

  try {
    await runInvoiceZatcaSend({
      invoice,
      device,
      selectedEnvironment: profile.zatcaEnvironment,
    })
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        zatcaReportAttempts: { increment: 1 },
        zatcaLastAttemptAt: new Date(),
        zatcaLastError: null,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const humanized = humanizeZatcaError(msg)
    const first = humanized.issues?.[0]
    const summary = first?.message
      ? [first.title, first.message, first.actionHint]
          .filter(Boolean)
          .join(' — ')
      : msg
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        zatcaStatus: 'failed',
        zatcaReportAttempts: { increment: 1 },
        zatcaLastAttemptAt: new Date(),
        zatcaLastError: summary.slice(0, 1000),
      },
    })
    void emitZatcaReportFailed({
      businessProfileId: profileId,
      actorUserId: staffId,
      documentKind: 'invoice',
      documentId: invoice.id,
      documentNumber: invoice.invoiceNumber,
    })
    throw Object.assign(new Error(msg), {
      code: 'ZATCA_ERROR',
      invoiceId: invoice.id,
    })
  }

  const fresh = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      kitchenOrder: { select: { orderNumber: true, status: true } },
    },
  })
  return fresh
}
