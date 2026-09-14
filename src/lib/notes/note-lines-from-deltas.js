import {
  computeInvoiceTotals,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/**
 * Build positive note lines from signed per-line deltas for one document nature.
 * Prefer original unit price + abs(qty) when that reproduces the abs line total.
 *
 * @param {Array<{
 *   nameAr: string
 *   nameEn?: string | null
 *   quantity: number
 *   unitPrice: string
 *   vatPreset: string
 *   signedLineTotal: number
 * }>} signedDeltas
 * @param {'credit' | 'debit'} documentNature
 */
export function noteLinesFromSignedDeltas(signedDeltas, documentNature) {
  /** @type {Array<{ nameAr: string, nameEn?: string | null, quantity: number, unitPrice: string, vatPreset: string }>} */
  const out = []

  for (const d of signedDeltas) {
    const isCreditSide = d.signedLineTotal < -0.005
    const isDebitSide = d.signedLineTotal > 0.005
    if (documentNature === 'credit' && !isCreditSide) continue
    if (documentNature === 'debit' && !isDebitSide) continue

    const absTotal = Math.abs(d.signedLineTotal)
    const absQty = Math.max(1, Math.round(Math.abs(d.quantity)) || 1)

    const atAbsQty = computeInvoiceTotals([
      {
        quantity: absQty,
        unitPrice: d.unitPrice,
        discount: '0',
        vatPreset: d.vatPreset,
      },
    ])

    if (Math.abs(parseMoney(atAbsQty.grandTotal) - absTotal) < 0.03) {
      out.push({
        nameAr: d.nameAr,
        nameEn: d.nameEn,
        quantity: absQty,
        unitPrice: d.unitPrice,
        vatPreset: d.vatPreset,
      })
      continue
    }

    // Fallback: qty=1 carrying the exact absolute grand total via tax-exclusive unit.
    const rate = d.vatPreset === 'zero' || d.vatPreset === 'exempt' ? 0 : 0.15
    const taxable = rate > 0 ? absTotal / (1 + rate) : absTotal
    out.push({
      nameAr: d.nameAr,
      nameEn: d.nameEn,
      quantity: 1,
      unitPrice: decimalStringFromNumber(taxable),
      vatPreset: d.vatPreset,
    })
  }

  return out
}
