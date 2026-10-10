/**
 * Pure BOGO / Combo coupon math against cart lines + CouponItemRule rows.
 * Deliberately separate from Percentage/Fixed (`coupon-order-discount.js`).
 * Output shape matches `applyCouponOrderDiscount` for a uniform caller later.
 *
 * Variant matching (customizations are NEVER consulted):
 * - Group a rule's allowed options by MenuItemVariantGroup.
 * - A line qualifies iff for EVERY constrained group, the line's
 *   variantOptionIds intersect that group's allowed set (OR within group).
 * - Groups with no selections on the rule are unconstrained.
 * - Empty allowed list → any line with matching menuItemId qualifies
 *   (items with no variant groups, or legacy rules).
 */

import {
  allocateOrderDiscount,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/**
 * @typedef {{
 *   menuItemId: string
 *   quantity: number
 *   unitPrice: string
 *   vatPreset?: string
 *   variantOptionIds?: string[]
 * }} CartDiscountLine
 */

/**
 * @typedef {{
 *   ruleType: 'BUY' | 'GET' | 'COMBO_ITEM' | string
 *   menuItemId: string
 *   quantity: number
 *   discountPercent?: string | number | null
 *   sortOrder?: number
 *   variantConstraintsByGroup?: Map<string, Set<string>> | Record<string, string[]>
 *   allowedVariantOptions?: Array<{
 *     variantOptionId: string
 *     variantOption?: { id?: string, groupId?: string } | null
 *   }>
 * }} CouponItemRuleInput
 */

/**
 * @typedef {{
 *   discountKind: string
 *   discountValue?: string | number | null
 * }} CouponItemDiscountFields
 */

/**
 * @typedef {{
 *   eligible: true
 *   discountAmount: string
 *   lineDiscounts: string[]
 * } | {
 *   eligible: false
 *   reason:
 *     | 'bogo_requirements_not_met'
 *     | 'get_item_not_in_cart'
 *     | 'combo_requirements_not_met'
 *     | 'combo_no_savings'
 *     | 'unsupported_kind'
 *     | 'invalid_value'
 *   discountAmount: '0.00'
 *   lineDiscounts: string[]
 * }} CouponItemDiscountResult
 */

/**
 * Group rule allowed options by parent variant group id (once per rule).
 *
 * @param {CouponItemRuleInput} rule
 * @returns {Map<string, Set<string>>}
 */
export function buildVariantConstraintsByGroup(rule) {
  if (rule.variantConstraintsByGroup instanceof Map) {
    return rule.variantConstraintsByGroup
  }
  if (
    rule.variantConstraintsByGroup &&
    typeof rule.variantConstraintsByGroup === 'object'
  ) {
    /** @type {Map<string, Set<string>>} */
    const map = new Map()
    for (const [groupId, ids] of Object.entries(rule.variantConstraintsByGroup)) {
      map.set(groupId, new Set(Array.isArray(ids) ? ids : []))
    }
    return map
  }

  /** @type {Map<string, Set<string>>} */
  const byGroup = new Map()
  for (const row of rule.allowedVariantOptions ?? []) {
    const optId = row?.variantOptionId
    const groupId = row?.variantOption?.groupId
    if (!optId || !groupId) continue
    let set = byGroup.get(groupId)
    if (!set) {
      set = new Set()
      byGroup.set(groupId, set)
    }
    set.add(optId)
  }
  return byGroup
}

/**
 * AND across groups that appear on the rule; OR within each group.
 * Does not read customizationIds.
 *
 * @param {CartDiscountLine} line
 * @param {CouponItemRuleInput} rule
 */
export function lineMatchesRuleVariants(line, rule) {
  const byGroup = buildVariantConstraintsByGroup(rule)
  if (byGroup.size === 0) return true

  const lineOpts = new Set(
    Array.isArray(line.variantOptionIds)
      ? line.variantOptionIds.filter(Boolean)
      : [],
  )

  for (const allowed of byGroup.values()) {
    if (allowed.size === 0) continue
    let hit = false
    for (const id of allowed) {
      if (lineOpts.has(id)) {
        hit = true
        break
      }
    }
    if (!hit) return false
  }
  return true
}

/**
 * @param {CartDiscountLine[]} lines
 * @returns {string[]}
 */
function zeroLineDiscounts(lines) {
  return (Array.isArray(lines) ? lines : []).map(() => '0.00')
}

/**
 * @param {CartDiscountLine[]} lines
 * @param {CouponItemRuleInput} rule
 */
function totalQtyForRule(lines, rule) {
  let qty = 0
  for (const line of lines) {
    if (line.menuItemId !== rule.menuItemId) continue
    if (!lineMatchesRuleVariants(line, rule)) continue
    qty += Math.max(0, Math.round(Number(line.quantity)) || 0)
  }
  return qty
}

/**
 * Indices of cart lines matching rule (menuItemId + variants), cheapest first.
 *
 * @param {CartDiscountLine[]} lines
 * @param {CouponItemRuleInput} rule
 * @returns {number[]}
 */
function cheapestFirstIndices(lines, rule) {
  /** @type {number[]} */
  const idxs = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.menuItemId !== rule.menuItemId) continue
    if (!lineMatchesRuleVariants(line, rule)) continue
    idxs.push(i)
  }
  idxs.sort((a, b) => {
    const pa = parseMoney(lines[a].unitPrice)
    const pb = parseMoney(lines[b].unitPrice)
    if (pa !== pb) return pa - pb
    return a - b
  })
  return idxs
}

/**
 * Consume up to `needQty` units from matching lines (cheapest-first).
 *
 * @param {CartDiscountLine[]} lines
 * @param {CouponItemRuleInput} rule
 * @param {number} needQty
 * @returns {Map<number, number>}
 */
function consumeCheapestUnits(lines, rule, needQty) {
  /** @type {Map<number, number>} */
  const taken = new Map()
  let remaining = Math.max(0, Math.round(Number(needQty)) || 0)
  if (remaining <= 0) return taken

  for (const i of cheapestFirstIndices(lines, rule)) {
    if (remaining <= 0) break
    const avail = Math.max(0, Math.round(Number(lines[i].quantity)) || 0)
    if (avail <= 0) continue
    const use = Math.min(avail, remaining)
    taken.set(i, (taken.get(i) ?? 0) + use)
    remaining -= use
  }
  return taken
}

/**
 * @param {CartDiscountLine[]} lines
 * @param {number[]} amountsByIndex
 * @returns {string[]}
 */
function formatLineDiscounts(lines, amountsByIndex) {
  return lines.map((line, i) => {
    const gross =
      Math.round(
        (Math.max(0, Math.round(Number(line.quantity)) || 0) *
          parseMoney(line.unitPrice) +
          Number.EPSILON) *
          100,
      ) / 100
    const raw = Math.max(0, amountsByIndex[i] ?? 0)
    const capped = Math.min(raw, gross)
    return decimalStringFromNumber(capped)
  })
}

/**
 * @param {string[]} lineDiscounts
 * @returns {string}
 */
function sumDiscountStrings(lineDiscounts) {
  let total = 0
  for (const d of lineDiscounts) total += parseMoney(d)
  return decimalStringFromNumber(Math.round(total * 100) / 100)
}

/**
 * @param {CouponItemRuleInput[]} itemRules
 * @returns {CouponItemRuleInput[]}
 */
function withVariantConstraints(itemRules) {
  return itemRules.map((r) => ({
    ...r,
    variantConstraintsByGroup: buildVariantConstraintsByGroup(r),
  }))
}

/**
 * @param {CartDiscountLine[]} lines
 * @param {CouponItemRuleInput[]} itemRules
 * @returns {CouponItemDiscountResult}
 */
function applyBogoDiscount(lines, itemRules) {
  const zeros = zeroLineDiscounts(lines)
  const rules = withVariantConstraints(itemRules)
  const buyRules = rules.filter((r) => r.ruleType === 'BUY')
  const getRules = rules.filter((r) => r.ruleType === 'GET')

  if (buyRules.length === 0 || getRules.length === 0) {
    return {
      eligible: false,
      reason: 'invalid_value',
      discountAmount: '0.00',
      lineDiscounts: zeros,
    }
  }

  // BUY-side only gates acceptance. GET rules never reject the coupon.
  for (const buy of buyRules) {
    const need = Math.max(0, Math.round(Number(buy.quantity)) || 0)
    if (need < 1) {
      return {
        eligible: false,
        reason: 'invalid_value',
        discountAmount: '0.00',
        lineDiscounts: zeros,
      }
    }
    if (totalQtyForRule(lines, buy) < need) {
      return {
        eligible: false,
        reason: 'bogo_requirements_not_met',
        discountAmount: '0.00',
        lineDiscounts: zeros,
      }
    }
  }

  /** @type {number[]} */
  const amounts = lines.map(() => 0)

  for (const get of getRules) {
    const getQty = Math.max(0, Math.round(Number(get.quantity)) || 0)
    if (getQty < 1) {
      return {
        eligible: false,
        reason: 'invalid_value',
        discountAmount: '0.00',
        lineDiscounts: zeros,
      }
    }
    if (get.discountPercent == null || String(get.discountPercent).trim() === '') {
      return {
        eligible: false,
        reason: 'invalid_value',
        discountAmount: '0.00',
        lineDiscounts: zeros,
      }
    }
    const p = Math.min(100, Math.max(0, parseMoney(get.discountPercent)))
    const taken = consumeCheapestUnits(lines, get, getQty)
    const takenQty = [...taken.values()].reduce((a, b) => a + b, 0)
    // Missing / insufficient GET qty → this rule contributes 0; keep evaluating others.
    if (takenQty < getQty) continue
    for (const [lineIndex, units] of taken) {
      const unit = parseMoney(lines[lineIndex].unitPrice)
      amounts[lineIndex] += units * unit * (p / 100)
    }
  }

  const lineDiscounts = formatLineDiscounts(lines, amounts)
  return {
    eligible: true,
    discountAmount: sumDiscountStrings(lineDiscounts),
    lineDiscounts,
  }
}

/**
 * @param {CartDiscountLine[]} lines
 * @param {CouponItemDiscountFields} coupon
 * @param {CouponItemRuleInput[]} itemRules
 * @returns {CouponItemDiscountResult}
 */
function applyComboDiscount(lines, coupon, itemRules) {
  const zeros = zeroLineDiscounts(lines)
  const comboRules = withVariantConstraints(
    itemRules.filter((r) => r.ruleType === 'COMBO_ITEM'),
  )

  if (comboRules.length === 0) {
    return {
      eligible: false,
      reason: 'invalid_value',
      discountAmount: '0.00',
      lineDiscounts: zeros,
    }
  }

  const rawPrice = coupon?.discountValue
  if (rawPrice == null || String(rawPrice).trim() === '') {
    return {
      eligible: false,
      reason: 'invalid_value',
      discountAmount: '0.00',
      lineDiscounts: zeros,
    }
  }
  const comboPrice = Math.max(0, parseMoney(rawPrice))

  for (const rule of comboRules) {
    const need = Math.max(0, Math.round(Number(rule.quantity)) || 0)
    if (need < 1) {
      return {
        eligible: false,
        reason: 'invalid_value',
        discountAmount: '0.00',
        lineDiscounts: zeros,
      }
    }
    if (totalQtyForRule(lines, rule) < need) {
      return {
        eligible: false,
        reason: 'combo_requirements_not_met',
        discountAmount: '0.00',
        lineDiscounts: zeros,
      }
    }
  }

  /** @type {Map<number, number>} */
  const matchedQtyByLine = new Map()

  for (const rule of comboRules) {
    const need = Math.max(0, Math.round(Number(rule.quantity)) || 0)
    const taken = consumeCheapestUnits(lines, rule, need)
    for (const [lineIndex, units] of taken) {
      matchedQtyByLine.set(
        lineIndex,
        (matchedQtyByLine.get(lineIndex) ?? 0) + units,
      )
    }
  }

  /** @type {Array<{ quantity: number, unitPrice: string }>} */
  const matchedLines = []
  /** @type {number[]} */
  const matchedSourceIndex = []

  for (const [lineIndex, qty] of matchedQtyByLine) {
    if (qty < 1) continue
    matchedLines.push({
      quantity: qty,
      unitPrice: lines[lineIndex].unitPrice,
    })
    matchedSourceIndex.push(lineIndex)
  }

  let matchedGross = 0
  for (const ml of matchedLines) {
    matchedGross +=
      Math.max(0, Math.round(Number(ml.quantity)) || 0) *
      parseMoney(ml.unitPrice)
  }
  matchedGross = Math.round(matchedGross * 100) / 100

  if (matchedGross <= comboPrice) {
    return {
      eligible: false,
      reason: 'combo_no_savings',
      discountAmount: '0.00',
      lineDiscounts: zeros,
    }
  }

  const savings = Math.round((matchedGross - comboPrice) * 100) / 100
  const allocated = allocateOrderDiscount(matchedLines, savings)
  /** @type {number[]} */
  const amounts = lines.map(() => 0)
  for (let i = 0; i < matchedSourceIndex.length; i++) {
    amounts[matchedSourceIndex[i]] += parseMoney(allocated[i] ?? '0')
  }

  const lineDiscounts = formatLineDiscounts(lines, amounts)
  return {
    eligible: true,
    discountAmount: sumDiscountStrings(lineDiscounts),
    lineDiscounts,
  }
}

/**
 * @param {CartDiscountLine[]} lines
 * @param {CouponItemDiscountFields} coupon
 * @param {CouponItemRuleInput[]} itemRules
 * @returns {CouponItemDiscountResult}
 */
export function applyCouponItemDiscount(lines, coupon, itemRules) {
  const list = Array.isArray(lines) ? lines : []
  const rules = Array.isArray(itemRules) ? itemRules : []
  const kind = coupon?.discountKind

  if (kind === 'BOGO') {
    return applyBogoDiscount(list, rules)
  }
  if (kind === 'COMBO') {
    return applyComboDiscount(list, coupon, rules)
  }

  return {
    eligible: false,
    reason: 'unsupported_kind',
    discountAmount: '0.00',
    lineDiscounts: zeroLineDiscounts(list),
  }
}
