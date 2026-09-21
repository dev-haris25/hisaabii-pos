import { formatQtyString, parseQty } from '@/lib/stock/units'

/**
 * Remaining kitchen stock on an open allocation.
 * @param {{ quantityIssued?: string | null, quantityUsed?: string | null }} alloc
 */
export function kitchenStockRemaining(alloc) {
  const issued = parseQty(alloc.quantityIssued ?? '0') ?? 0
  const used = parseQty(alloc.quantityUsed ?? '0') ?? 0
  return issued - used
}

/**
 * Waste when marking an allocation consumed.
 * Non-bulk: issued − used (≥ 0). Bulk: "0" here; Gemini overwrites after close.
 *
 * @param {{ quantityIssued?: string | null, quantityUsed?: string | null }} alloc
 * @param {boolean} isBulk
 */
export function computeMarkConsumedWaste(alloc, isBulk) {
  if (isBulk) {
    return {
      quantityWaste: '0',
      isBulkAtClose: true,
    }
  }
  const remaining = Math.max(0, kitchenStockRemaining(alloc))
  return {
    quantityWaste: formatQtyString(remaining),
    isBulkAtClose: false,
  }
}
