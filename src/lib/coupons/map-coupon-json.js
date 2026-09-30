/**
 * @param {import('@/generated/prisma/client').CouponItemRule & {
 *   menuItem?: { id: string, nameAr: string, nameEn: string | null } | null
 *   allowedVariantOptions?: Array<{
 *     variantOptionId: string
 *     variantOption?: {
 *       id: string
 *       nameAr: string
 *       nameEn: string | null
 *       group?: { id: string, nameAr: string, nameEn: string | null } | null
 *     } | null
 *   }>
 * }} rule
 */
export function mapCouponItemRuleToJson(rule) {
  const allowed = Array.isArray(rule.allowedVariantOptions)
    ? rule.allowedVariantOptions
    : []
  const variantOptionIds = allowed.map((row) => row.variantOptionId)
  const variants = allowed.map((row) => {
    const opt = row.variantOption
    if (!opt) {
      return { id: row.variantOptionId, nameAr: null, nameEn: null, group: null }
    }
    return {
      id: opt.id,
      nameAr: opt.nameAr,
      nameEn: opt.nameEn ?? null,
      group: opt.group
        ? {
            id: opt.group.id,
            nameAr: opt.group.nameAr,
            nameEn: opt.group.nameEn ?? null,
          }
        : null,
    }
  })
  return {
    id: rule.id,
    ruleType: rule.ruleType,
    menuItemId: rule.menuItemId,
    quantity: rule.quantity,
    discountPercent: rule.discountPercent,
    sortOrder: rule.sortOrder,
    variantOptionIds,
    variants,
    menuItem: rule.menuItem
      ? {
          id: rule.menuItem.id,
          nameAr: rule.menuItem.nameAr,
          nameEn: rule.menuItem.nameEn ?? null,
        }
      : undefined,
  }
}

/**
 * @param {import('@/generated/prisma/client').CouponCode} row
 */
export function mapCouponCodeToJson(row) {
  return {
    id: row.id,
    code: row.code,
    ticketNumber: row.ticketNumber,
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Admin coupon JSON. List responses omit `codes` (use counts only).
 *
 * @param {import('@/generated/prisma/client').Coupon & {
 *   itemRules?: import('@/generated/prisma/client').CouponItemRule[]
 *   codes?: import('@/generated/prisma/client').CouponCode[]
 *   _count?: { codes?: number, usages?: number }
 * }} row
 * @param {{ includeCodes?: boolean }} [opts]
 */
export function mapCouponToJson(row, opts = {}) {
  const includeCodes = opts.includeCodes === true
  return {
    id: row.id,
    businessProfileId: row.businessProfileId,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    codeType: row.codeType,
    code: row.code,
    batchSize: row.batchSize,
    discountKind: row.discountKind,
    discountValue: row.discountValue,
    maxDiscountCap: row.maxDiscountCap,
    minOrderAmount: row.minOrderAmount,
    totalUsageLimit: row.totalUsageLimit,
    usedCount: row.usedCount,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    itemRules: Array.isArray(row.itemRules)
      ? row.itemRules.map(mapCouponItemRuleToJson)
      : undefined,
    codes:
      includeCodes && Array.isArray(row.codes)
        ? row.codes.map(mapCouponCodeToJson)
        : undefined,
    codeCount: row._count?.codes ?? (Array.isArray(row.codes) ? row.codes.length : undefined),
    usageCount: row._count?.usages,
  }
}

export const couponListInclude = {
  itemRules: {
    orderBy: { sortOrder: 'asc' },
    include: {
      allowedVariantOptions: { select: { variantOptionId: true } },
    },
  },
  _count: { select: { codes: true, usages: true } },
}

/** Detail/API include — menu + variant option names for admin read views. */
export const couponDetailInclude = {
  itemRules: {
    orderBy: { sortOrder: 'asc' },
    include: {
      menuItem: { select: { id: true, nameAr: true, nameEn: true } },
      allowedVariantOptions: {
        include: {
          variantOption: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              group: { select: { id: true, nameAr: true, nameEn: true } },
            },
          },
        },
      },
    },
  },
  codes: { orderBy: { ticketNumber: 'asc' } },
  _count: { select: { codes: true, usages: true } },
}
