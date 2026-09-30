import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import {
  orderVatInclusiveSubtotalFromLines,
} from '@/lib/coupons/coupon-order-discount'
import { posCouponValidateLineSchema } from '@/lib/coupons/pos-coupon-validate-schema'
import { pricePosCartLinesForCoupon } from '@/lib/coupons/price-pos-cart-lines-for-coupon'
import { parseMoney } from '@/lib/invoices/invoice-compute-totals'
import {
  allocateLoyaltyRedeemDiscount,
  computeLoyaltyRedeemCeilings,
  computeRedeemableValueInCart,
  pointsToRedeemMoney,
} from '@/lib/loyalty/compute-loyalty-redeem-ceilings'
import { loadOwnedLoyaltyAccount } from '@/lib/loyalty/load-owned-loyalty-account'
import {
  checkLoyaltyMinOrderValue,
  validateLoyaltyRedeemAmount,
} from '@/lib/loyalty/loyalty-redeem-eligibility'
import { prisma } from '@/lib/prisma'

/**
 * Same cart-line shape as Coupons POS validate (`posCouponValidateLineSchema`).
 */
const bodySchema = z
  .object({
    accountId: z.string().trim().min(1),
    lines: z.array(posCouponValidateLineSchema).min(1).max(100),
    requestedPoints: z.string().optional(),
  })
  .strict()

/**
 * POST /api/auth/pos/loyalty/redeem/validate
 * Live ceilings (+ optional typed-amount check). Read-only; called repeatedly.
 */
export async function POST(request) {
  try {
    const auth = await requirePosRestaurant()
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const { accountId, lines, requestedPoints } = parsed.data

    const account = await loadOwnedLoyaltyAccount(auth.profileId, accountId)
    if (!account) {
      return jsonError(
        404,
        'LOYALTY_ACCOUNT_NOT_FOUND',
        'Loyalty account not found',
      )
    }

    // Read-only: findUnique only — never getOrCreate.
    const settings = await prisma.loyaltySettings.findUnique({
      where: { businessProfileId: auth.profileId },
    })
    if (!settings || settings.enabled !== true) {
      return jsonError(
        400,
        'LOYALTY_MODULE_DISABLED',
        'Loyalty points are not enabled for this restaurant',
      )
    }

    // Fresh each call — admin can flip loyaltyRedeemable anytime.
    const redeemableItems = await prisma.menuItem.findMany({
      where: {
        businessProfileId: auth.profileId,
        loyaltyRedeemable: true,
        active: true,
      },
      select: { id: true },
    })
    const redeemableMenuItemIds = redeemableItems.map((r) => r.id)

    const priced = await pricePosCartLinesForCoupon(auth.profileId, lines)
    if (!priced.ok) {
      return jsonError(400, priced.code, priced.message)
    }

    const cartVatInclusiveTotal = orderVatInclusiveSubtotalFromLines(
      priced.pricedLines,
    )
    const minOrder = checkLoyaltyMinOrderValue(cartVatInclusiveTotal, settings)
    if (!minOrder.eligible) {
      return jsonOk({
        eligible: false,
        reason: 'below_min_order',
      })
    }

    const redeemSettings = {
      redeemRatePoints: settings.redeemRatePoints,
      redeemRateAmount: settings.redeemRateAmount,
      maxPointsPerOrder: settings.maxPointsPerOrder,
      redeemableMenuItemIds,
    }

    const redeemableMoney = computeRedeemableValueInCart(
      priced.pricedLines,
      redeemSettings,
    )
    const hasItemRestriction = redeemableMenuItemIds.length > 0
    if (hasItemRestriction && parseMoney(redeemableMoney) <= 0) {
      return jsonOk({
        eligible: false,
        reason: 'no_redeemable_items',
      })
    }

    const ceilings = computeLoyaltyRedeemCeilings(
      account,
      redeemSettings,
      priced.pricedLines,
      null,
    )

    /** @type {Record<string, unknown>} */
    const payload = {
      eligible: true,
      ceilings,
    }

    if (requestedPoints !== undefined) {
      const amountCheck = validateLoyaltyRedeemAmount(
        requestedPoints,
        ceilings,
      )
      payload.amountCheck = amountCheck
      // Same shape Coupons validate returns — POS cartTotals displays these.
      if (amountCheck.valid === true) {
        const discountMoney = pointsToRedeemMoney(
          requestedPoints,
          redeemSettings,
        )
        payload.discountAmount = discountMoney
        payload.lineDiscounts = allocateLoyaltyRedeemDiscount(
          priced.pricedLines,
          discountMoney,
          redeemableMenuItemIds,
        )
      }
    }

    return jsonOk(payload)
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/pos/loyalty/redeem/validate')
  }
}
