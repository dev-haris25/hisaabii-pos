/**
 * Read-only eligibility checks for a resolved coupon (+ optional batch code).
 * Used by POS validate now; checkout redeem (Step 8) can reuse the same rules.
 *
 * @param {import('@/generated/prisma/client').Coupon} coupon
 * @param {import('@/generated/prisma/client').CouponCode | null | undefined} couponCode
 * @param {Date} [now]
 * @returns {{ code: string, message: string } | null}
 */
export function checkCouponEligibility(coupon, couponCode, now = new Date()) {
  if (coupon.active !== true) {
    return {
      code: 'COUPON_INACTIVE',
      message: 'This coupon is inactive',
    }
  }

  const t = now.getTime()
  if (coupon.startDate && coupon.startDate.getTime() > t) {
    return {
      code: 'COUPON_NOT_YET_ACTIVE',
      message: 'This coupon is not active yet',
    }
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < t) {
    return {
      code: 'COUPON_EXPIRED',
      message: 'This coupon has expired',
    }
  }

  if (
    coupon.codeType === 'SHARED' &&
    coupon.totalUsageLimit != null &&
    coupon.usedCount >= coupon.totalUsageLimit
  ) {
    return {
      code: 'COUPON_USAGE_LIMIT_REACHED',
      message: 'This coupon has reached its usage limit',
    }
  }

  if (
    couponCode &&
    couponCode.usageLimit != null &&
    couponCode.usedCount >= couponCode.usageLimit
  ) {
    return {
      code: 'COUPON_CODE_USAGE_LIMIT_REACHED',
      message: 'This coupon code has reached its usage limit',
    }
  }

  return null
}

/**
 * Map Step 3 / Step 4 ineligible reasons to specific API error codes.
 *
 * @param {string} reason
 * @returns {{ code: string, message: string }}
 */
export function mapCouponCalcReasonToError(reason) {
  switch (reason) {
    case 'below_min_order':
      return {
        code: 'COUPON_BELOW_MIN_ORDER',
        message: 'Cart total is below this coupon’s minimum order amount',
      }
    case 'bogo_requirements_not_met':
      return {
        code: 'COUPON_BOGO_REQUIREMENTS_NOT_MET',
        message: 'Cart does not meet this BOGO buy requirement',
      }
    case 'get_item_not_in_cart':
      return {
        code: 'COUPON_GET_ITEM_NOT_IN_CART',
        message: 'The free/discounted GET item is not in the cart',
      }
    case 'combo_requirements_not_met':
      return {
        code: 'COUPON_COMBO_REQUIREMENTS_NOT_MET',
        message: 'Cart does not include all required combo items',
      }
    case 'combo_no_savings':
      return {
        code: 'COUPON_COMBO_NO_SAVINGS',
        message: 'This combo does not reduce the cart total',
      }
    case 'unsupported_kind':
      return {
        code: 'COUPON_UNSUPPORTED_DISCOUNT_KIND',
        message: 'This coupon discount kind is not supported here',
      }
    case 'invalid_value':
      return {
        code: 'COUPON_DISCOUNT_CALCULATION_INVALID',
        message: 'This coupon’s discount configuration is invalid',
      }
    default:
      return {
        code: 'COUPON_DISCOUNT_CALCULATION_INVALID',
        message: 'This coupon cannot be applied to the cart',
      }
  }
}
