import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import { applyCouponItemDiscount } from '@/lib/coupons/coupon-item-discount'
import { applyCouponOrderDiscount } from '@/lib/coupons/coupon-order-discount'
import {
  checkCouponEligibility,
  mapCouponCalcReasonToError,
} from '@/lib/coupons/check-coupon-eligibility'
import { posCouponValidateBodySchema } from '@/lib/coupons/pos-coupon-validate-schema'
import { pricePosCartLinesForCoupon } from '@/lib/coupons/price-pos-cart-lines-for-coupon'
import { resolveCouponCode } from '@/lib/coupons/resolve-coupon-code'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/auth/pos/coupons/validate
 * Read-only: resolve code, check eligibility, compute discount. No writes.
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

    const parsed = posCouponValidateBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const { code: rawCode, lines } = parsed.data

    const resolved = await resolveCouponCode(auth.profileId, rawCode)
    if (!resolved) {
      return jsonError(404, 'INVALID_COUPON_CODE', 'Coupon code was not found')
    }

    const { coupon, couponCode } = resolved

    // Batch codes must belong to this restaurant's coupon (resolve already scopes by business).
    if (coupon.businessProfileId !== auth.profileId) {
      return jsonError(404, 'INVALID_COUPON_CODE', 'Coupon code was not found')
    }

    const eligibilityError = checkCouponEligibility(coupon, couponCode)
    if (eligibilityError) {
      return jsonError(400, eligibilityError.code, eligibilityError.message)
    }

    const priced = await pricePosCartLinesForCoupon(auth.profileId, lines)
    if (!priced.ok) {
      return jsonError(400, priced.code, priced.message)
    }

    const displayCode =
      couponCode?.code ?? coupon.code ?? String(rawCode).trim().toUpperCase()

    /** @type {{ eligible: boolean, discountAmount: string, lineDiscounts?: string[], reason?: string }} */
    let calcResult

    if (
      coupon.discountKind === 'PERCENTAGE' ||
      coupon.discountKind === 'FIXED_AMOUNT'
    ) {
      calcResult = applyCouponOrderDiscount(priced.pricedLines, {
        discountKind: coupon.discountKind,
        discountValue: coupon.discountValue,
        maxDiscountCap: coupon.maxDiscountCap,
        minOrderAmount: coupon.minOrderAmount,
      })
    } else if (
      coupon.discountKind === 'BOGO' ||
      coupon.discountKind === 'COMBO'
    ) {
      // Same include as compute-coupon-discount-for-priced-lines.js (checkout).
      // Without groupId, buildVariantConstraintsByGroup is empty and all lines match.
      const itemRules = await prisma.couponItemRule.findMany({
        where: { couponId: coupon.id },
        orderBy: { sortOrder: 'asc' },
        include: {
          allowedVariantOptions: {
            include: {
              variantOption: { select: { id: true, groupId: true } },
            },
          },
        },
      })
      calcResult = applyCouponItemDiscount(
        priced.pricedLines,
        {
          discountKind: coupon.discountKind,
          discountValue: coupon.discountValue,
        },
        itemRules,
      )
    } else {
      return jsonError(
        400,
        'COUPON_UNSUPPORTED_DISCOUNT_KIND',
        'This coupon discount kind is not supported here',
      )
    }

    if (!calcResult.eligible) {
      const mapped = mapCouponCalcReasonToError(calcResult.reason ?? 'invalid_value')
      return jsonError(400, mapped.code, mapped.message)
    }

    const lineDiscounts = (calcResult.lineDiscounts ?? []).map((discount, index) => ({
      index,
      menuItemId: priced.pricedLines[index]?.menuItemId ?? lines[index]?.menuItemId,
      discount,
    }))

    return jsonOk({
      coupon: {
        id: coupon.id,
        code: displayCode,
        discountKind: coupon.discountKind,
        nameAr: coupon.nameAr,
        nameEn: coupon.nameEn,
        couponCodeId: couponCode?.id ?? null,
      },
      discountAmount: calcResult.discountAmount,
      lineDiscounts,
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/pos/coupons/validate')
  }
}
