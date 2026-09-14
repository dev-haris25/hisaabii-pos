/** @param {Date | null | undefined} d */
function toIsoDate(d) {
  return d ? d.toISOString() : null
}

/**
 * @param {{
 *   id: string
 *   voucherNumber: string
 *   employeeId: string
 *   employee?: { id: string, name: string } | null
 *   slipDate: Date
 *   referenceNumber?: string | null
 *   description?: string | null
 *   basicPay: string
 *   totalEarnings: string
 *   totalDeductions: string
 *   netTotal: string
 *   createdAt: Date
 *   updatedAt: Date
 *   lines?: Array<{
 *     id: string
 *     payslipCategoryId?: string | null
 *     payslipCategory?: { id: string, name: string, type: string } | null
 *     categoryType: string
 *     description: string
 *     unit: string
 *     unitRate: string
 *     total: string
 *     sortOrder: number
 *   }>
 * }} row
 */
export function mapSalarySlipToJson(row) {
  return {
    id: row.id,
    voucherNumber: row.voucherNumber ?? '',
    employeeId: row.employeeId,
    employeeName: row.employee?.name ?? null,
    employeeEmailOfficial: row.employee?.emailOfficial ?? null,
    employeeEmailPersonal: row.employee?.emailPersonal ?? null,
    employeeNationality: row.employee?.nationality ?? null,
    employeePassportNumber: row.employee?.passportNumber ?? null,
    employeeIdNumber: row.employee?.idNumber ?? null,
    employeeJoiningDate: row.employee?.joiningDate ? toIsoDate(row.employee.joiningDate) : null,
    employeeBankAccountName: row.employee?.bankAccountName ?? null,
    employeeBankAccountNumber: row.employee?.bankAccountNumber ?? null,
    employeeBankName: row.employee?.bankName ?? null,
    employeeBankIban: row.employee?.bankIban ?? null,
    slipDate: row.slipDate.toISOString(),
    referenceNumber: row.referenceNumber ?? '',
    description: row.description ?? '',
    basicPay: row.basicPay ?? '0',
    totalEarnings: row.totalEarnings ?? '0',
    totalDeductions: row.totalDeductions ?? '0',
    netTotal: row.netTotal ?? '0',
    preparedBySignatureStoragePath: row.preparedBySignatureStoragePath ?? null,
    preparedBySignatureMimeType: row.preparedBySignatureMimeType ?? null,
    createdByUserId: row.createdByUserId ?? null,
    createdByName: row.createdByUser?.name ?? null,
    lines: (row.lines ?? []).map((line) => ({
      id: line.id,
      payslipCategoryId: line.payslipCategoryId ?? null,
      payslipCategoryName: line.payslipCategory?.name ?? null,
      categoryType: line.categoryType,
      description: line.description ?? '',
      unit: line.unit ?? '1',
      unitRate: line.unitRate ?? '0',
      total: line.total ?? '0',
      sortOrder: line.sortOrder ?? 0,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * @param {Parameters<typeof mapSalarySlipToJson>[0][]} rows
 */
export function mapSalarySlipsToJson(rows) {
  return rows.map(mapSalarySlipToJson)
}
