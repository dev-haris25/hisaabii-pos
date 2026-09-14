import { prisma } from '@/lib/prisma'

/** Canonical payslip category name for advance recovery (Hisabi parity). */
export const SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME = 'Advance'

/**
 * @param {string} businessProfileId
 */
export function systemAdvancePayslipCategoryId(businessProfileId) {
  return `payslip_cat_advance_${businessProfileId}`
}

/**
 * True when this row is the protected Advance deduction category
 * (by deterministic id or by canonical name).
 *
 * @param {{ id?: string, name?: string | null, businessProfileId?: string } | null | undefined} row
 */
export function isSystemAdvancePayslipCategory(row) {
  if (!row) return false
  const name = String(row.name ?? '').trim()
  if (name.toLowerCase() === SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME.toLowerCase()) {
    return true
  }
  if (
    row.businessProfileId &&
    row.id === systemAdvancePayslipCategoryId(row.businessProfileId)
  ) {
    return true
  }
  return false
}

/**
 * Ensure the system Advance deduction category exists for a restaurant.
 * Restores soft-deleted rows and normalizes name/type.
 *
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} [tx]
 */
export async function ensureSystemAdvancePayslipCategory(
  businessProfileId,
  tx = prisma,
) {
  const id = systemAdvancePayslipCategoryId(businessProfileId)

  const byId = await tx.payslipCategory.findUnique({ where: { id } })
  if (byId) {
    await tx.payslipCategory.update({
      where: { id },
      data: {
        name: SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME,
        type: 'deduction',
        deletedAt: null,
      },
    })
    return id
  }

  const byName = await tx.payslipCategory.findFirst({
    where: {
      businessProfileId,
      name: { equals: SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME, mode: 'insensitive' },
    },
    orderBy: [{ deletedAt: 'asc' }, { createdAt: 'asc' }],
  })

  if (byName) {
    await tx.payslipCategory.update({
      where: { id: byName.id },
      data: {
        name: SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME,
        type: 'deduction',
        deletedAt: null,
      },
    })
    return byName.id
  }

  await tx.payslipCategory.create({
    data: {
      id,
      businessProfileId,
      name: SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME,
      type: 'deduction',
      defaultAmount: '0',
    },
  })
  return id
}
