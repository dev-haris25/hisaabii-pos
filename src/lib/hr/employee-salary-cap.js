/** @param {string | number | null | undefined} v */
function parseAmount(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/** @param {number} n */
function decimalString(n) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

/**
 * @param {{
 *   db: import('@/lib/prisma').prisma
 *   employeeId: string
 *   payPeriod: string
 *   excludePaymentId?: string | null
 * }} p
 */
export async function getSalaryHeadroom(p) {
  const employee = await p.db.employee.findUnique({
    where: { id: p.employeeId },
    select: { salary: true },
  })
  if (!employee) return null

  const { getEffectiveSalary } = await import('@/lib/hr/promotions/get-effective-salary')
  const effectiveSalary = await getEffectiveSalary(p.db, p.employeeId, p.payPeriod)

  const existing = await p.db.employeePayment.findMany({
    where: {
      employeeId: p.employeeId,
      paymentType: 'salary',
      payPeriod: p.payPeriod,
      deletedAt: null,
      ...(p.excludePaymentId ? { id: { not: p.excludePaymentId } } : {}),
    },
    select: { amount: true },
  })

  const alreadyPaid = existing.reduce((sum, row) => sum + parseAmount(row.amount), 0)
  const cap = parseAmount(effectiveSalary)
  const headroom = Math.max(0, cap - alreadyPaid)

  return {
    cap: decimalString(cap),
    alreadyPaid: decimalString(alreadyPaid),
    headroom: decimalString(headroom),
  }
}

export { parseAmount, decimalString }
