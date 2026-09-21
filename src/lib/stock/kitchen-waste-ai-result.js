import { formatQtyString, parseQty } from '@/lib/stock/units'

export const KITCHEN_WASTE_SEVERITIES = /** @type {const} */ ([
  'low',
  'bearable',
  'high',
])

/**
 * @param {unknown} value
 * @returns {value is (typeof KITCHEN_WASTE_SEVERITIES)[number]}
 */
/**
 * Single Used column: AI estimate for bulk when present, else recipe use.
 * @param {{
 *   isBulk?: boolean | null
 *   aiQuantityUsed?: string | null
 *   quantityUsed?: string | null
 * }} row
 */
export function displayedKitchenUsedQty(row) {
  if (row.isBulk === true && row.aiQuantityUsed) {
    return String(row.aiQuantityUsed)
  }
  return String(row.quantityUsed ?? '0')
}

export function isKitchenWasteSeverity(value) {
  return (
    typeof value === 'string' &&
    KITCHEN_WASTE_SEVERITIES.includes(
      /** @type {(typeof KITCHEN_WASTE_SEVERITIES)[number]} */ (value),
    )
  )
}

/**
 * Prisma update payload for storing an AI wastage result on a closed batch.
 * Does not touch warehouse movements or recipe `quantityUsed`.
 *
 * @param {{
 *   isBulk: boolean
 *   wasteSeverity: unknown
 *   aiAnalysis?: string | null
 *   aiQuantityUsed?: string | null
 *   quantityWaste?: string | null
 * }} input
 */
export function kitchenWasteAiResultUpdateData(input) {
  if (!isKitchenWasteSeverity(input.wasteSeverity)) {
    return {
      ok: false,
      code: 'INVALID_WASTE_SEVERITY',
      message: 'Wastage grade is not valid',
    }
  }

  const analysis =
    typeof input.aiAnalysis === 'string' ? input.aiAnalysis.trim() : ''

  /** @type {Record<string, unknown>} */
  const data = {
    wasteSeverity: input.wasteSeverity,
    aiAnalysis: analysis || null,
    aiAnalyzedAt: new Date(),
  }

  if (input.isBulk) {
    const usedN = parseQty(input.aiQuantityUsed ?? '')
    const wasteN = parseQty(input.quantityWaste ?? '')
    if (usedN == null || usedN < 0) {
      return {
        ok: false,
        code: 'INVALID_AI_QUANTITY',
        message: 'Estimated used quantity is not valid',
      }
    }
    if (wasteN == null || wasteN < 0) {
      return {
        ok: false,
        code: 'INVALID_AI_QUANTITY',
        message: 'Estimated waste quantity is not valid',
      }
    }
    data.aiQuantityUsed = formatQtyString(usedN)
    data.quantityWaste = formatQtyString(wasteN)
    data.wasteIsAiEstimate = true
  } else {
    data.wasteIsAiEstimate = false
  }

  return { ok: true, data }
}
