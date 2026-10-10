/**
 * Server-side invoice math — decimal strings, VAT rounded to 2 dp per line.
 * Taxable base per line = unitPrice × qty − discount (floored at 0).
 * No `custom` VAT preset (hisabi-pos only supports standard | zero | exempt).
 *
 * @param {string | number | undefined} s
 */
export function parseMoney(s) {
  const n = Number.parseFloat(String(s ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/** @param {number} n */
function roundMoney2(n) {
  return Math.round(n * 100) / 100
}

/** @param {number} n */
export function decimalStringFromNumber(n) {
  return roundMoney2(n).toFixed(2)
}

/**
 * KSA standard VAT rate in percent — the only non-zero rate this app issues.
 * Single source for invoice math, notes, coupons and the ZATCA tax mapping.
 */
export const STANDARD_VAT_PERCENT = 15

/**
 * VAT percent for a line preset (`standard` | `zero` | `exempt`).
 * @param {string | null | undefined} preset
 * @returns {number}
 */
export function vatPercentForPreset(preset) {
  if (preset === 'zero' || preset === 'exempt') return 0
  return STANDARD_VAT_PERCENT
}

/**
 * @param {{ vatPreset: string }} line
 */
function vatRateFraction(line) {
  return vatPercentForPreset(line.vatPreset) / 100
}

/**
 * @param {{
 *   quantity: number
 *   unitPrice: string
 *   discount?: string
 *   vatPreset: string
 * }} line
 */
export function computeLineAmounts(line) {
  const qty = Math.max(0, Math.round(Number(line.quantity)) || 0)
  const unit = parseMoney(line.unitPrice)
  const disc = Math.max(0, parseMoney(line.discount))
  const gross = roundMoney2(qty * unit)
  const taxable = Math.max(0, roundMoney2(gross - disc))
  const vatAmount = roundMoney2(taxable * vatRateFraction(line))
  const lineTotal = roundMoney2(taxable + vatAmount)
  return {
    quantity: qty,
    gross,
    discount: disc,
    taxable,
    vatAmount,
    lineTotal,
  }
}

/**
 * Split an order-level discount across lines by share of gross (capped at total gross).
 * Last line absorbs rounding remainder.
 *
 * @param {Array<{ quantity: number, unitPrice: string }>} lines
 * @param {string | number | undefined} orderDiscount
 * @returns {string[]} per-line discount strings (same length as lines)
 */
export function allocateOrderDiscount(lines, orderDiscount) {
  const grosses = lines.map((l) =>
    roundMoney2(Math.max(0, Math.round(Number(l.quantity)) || 0) * parseMoney(l.unitPrice)),
  )
  const totalGross = roundMoney2(grosses.reduce((a, b) => a + b, 0))
  const capped = Math.min(Math.max(0, parseMoney(orderDiscount)), totalGross)
  if (capped <= 0 || totalGross <= 0 || lines.length === 0) {
    return lines.map(() => '0.00')
  }

  /** @type {number[]} */
  const amounts = []
  let assigned = 0
  for (let i = 0; i < lines.length; i++) {
    if (i === lines.length - 1) {
      amounts.push(roundMoney2(capped - assigned))
      break
    }
    const share = roundMoney2((grosses[i] / totalGross) * capped)
    const d = Math.min(share, grosses[i])
    amounts.push(d)
    assigned = roundMoney2(assigned + d)
  }
  return amounts.map((n) => decimalStringFromNumber(n))
}

/**
 * @param {Array<{
 *   quantity: number
 *   unitPrice: string
 *   discount?: string
 *   vatPreset: string
 * }>} lines
 */
export function computeInvoiceTotals(lines) {
  let sub = 0
  let discSum = 0
  let vatSum = 0
  const perLine = []
  for (const line of lines) {
    const a = computeLineAmounts(line)
    sub += a.gross
    discSum += a.discount
    vatSum += a.vatAmount
    perLine.push({
      ...a,
      vatAmountStr: decimalStringFromNumber(a.vatAmount),
      lineTotalStr: decimalStringFromNumber(a.lineTotal),
      discountStr: decimalStringFromNumber(a.discount),
    })
  }
  const subR = roundMoney2(sub)
  const discR = roundMoney2(discSum)
  const vatR = roundMoney2(vatSum)
  const grand = roundMoney2(subR - discR + vatR)
  return {
    subtotal: decimalStringFromNumber(subR),
    totalDiscount: decimalStringFromNumber(discR),
    totalVat: decimalStringFromNumber(vatR),
    grandTotal: decimalStringFromNumber(grand),
    perLine,
  }
}
