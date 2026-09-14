/**
 * @param {{
 *   id: string
 *   employeeId: string
 *   oldSalary?: string | null
 *   newSalary?: string | null
 *   effectiveFrom: string
 *   notes?: string | null
 *   appliedToEmployee: boolean
 *   promotedAt: Date
 * }} row
 */
export function mapPromotionToJson(row) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    oldSalary: row.oldSalary ?? null,
    newSalary: row.newSalary ?? null,
    effectiveFrom: row.effectiveFrom,
    notes: row.notes ?? null,
    appliedToEmployee: row.appliedToEmployee,
    promotedAt: row.promotedAt.toISOString(),
  }
}

/** @param {Parameters<typeof mapPromotionToJson>[0][]} rows */
export function mapPromotionsToJson(rows) {
  return rows.map(mapPromotionToJson)
}
