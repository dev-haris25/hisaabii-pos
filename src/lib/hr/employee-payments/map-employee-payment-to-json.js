/**
 * @param {{
 *   id: string
 *   employeeId: string
 *   employee?: { id: string, name: string } | null
 *   paymentDate: Date
 *   paymentType: string
 *   payPeriod?: string | null
 *   splitGroupId?: string | null
 *   amount: string
 *   paymentMethod: string
 *   remarks?: string | null
 *   createdAt: Date
 *   updatedAt: Date
 * }} row
 */
export function mapEmployeePaymentToJson(row) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee?.name ?? null,
    paymentDate: row.paymentDate.toISOString(),
    paymentType: row.paymentType,
    payPeriod: row.payPeriod ?? null,
    splitGroupId: row.splitGroupId ?? null,
    amount: row.amount ?? '0',
    paymentMethod: row.paymentMethod,
    remarks: row.remarks ?? '',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * @param {Parameters<typeof mapEmployeePaymentToJson>[0][]} rows
 */
export function mapEmployeePaymentsToJson(rows) {
  return rows.map(mapEmployeePaymentToJson)
}
