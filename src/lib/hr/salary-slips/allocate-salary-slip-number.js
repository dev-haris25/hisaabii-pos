/**
 * @param {string | number} n
 * @param {string} [prefix]
 * @param {number} [padding]
 */
export function formatSalarySlipNumber(n, prefix = 'SS-', padding = 4) {
  const num = Number.parseInt(String(n), 10)
  const pad = Math.max(1, Math.min(10, Number(padding) || 5))
  const safe = Number.isFinite(num) && num >= 1 ? num : 1
  return `${prefix}${String(safe).padStart(pad, '0')}`
}

/**
 * @param {import('@/generated/prisma').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 */
export async function allocateNextSalarySlipNumberString(tx, businessProfileId) {
  const settings = await tx.businessSettings.findUnique({
    where: { businessProfileId },
    select: { salarySlipPrefix: true, numberPadding: true },
  })
  const row = await tx.salarySlipCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return formatSalarySlipNumber(
    row.lastNumber,
    settings?.salarySlipPrefix || 'SS-',
    settings?.numberPadding ?? 4,
  )
}
