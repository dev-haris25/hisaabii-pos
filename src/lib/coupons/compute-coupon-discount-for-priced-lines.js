import { applyCouponItemDiscount } from '@/lib/coupons/coupon-item-discount'
import { applyCouponOrderDiscount } from '@/lib/coupons/coupon-order-discount'

/**
 * Compute coupon discount against already-priced checkout lines.
 * Loads itemRules from `db` for BOGO/COMBO.
 *
 * @param {import('@/generated/prisma/client').Coupon} coupon
 * @param {Array<{ menuItemId: string, quantity: number, unitPrice: string, vatPreset?: string }>} pricedLines
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @returns {Promise<import('@/lib/coupons/coupon-item-discount.js').CouponItemDiscountResult | import('@/lib/coupons/coupon-order-discount.js').CouponOrderDiscountResult>}
 */
export async function computeCouponDiscountForPricedLines(
  coupon,
  pricedLines,
  db,
) {
  if (
    coupon.discountKind === 'PERCENTAGE' ||
    coupon.discountKind === 'FIXED_AMOUNT'
  ) {
    return applyCouponOrderDiscount(pricedLines, {
      discountKind: coupon.discountKind,
      discountValue: coupon.discountValue,
      maxDiscountCap: coupon.maxDiscountCap,
      minOrderAmount: coupon.minOrderAmount,
    })
  }

  if (coupon.discountKind === 'BOGO' || coupon.discountKind === 'COMBO') {
    const itemRules = await db.couponItemRule.findMany({
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
    return applyCouponItemDiscount(
      pricedLines,
      {
        discountKind: coupon.discountKind,
        discountValue: coupon.discountValue,
      },
      itemRules,
    )
  }

  return {
    eligible: false,
    reason: 'unsupported_kind',
    discountAmount: '0.00',
    lineDiscounts: pricedLines.map(() => '0.00'),
  }
}
