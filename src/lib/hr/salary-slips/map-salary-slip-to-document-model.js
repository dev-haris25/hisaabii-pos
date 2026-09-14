import {
  companyInitialsForName,
  parseInvoiceMoney,
  preparedBySignatureUrlForDocument,
  sellerLogoUrlForInvoice,
} from '@/lib/invoices/invoice-document-utils'

/** @param {string | number | null | undefined} v */
function parseMoney(v) {
  return parseInvoiceMoney(v)
}

/** @param {Date | string} d */
function toIsoDate(d) {
  if (d instanceof Date) return d.toISOString()
  return String(d ?? '')
}

/**
 * @param {{
 *   id: string
 *   voucherNumber: string
 *   slipDate: Date
 *   referenceNumber?: string | null
 *   description?: string | null
 *   basicPay: string
 *   totalEarnings: string
 *   totalDeductions: string
 *   netTotal: string
 *   lines?: Array<{
 *     id: string
 *     categoryType: string
 *     description: string
 *     unit: string
 *     unitRate: string
 *     total: string
 *     payslipCategory?: { name: string } | null
 *   }>
 *   employee?: {
 *     name: string
 *     idNumber?: string | null
 *     joiningDate?: Date | null
 *     bankAccountName?: string | null
 *     bankAccountNumber?: string | null
 *     bankName?: string | null
 *     bankIban?: string | null
 *   } | null
 * }} slip
 * @param {{
 *   id: string
 *   companyNameAr: string
 *   companyNameEn?: string | null
 *   addressAr?: string
 *   addressEn?: string | null
 *   crNumber?: string
 *   vatNumber?: string
 *   logoStoragePath?: string | null
 *   updatedAt: Date | string
 * }} profile
 * @param {'en' | 'ar'} locale
 */
export function mapSalarySlipToDocumentModel(slip, profile, locale) {
  const sellerDisplayName =
    (locale === 'ar' ? profile.companyNameAr : profile.companyNameEn?.trim()) ||
    profile.companyNameEn?.trim() ||
    profile.companyNameAr?.trim() ||
    '—'

  const address =
    (locale === 'ar'
      ? profile.addressAr?.trim()
      : profile.addressEn?.trim() || profile.addressAr?.trim()) || '—'

  const slipIso = toIsoDate(slip.slipDate)
  const payPeriod = slipIso.slice(0, 7)

  /** @type {Array<{ id: string, categoryName: string, description: string, unit: string, unitRate: number, total: number }>} */
  const earnings = []
  /** @type {typeof earnings} */
  const deductions = []

  for (const line of slip.lines ?? []) {
    const item = {
      id: line.id,
      categoryName: line.payslipCategory?.name?.trim() || '',
      description: line.description?.trim() || '',
      unit: line.unit?.trim() || '1',
      unitRate: parseMoney(line.unitRate),
      total: parseMoney(line.total),
    }
    if (line.categoryType === 'deduction') {
      deductions.push(item)
    } else {
      earnings.push(item)
    }
  }

  const employee = slip.employee

  return {
    voucherNumber: slip.voucherNumber?.trim() || '—',
    slipDate: slipIso,
    payPeriod,
    referenceNumber: slip.referenceNumber?.trim() || null,
    description: slip.description?.trim() || null,
    employer: {
      displayName: sellerDisplayName,
      logoUrl: sellerLogoUrlForInvoice(
        profile.id,
        profile.updatedAt ?? '',
        Boolean(profile.logoStoragePath),
      ),
      logoInitials: companyInitialsForName(sellerDisplayName),
      address,
      crNumber: profile.crNumber?.trim() || null,
      vatNumber: profile.vatNumber?.trim() || null,
    },
    employee: {
      name: employee?.name?.trim() || '—',
      idNumber: employee?.idNumber?.trim() || null,
      joiningDate: employee?.joiningDate ? toIsoDate(employee.joiningDate) : null,
      bankAccountName: employee?.bankAccountName?.trim() || null,
      bankAccountNumber: employee?.bankAccountNumber?.trim() || null,
      bankName: employee?.bankName?.trim() || null,
      bankIban: employee?.bankIban?.trim() || null,
    },
    basicPay: parseMoney(slip.basicPay),
    earnings,
    deductions,
    totalEarnings: parseMoney(slip.totalEarnings),
    totalDeductions: parseMoney(slip.totalDeductions),
    netPay: parseMoney(slip.netTotal),
    preparedByUrl: preparedBySignatureUrlForDocument(
      slip.id ?? '',
      slip.updatedAt ?? '',
      Boolean(slip.preparedBySignatureStoragePath),
      '/api/auth/hr/salary-slips',
    ),
    preparedByName: (() => {
      const fromJson =
        typeof slip.createdByName === 'string' ? slip.createdByName.trim() : ''
      if (fromJson) return fromJson
      const fromRelation =
        typeof slip.createdByUser?.name === 'string' ? slip.createdByUser.name.trim() : ''
      return fromRelation || null
    })(),
  }
}

/** @param {Record<string, unknown>} profile */
export function profileForSalarySlipDocument(profile) {
  return {
    id: String(profile.id ?? ''),
    companyNameAr: String(profile.companyNameAr ?? ''),
    companyNameEn: profile.companyNameEn ? String(profile.companyNameEn) : null,
    addressAr: String(profile.addressAr ?? ''),
    addressEn: profile.addressEn ? String(profile.addressEn) : null,
    crNumber: String(profile.crNumber ?? ''),
    vatNumber: String(profile.vatNumber ?? ''),
    logoStoragePath: profile.hasLogo ? '1' : null,
    updatedAt: String(profile.updatedAt ?? ''),
  }
}

/**
 * @param {ReturnType<typeof import('./map-salary-slip-to-json').mapSalarySlipToJson>} slip
 * @param {ReturnType<typeof profileForSalarySlipDocument>} profile
 * @param {'en' | 'ar'} locale
 */
export function mapSalarySlipJsonToDocumentModel(slip, profile, locale) {
  return mapSalarySlipToDocumentModel(
    {
      id: slip.id,
      voucherNumber: slip.voucherNumber,
      slipDate: new Date(slip.slipDate),
      referenceNumber: slip.referenceNumber || null,
      description: slip.description || null,
      basicPay: slip.basicPay,
      totalEarnings: slip.totalEarnings,
      totalDeductions: slip.totalDeductions,
      netTotal: slip.netTotal,
      updatedAt: slip.updatedAt,
      preparedBySignatureStoragePath: slip.preparedBySignatureStoragePath ?? null,
      createdByName: slip.createdByName ?? null,
      lines: (slip.lines ?? []).map((line) => ({
        id: line.id,
        categoryType: line.categoryType,
        description: line.description,
        unit: line.unit,
        unitRate: line.unitRate,
        total: line.total,
        payslipCategory: line.payslipCategoryName ? { name: line.payslipCategoryName } : null,
      })),
      employee: {
        name: slip.employeeName ?? '',
        idNumber: slip.employeeIdNumber ?? null,
        joiningDate: slip.employeeJoiningDate ? new Date(slip.employeeJoiningDate) : null,
        bankAccountName: slip.employeeBankAccountName ?? null,
        bankAccountNumber: slip.employeeBankAccountNumber ?? null,
        bankName: slip.employeeBankName ?? null,
        bankIban: slip.employeeBankIban ?? null,
      },
    },
    profile,
    locale,
  )
}
