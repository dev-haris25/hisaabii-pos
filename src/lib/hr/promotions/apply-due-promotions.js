import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { currentPayPeriod } from '@/lib/hr/promotions/current-pay-period'

/**
 * @param {import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 */
export async function applyDuePromotionsForProfile(db, businessProfileId) {
  const currentMonth = currentPayPeriod()
  const pending = await db.employeePromotion.findMany({
    where: {
      businessProfileId,
      effectiveFrom: { lte: currentMonth },
      appliedToEmployee: false,
      ...WHERE_NOT_DELETED,
    },
    select: { employeeId: true },
    distinct: ['employeeId'],
  })

  for (const row of pending) {
    await applyDuePromotions(db, row.employeeId)
  }
}

/**
 * @param {import('@/lib/prisma').prisma} db
 * @param {string} employeeId
 */
export async function applyDuePromotions(db, employeeId) {
  const currentMonth = currentPayPeriod()
  const due = await db.employeePromotion.findMany({
    where: {
      employeeId,
      effectiveFrom: { lte: currentMonth },
      appliedToEmployee: false,
      ...WHERE_NOT_DELETED,
    },
    orderBy: [{ effectiveFrom: 'asc' }, { promotedAt: 'asc' }],
  })

  if (due.length === 0) return

  for (const promotion of due) {
    if (promotion.newSalary != null) {
      await db.employee.update({
        where: { id: employeeId },
        data: { salary: promotion.newSalary },
      })
    }

    await db.employeePromotion.update({
      where: { id: promotion.id },
      data: { appliedToEmployee: true },
    })
  }
}
