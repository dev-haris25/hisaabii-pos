import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'

/**
 * Resolves the salary cap for a pay period using promotion history.
 *
 * @param {import('@/lib/prisma').prisma} db
 * @param {string} employeeId
 * @param {string} payPeriod YYYY-MM
 */
export async function getEffectiveSalary(db, employeeId, payPeriod) {
  const promotions = await db.employeePromotion.findMany({
    where: {
      employeeId,
      effectiveFrom: { lte: payPeriod },
      ...WHERE_NOT_DELETED,
    },
    orderBy: [{ effectiveFrom: 'asc' }, { promotedAt: 'asc' }],
    select: { oldSalary: true, newSalary: true },
  })

  if (promotions.length === 0) {
    const firstFuture = await db.employeePromotion.findFirst({
      where: {
        employeeId,
        effectiveFrom: { gt: payPeriod },
        ...WHERE_NOT_DELETED,
      },
      orderBy: { effectiveFrom: 'asc' },
      select: { oldSalary: true },
    })
    if (firstFuture?.oldSalary) return firstFuture.oldSalary

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { salary: true },
    })
    return employee?.salary ?? '0'
  }

  let salary = promotions[0].oldSalary ?? '0'
  for (const promotion of promotions) {
    if (promotion.newSalary) {
      salary = promotion.newSalary
    }
  }
  return salary
}
