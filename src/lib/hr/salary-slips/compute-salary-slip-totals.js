/** @param {string | number | null | undefined} v */
function parseAmount(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/** @param {number} n */
function toMoney(n) {
  return n.toFixed(2)
}

/**
 * @param {{ unit?: string, unitRate?: string }} line
 */
export function computeLineTotal(line) {
  const unit = parseAmount(line.unit)
  const rate = parseAmount(line.unitRate)
  return toMoney(unit * rate)
}

/**
 * @param {Array<{ categoryType: 'earning' | 'deduction', unit?: string, unitRate?: string }>} lines
 */
export function computeSalarySlipTotals(lines) {
  let totalEarnings = 0
  let totalDeductions = 0
  const perLine = lines.map((line) => {
    const total = parseAmount(computeLineTotal(line))
    if (line.categoryType === 'earning') totalEarnings += total
    else totalDeductions += total
    return { ...line, total: toMoney(total) }
  })

  return {
    perLine,
    totalEarnings: toMoney(totalEarnings),
    totalDeductions: toMoney(totalDeductions),
    netTotal: toMoney(totalEarnings - totalDeductions),
  }
}
