/** @param {string | number | null | undefined} v */
function parseAmount(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/**
 * @param {{
 *   salarySlips: Array<{ netTotal: string }>
 *   payments: Array<{ amount: string, paymentType: 'salary' | 'advance' }>
 *   advanceDeductionLines: Array<{ total: string }>
 * }} data
 */
export function computeEmployeeBalance(data) {
  const totalEarned = data.salarySlips.reduce((sum, s) => sum + parseAmount(s.netTotal), 0)
  const totalSalaryPaid = data.payments
    .filter((p) => p.paymentType === 'salary')
    .reduce((sum, p) => sum + parseAmount(p.amount), 0)
  const totalAdvanceGiven = data.payments
    .filter((p) => p.paymentType === 'advance')
    .reduce((sum, p) => sum + parseAmount(p.amount), 0)
  const totalAdvanceDeducted = data.advanceDeductionLines.reduce(
    (sum, l) => sum + parseAmount(l.total),
    0,
  )

  const outstandingAdvance = Math.max(0, totalAdvanceGiven - totalAdvanceDeducted)
  const netBalance = totalEarned - totalSalaryPaid - outstandingAdvance

  return {
    totalEarned: totalEarned.toFixed(2),
    totalSalaryPaid: totalSalaryPaid.toFixed(2),
    totalAdvanceGiven: totalAdvanceGiven.toFixed(2),
    totalAdvanceDeducted: totalAdvanceDeducted.toFixed(2),
    outstandingAdvance: outstandingAdvance.toFixed(2),
    netBalance: netBalance.toFixed(2),
  }
}
