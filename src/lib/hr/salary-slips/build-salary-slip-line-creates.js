import { computeSalarySlipTotals } from '@/lib/hr/salary-slips/compute-salary-slip-totals'

/**
 * @param {Array<{
 *   payslipCategoryId?: string | null
 *   categoryType: 'earning' | 'deduction'
 *   description?: string
 *   unit?: string
 *   unitRate?: string
 *   sortOrder?: number
 * }>} lines
 */
export function buildSalarySlipLineCreates(lines) {
  const { perLine } = computeSalarySlipTotals(lines)
  return perLine.map((line, idx) => ({
    payslipCategoryId: line.payslipCategoryId ?? null,
    categoryType: line.categoryType,
    description: line.description ?? '',
    unit: line.unit ?? '1',
    unitRate: line.unitRate ?? '0',
    total: line.total,
    sortOrder: line.sortOrder ?? idx,
  }))
}

/**
 * @param {Array<{
 *   categoryType: 'earning' | 'deduction'
 *   unit?: string
 *   unitRate?: string
 * }>} lines
 */
export function computeSalarySlipHeaderTotals(lines) {
  return computeSalarySlipTotals(lines)
}
