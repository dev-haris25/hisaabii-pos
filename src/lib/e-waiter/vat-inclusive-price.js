import {
  computeLineAmounts,
  decimalStringFromNumber,
} from '@/lib/invoices/invoice-compute-totals'
import { computeUnitPriceFromItem } from '@/lib/menu/item-modifiers'

/**
 * VAT-inclusive unit price for display (qty 1, no discount).
 * Reuses POS invoice math: `computeUnitPriceFromItem` (ex-VAT) + `computeLineAmounts`.
 *
 * @param {{
 *   price?: string
 *   vatPreset?: string
 *   variantGroups?: unknown[]
 *   customizations?: unknown[]
 * }} item
 * @param {string[]} [optionIds]
 * @param {string[]} [customizationIds]
 */
export function vatInclusiveUnitPriceFromItem(
  item,
  optionIds = [],
  customizationIds = [],
) {
  const unitPrice = computeUnitPriceFromItem(item, optionIds, customizationIds)
  const { lineTotal } = computeLineAmounts({
    quantity: 1,
    unitPrice,
    discount: '0',
    vatPreset: item?.vatPreset ?? 'standard',
  })
  return decimalStringFromNumber(lineTotal)
}

/**
 * VAT-inclusive line total for a cart row.
 *
 * @param {{
 *   quantity: number
 *   unitPrice: string
 *   vatPreset: string
 * }} line
 */
export function vatInclusiveLineTotal(line) {
  const { lineTotal } = computeLineAmounts({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount: '0',
    vatPreset: line.vatPreset ?? 'standard',
  })
  return decimalStringFromNumber(lineTotal)
}
