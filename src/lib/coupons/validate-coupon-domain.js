import { normalizeCouponCodeInput } from '@/lib/coupons/resolve-coupon-code'

/**
 * Hisabi-style `details.issues` entry for an item-rules row
 * (`path: ['itemRules', ruleIndex, field]`).
 *
 * @param {number} ruleIndex
 * @param {string} field
 * @param {string} [message]
 */
function itemRuleIssueDetails(ruleIndex, field, message = '') {
  return {
    issues: [
      {
        path: ['itemRules', ruleIndex, field],
        message: message || field,
      },
    ],
  }
}

/**
 * Domain validation for coupon create/update payloads (specific error codes).
 *
 * @param {{
 *   codeType?: string
 *   discountKind: string
 *   discountValue?: string | null
 *   maxDiscountCap?: string | null
 *   code?: string | null
 *   generateCode?: boolean
 *   batchSize?: number | null
 *   perCodeUsageLimit?: number | null
 *   totalUsageLimit?: number | null
 *   startDate?: Date | null
 *   expiresAt?: Date | null
 *   itemRules?: Array<{
 *     ruleType: string
 *     menuItemId: string
 *     quantity: number
 *     discountPercent?: string | null
 *   }>
 * }} d
 * @param {'create' | 'update'} mode
 * @returns {{
 *   code: string
 *   message: string
 *   details?: { issues: Array<{ path: (string | number)[], message: string }> }
 * } | null}
 */
export function validateCouponDomainRules(d, mode) {
  const kind = d.discountKind
  const rules = d.itemRules ?? []

  if (d.startDate && d.expiresAt && d.expiresAt.getTime() <= d.startDate.getTime()) {
    return {
      code: 'COUPON_EXPIRES_BEFORE_START',
      message: 'Expiration must be after the start date',
    }
  }

  if (kind === 'PERCENTAGE' || kind === 'FIXED_AMOUNT') {
    if (d.discountValue == null || String(d.discountValue).trim() === '') {
      return {
        code: 'COUPON_DISCOUNT_VALUE_REQUIRED',
        message: 'Discount value is required for this discount kind',
      }
    }
    if (rules.length > 0) {
      return {
        code: 'COUPON_ITEM_RULES_NOT_ALLOWED',
        message: 'Item rules are only allowed for BOGO and Combo coupons',
      }
    }
  }

  if (kind === 'BOGO') {
    if (d.discountValue != null && String(d.discountValue).trim() !== '') {
      return {
        code: 'COUPON_DISCOUNT_VALUE_NOT_ALLOWED_FOR_BOGO',
        message: 'BOGO coupons do not use a discount value',
      }
    }
    if (d.maxDiscountCap != null && String(d.maxDiscountCap).trim() !== '') {
      return {
        code: 'COUPON_MAX_CAP_NOT_ALLOWED_FOR_BOGO',
        message: 'BOGO coupons do not use a max discount cap',
      }
    }
    const buys = rules.filter((r) => r.ruleType === 'BUY')
    const gets = rules.filter((r) => r.ruleType === 'GET')
    if (buys.length === 0 || gets.length === 0) {
      return {
        code: 'COUPON_BOGO_RULES_INCOMPLETE',
        message: 'BOGO requires at least one BUY and one GET rule',
      }
    }
    for (const get of gets) {
      if (get.discountPercent == null || String(get.discountPercent).trim() === '') {
        return {
          code: 'COUPON_GET_RULE_DISCOUNT_PERCENT_REQUIRED',
          message: 'GET rules require a discount percent',
        }
      }
    }
    const mismatchIndex = rules.findIndex((r) => r.ruleType === 'COMBO_ITEM')
    if (mismatchIndex >= 0) {
      return {
        code: 'COUPON_ITEM_RULE_TYPE_MISMATCH',
        message: 'BOGO coupons cannot include COMBO_ITEM rules',
        details: itemRuleIssueDetails(
          mismatchIndex,
          'ruleType',
          'COUPON_ITEM_RULE_TYPE_MISMATCH',
        ),
      }
    }
  }

  if (kind === 'COMBO') {
    if (d.discountValue == null || String(d.discountValue).trim() === '') {
      return {
        code: 'COUPON_COMBO_PRICE_REQUIRED',
        message: 'Combo coupons require a fixed combo price',
      }
    }
    const comboItems = rules.filter((r) => r.ruleType === 'COMBO_ITEM')
    if (comboItems.length === 0) {
      return {
        code: 'COUPON_COMBO_RULES_REQUIRED',
        message: 'Combo requires at least one COMBO_ITEM rule',
      }
    }
    const mismatchIndex = rules.findIndex(
      (r) => r.ruleType === 'BUY' || r.ruleType === 'GET',
    )
    if (mismatchIndex >= 0) {
      return {
        code: 'COUPON_ITEM_RULE_TYPE_MISMATCH',
        message: 'Combo coupons cannot include BUY or GET rules',
        details: itemRuleIssueDetails(
          mismatchIndex,
          'ruleType',
          'COUPON_ITEM_RULE_TYPE_MISMATCH',
        ),
      }
    }
  }

  if (mode === 'create') {
    if (d.codeType === 'SHARED') {
      const hasManual = Boolean(d.code && String(d.code).trim())
      const hasGenerate = d.generateCode === true
      if (hasManual && hasGenerate) {
        return {
          code: 'COUPON_SHARED_CODE_CONFLICT',
          message: 'Provide either a manual code or generateCode, not both',
        }
      }
      if (!hasManual && !hasGenerate) {
        return {
          code: 'COUPON_SHARED_CODE_REQUIRED',
          message: 'Shared coupons require a manual code or generateCode',
        }
      }
      if (d.batchSize != null) {
        return {
          code: 'COUPON_BATCH_SIZE_NOT_ALLOWED_FOR_SHARED',
          message: 'Shared coupons do not use batchSize',
        }
      }
      if (d.perCodeUsageLimit != null) {
        return {
          code: 'COUPON_PER_CODE_USAGE_LIMIT_NOT_ALLOWED_FOR_SHARED',
          message: 'Shared coupons do not use perCodeUsageLimit',
        }
      }
    }

    if (d.codeType === 'UNIQUE_BATCH') {
      if (d.batchSize == null || d.batchSize < 1) {
        return {
          code: 'COUPON_BATCH_SIZE_REQUIRED',
          message: 'Unique batch coupons require batchSize',
        }
      }
      if (d.code != null && String(d.code).trim() !== '') {
        return {
          code: 'COUPON_SHARED_CODE_NOT_ALLOWED_FOR_BATCH',
          message: 'Unique batch coupons do not take a shared code',
        }
      }
      if (d.generateCode === true) {
        return {
          code: 'COUPON_GENERATE_CODE_NOT_ALLOWED_FOR_BATCH',
          message: 'Use batch generation for unique batch coupons',
        }
      }
      if (d.totalUsageLimit != null) {
        return {
          code: 'COUPON_TOTAL_USAGE_LIMIT_NOT_ALLOWED_FOR_BATCH',
          message: 'Unique batch coupons do not use totalUsageLimit',
        }
      }
    }
  }

  return null
}

/**
 * @param {string} businessProfileId
 * @param {string} rawCode
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @returns {Promise<boolean>}
 */
export async function isCouponCodeTaken(businessProfileId, rawCode, db) {
  const code = normalizeCouponCodeInput(rawCode)
  if (!code) return false
  const [shared, batch] = await Promise.all([
    db.coupon.findUnique({
      where: { businessProfileId_code: { businessProfileId, code } },
      select: { id: true },
    }),
    db.couponCode.findUnique({
      where: { businessProfileId_code: { businessProfileId, code } },
      select: { id: true },
    }),
  ])
  return Boolean(shared || batch)
}

/**
 * @param {string} businessProfileId
 * @param {Array<{
 *   menuItemId: string
 *   variantOptionIds?: string[] | null
 * }>} rules
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @returns {Promise<
 *   | { ok: true }
 *   | {
 *       ok: false
 *       code: 'COUPON_ITEM_RULE_MENU_ITEM_NOT_FOUND' | 'COUPON_ITEM_RULE_VARIANT_REQUIRED' | 'COUPON_ITEM_RULE_INVALID_VARIANT'
 *       menuItemId: string
 *       ruleIndex: number
 *       details: ReturnType<typeof itemRuleIssueDetails>
 *     }
 * >}
 */
export async function assertItemRuleMenuItemsExist(businessProfileId, rules, db) {
  if (!rules || rules.length === 0) return { ok: true }
  const ids = [...new Set(rules.map((r) => r.menuItemId))]
  const rows = await db.menuItem.findMany({
    where: { businessProfileId, id: { in: ids } },
    select: {
      id: true,
      variantGroups: {
        select: {
          id: true,
          options: { select: { id: true } },
        },
      },
    },
  })
  /** @type {Map<string, { optionIds: Set<string>, hasVariants: boolean }>} */
  const byId = new Map()
  for (const row of rows) {
    /** @type {Set<string>} */
    const optionIds = new Set()
    for (const g of row.variantGroups ?? []) {
      for (const o of g.options ?? []) optionIds.add(o.id)
    }
    byId.set(row.id, {
      optionIds,
      hasVariants: optionIds.size > 0,
    })
  }

  for (let i = 0; i < rules.length; i++) {
    const menuItemId = rules[i].menuItemId
    const meta = byId.get(menuItemId)
    if (!meta) {
      return {
        ok: false,
        code: 'COUPON_ITEM_RULE_MENU_ITEM_NOT_FOUND',
        menuItemId,
        ruleIndex: i,
        details: itemRuleIssueDetails(
          i,
          'menuItemId',
          'COUPON_ITEM_RULE_MENU_ITEM_NOT_FOUND',
        ),
      }
    }

    const submitted = [
      ...new Set(
        (Array.isArray(rules[i].variantOptionIds)
          ? rules[i].variantOptionIds
          : []
        )
          .map((id) => String(id ?? '').trim())
          .filter(Boolean),
      ),
    ]

    if (meta.hasVariants && submitted.length === 0) {
      return {
        ok: false,
        code: 'COUPON_ITEM_RULE_VARIANT_REQUIRED',
        menuItemId,
        ruleIndex: i,
        details: itemRuleIssueDetails(
          i,
          'variantOptionIds',
          'COUPON_ITEM_RULE_VARIANT_REQUIRED',
        ),
      }
    }

    for (const optId of submitted) {
      if (!meta.optionIds.has(optId)) {
        return {
          ok: false,
          code: 'COUPON_ITEM_RULE_INVALID_VARIANT',
          menuItemId,
          ruleIndex: i,
          details: itemRuleIssueDetails(
            i,
            'variantOptionIds',
            'COUPON_ITEM_RULE_INVALID_VARIANT',
          ),
        }
      }
    }
  }
  return { ok: true }
}
