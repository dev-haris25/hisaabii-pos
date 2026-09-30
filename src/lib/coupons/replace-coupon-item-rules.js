/**
 * Full-replace CouponItemRule rows (+ allowed variant options).
 * Same delete-and-recreate pattern as menu modifiers; nested creates because
 * createMany cannot attach join rows in one shot.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} couponId
 * @param {Array<{
 *   ruleType: string
 *   menuItemId: string
 *   quantity: number
 *   discountPercent?: string | null
 *   sortOrder?: number
 *   variantOptionIds?: string[] | null
 * }>} rules
 */
export async function replaceCouponItemRules(tx, couponId, rules) {
  await tx.couponItemRule.deleteMany({ where: { couponId } })
  if (!rules || rules.length === 0) return

  for (let index = 0; index < rules.length; index++) {
    const r = rules[index]
    const optionIds = [
      ...new Set(
        (Array.isArray(r.variantOptionIds) ? r.variantOptionIds : [])
          .map((id) => String(id ?? '').trim())
          .filter(Boolean),
      ),
    ]
    await tx.couponItemRule.create({
      data: {
        couponId,
        ruleType: /** @type {import('@/generated/prisma/client').CouponItemRuleType} */ (
          r.ruleType
        ),
        menuItemId: r.menuItemId,
        quantity: r.quantity,
        discountPercent: r.discountPercent ?? null,
        sortOrder: r.sortOrder ?? index,
        allowedVariantOptions:
          optionIds.length > 0
            ? {
                create: optionIds.map((variantOptionId) => ({
                  variantOptionId,
                })),
              }
            : undefined,
      },
    })
  }
}
