const DISCOUNT_PERCENT_RE = /^\d+(\.\d{1,4})?$/

/**
 * @param {string | number | undefined} s
 */
function parseMoney(s) {
  const n = Number.parseFloat(String(s ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/** @param {number} n */
function roundMoney2(n) {
  return Math.round(n * 100) / 100
}

/** @param {number} n */
function decimalStringFromNumber(n) {
  return roundMoney2(n).toFixed(2)
}

/**
 * @param {{ vatPreset: string }} line
 */
function vatRateFraction(line) {
  if (line.vatPreset === 'zero' || line.vatPreset === 'exempt') return 0
  return 0.15
}

/**
 * @param {{
 *   quantity: number
 *   unitPrice: string
 *   discount?: string
 *   vatPreset: string
 * }} line
 */
function computeLineAmounts(line) {
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
 * @param {Array<{ quantity: number, unitPrice: string }>} lines
 * @param {string | number | undefined} orderDiscount
 * @returns {string[]}
 */
function allocateOrderDiscount(lines, orderDiscount) {
  const grosses = lines.map((l) =>
    roundMoney2(
      Math.max(0, Math.round(Number(l.quantity)) || 0) * parseMoney(l.unitPrice),
    ),
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
function computeInvoiceTotals(lines) {
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

/**
 * @param {unknown} cap
 * @returns {number | null}
 */
function parseDiscountCap(cap) {
  if (cap == null) return null
  const raw = String(cap).trim()
  if (raw === '') return null
  const n = parseMoney(raw)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, n))
}

/**
 * @param {unknown} value
 */
function isValidDiscountPercent(value) {
  const raw = String(value ?? '').trim()
  if (!DISCOUNT_PERCENT_RE.test(raw)) return false
  const n = parseMoney(raw)
  return Number.isFinite(n) && n >= 0 && n <= 100 + 1e-9
}

/**
 * @param {unknown} discountPercent
 * @param {unknown} cap
 */
function isDiscountWithinCap(discountPercent, cap) {
  const limit = parseDiscountCap(cap)
  if (limit == null) return parseMoney(discountPercent ?? '0') <= 100 + 1e-9
  return parseMoney(discountPercent ?? '0') <= limit + 1e-9
}

/**
 * @param {Array<{ quantity: number, unitPrice: string }>} lines
 * @param {string | number | undefined} percent
 */
function orderDiscountMoneyFromPercent(lines, percent) {
  const totalGross = lines.reduce((sum, line) => {
    const qty = Math.max(0, Math.round(Number(line.quantity)) || 0)
    return sum + qty * parseMoney(line.unitPrice)
  }, 0)
  const p = Math.min(100, Math.max(0, parseMoney(percent)))
  return decimalStringFromNumber(totalGross * (p / 100))
}

module.exports = {
  DISCOUNT_PERCENT_RE,
  parseMoney,
  decimalStringFromNumber,
  computeLineAmounts,
  allocateOrderDiscount,
  computeInvoiceTotals,
  parseDiscountCap,
  isValidDiscountPercent,
  isDiscountWithinCap,
  orderDiscountMoneyFromPercent,
}
