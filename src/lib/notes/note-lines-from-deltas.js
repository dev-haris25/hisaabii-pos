import {
  centsToMoney,
  lineTaxableCents,
  moneyToCents,
} from '@/lib/invoices/invoice-compute-totals'

/**
 * One credit / debit note line carrying exactly `taxableCents` before VAT
 * (no tolerance). Uses `units × unitPrice` when that reproduces the amount
 * exactly, otherwise a quantity-1 line whose unit price is the amount itself.
 * VAT on the line is whatever the normal per-line rounding gives.
 *
 * @param {{
 *   nameAr: string
 *   nameEn?: string | null
 *   vatPreset: string
 *   units: number
 *   unitPrice: string | number
 *   taxableCents: number
 * }} input
 * @returns {{ nameAr: string, nameEn: string | null, quantity: number, unitPrice: string, vatPreset: string }}
 */
export function noteLineForTaxable(input) {
  const units = Math.round(Number(input.units) || 0)
  const unitPrice = centsToMoney(moneyToCents(input.unitPrice))
  const base = {
    nameAr: input.nameAr,
    nameEn: input.nameEn ?? null,
    vatPreset: input.vatPreset,
  }
  if (
    units >= 1 &&
    lineTaxableCents({ quantity: units, unitPrice, vatPreset: input.vatPreset }) ===
      input.taxableCents
  ) {
    return { ...base, quantity: units, unitPrice }
  }
  return { ...base, quantity: 1, unitPrice: centsToMoney(input.taxableCents) }
}
