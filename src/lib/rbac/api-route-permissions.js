/**
 * Maps `/api/auth/*` paths + HTTP methods to CASL action/subject pairs.
 *
 * @type {Array<{
 *   pattern: RegExp
 *   methods: Partial<Record<string, { action: string, subject: string }>>
 * }>}
 */
const ROUTE_PERMISSIONS = [
  {
    pattern: /^\/orders\/[^/]+\/status/,
    methods: {
      PATCH: { action: 'update', subject: 'KitchenBoard' },
    },
  },
  {
    pattern: /^\/orders\/board/,
    methods: {
      GET: { action: 'read', subject: 'KitchenBoard' },
    },
  },
  {
    pattern: /^\/business-profiles/,
    methods: {
      GET: { action: 'read', subject: 'BusinessProfile' },
      POST: { action: 'create', subject: 'BusinessProfile' },
      PATCH: { action: 'update', subject: 'BusinessProfile' },
      DELETE: { action: 'delete', subject: 'BusinessProfile' },
    },
  },
  {
    pattern: /^\/menu\/(items|categories)/,
    methods: {
      GET: { action: 'read', subject: 'MenuItem' },
      POST: { action: 'create', subject: 'MenuItem' },
      PATCH: { action: 'update', subject: 'MenuItem' },
      DELETE: { action: 'delete', subject: 'MenuItem' },
    },
  },
  {
    pattern: /^\/coupons/,
    methods: {
      GET: { action: 'read', subject: 'Coupon' },
      POST: { action: 'create', subject: 'Coupon' },
      PATCH: { action: 'update', subject: 'Coupon' },
      DELETE: { action: 'delete', subject: 'Coupon' },
    },
  },
  {
    pattern: /^\/stock\/days/,
    methods: {
      GET: { action: 'read', subject: 'StockItem' },
      POST: { action: 'update', subject: 'StockItem' },
      PATCH: { action: 'update', subject: 'StockItem' },
    },
  },
  {
    pattern: /^\/stock\/items\/[^/]+\/movements/,
    methods: {
      GET: { action: 'read', subject: 'StockItem' },
      POST: { action: 'update', subject: 'StockItem' },
    },
  },
  {
    pattern: /^\/stock\/(items|movements)/,
    methods: {
      GET: { action: 'read', subject: 'StockItem' },
      POST: { action: 'create', subject: 'StockItem' },
      PATCH: { action: 'update', subject: 'StockItem' },
      DELETE: { action: 'delete', subject: 'StockItem' },
    },
  },
  {
    pattern: /^\/pos\/checkout/,
    methods: {
      POST: { action: 'create', subject: 'Pos' },
    },
  },
  {
    pattern: /^\/pos\/coupons/,
    methods: {
      POST: { action: 'create', subject: 'Pos' },
    },
  },
  {
    pattern: /^\/pos\/menu/,
    methods: {
      GET: { action: 'read', subject: 'Pos' },
    },
  },
  {
    pattern: /^\/pos\/till/,
    methods: {
      GET: { action: 'read', subject: 'Pos' },
    },
  },
  {
    pattern: /^\/pos\/print/,
    methods: {
      POST: { action: 'create', subject: 'Pos' },
    },
  },
  {
    pattern: /^\/invoices/,
    methods: {
      GET: { action: 'read', subject: 'Invoice' },
      POST: { action: 'create', subject: 'Invoice' },
      PATCH: { action: 'update', subject: 'Invoice' },
      DELETE: { action: 'delete', subject: 'Invoice' },
    },
  },
  {
    pattern: /^\/credit-notes/,
    methods: {
      GET: { action: 'read', subject: 'CreditNote' },
      POST: { action: 'create', subject: 'CreditNote' },
      PATCH: { action: 'update', subject: 'CreditNote' },
      DELETE: { action: 'delete', subject: 'CreditNote' },
    },
  },
  {
    pattern: /^\/debit-notes/,
    methods: {
      GET: { action: 'read', subject: 'DebitNote' },
      POST: { action: 'create', subject: 'DebitNote' },
      PATCH: { action: 'update', subject: 'DebitNote' },
      DELETE: { action: 'delete', subject: 'DebitNote' },
    },
  },
  {
    pattern: /^\/tills/,
    methods: {
      GET: { action: 'read', subject: 'BusinessSettings' },
      POST: { action: 'update', subject: 'BusinessSettings' },
      PATCH: { action: 'update', subject: 'BusinessSettings' },
      DELETE: { action: 'update', subject: 'BusinessSettings' },
    },
  },
  {
    pattern: /^\/settings/,
    methods: {
      GET: { action: 'read', subject: 'BusinessSettings' },
      PATCH: { action: 'update', subject: 'BusinessSettings' },
      POST: { action: 'update', subject: 'BusinessSettings' },
    },
  },
  {
    pattern: /^\/hr\/employees\/[^/]+\/promotions/,
    methods: {
      GET: { action: 'read', subject: 'Employee' },
      POST: { action: 'update', subject: 'Employee' },
    },
  },
  {
    pattern: /^\/hr\/employees/,
    methods: {
      GET: { action: 'read', subject: 'Employee' },
      POST: { action: 'create', subject: 'Employee' },
      PATCH: { action: 'update', subject: 'Employee' },
      DELETE: { action: 'delete', subject: 'Employee' },
    },
  },
  {
    pattern: /^\/hr\/payslip-categories/,
    methods: {
      GET: { action: 'read', subject: 'PayslipCategory' },
      POST: { action: 'create', subject: 'PayslipCategory' },
      PATCH: { action: 'update', subject: 'PayslipCategory' },
      DELETE: { action: 'delete', subject: 'PayslipCategory' },
    },
  },
  {
    pattern: /^\/hr\/salary-slips/,
    methods: {
      GET: { action: 'read', subject: 'SalarySlip' },
      POST: { action: 'create', subject: 'SalarySlip' },
      PATCH: { action: 'update', subject: 'SalarySlip' },
      DELETE: { action: 'delete', subject: 'SalarySlip' },
    },
  },
  {
    pattern: /^\/hr\/employee-payments/,
    methods: {
      GET: { action: 'read', subject: 'EmployeePayment' },
      POST: { action: 'create', subject: 'EmployeePayment' },
      PATCH: { action: 'update', subject: 'EmployeePayment' },
      DELETE: { action: 'delete', subject: 'EmployeePayment' },
    },
  },
  {
    pattern: /^\/hr\/id-types/,
    methods: {
      GET: { action: 'read', subject: 'Employee' },
      POST: { action: 'create', subject: 'Employee' },
      PATCH: { action: 'update', subject: 'Employee' },
      DELETE: { action: 'delete', subject: 'Employee' },
    },
  },
  {
    pattern: /^\/hr\/visa-status/,
    methods: {
      GET: { action: 'read', subject: 'VisaStatus' },
      POST: { action: 'create', subject: 'VisaStatus' },
      PATCH: { action: 'update', subject: 'VisaStatus' },
      DELETE: { action: 'delete', subject: 'VisaStatus' },
    },
  },
  {
    pattern: /^\/hr\/roles/,
    methods: {
      GET: { action: 'read', subject: 'Employee' },
    },
  },
  {
    pattern: /^\/dashboard/,
    methods: {
      GET: { action: 'read', subject: 'Dashboard' },
    },
  },
  {
    pattern: /^\/hr\/invitations/,
    methods: {
      GET: { action: 'read', subject: 'Employee' },
      POST: { action: 'create', subject: 'Employee' },
    },
  },
  { pattern: /^\/reports\/sales/, methods: { GET: { action: 'read', subject: 'ReportSales' } } },
  {
    pattern: /^\/reports\/menu-items/,
    methods: { GET: { action: 'read', subject: 'ReportMenuItems' } },
  },
  { pattern: /^\/reports\/tax/, methods: { GET: { action: 'read', subject: 'ReportTax' } } },
  { pattern: /^\/reports\/daily/, methods: { GET: { action: 'read', subject: 'ReportDaily' } } },
  {
    pattern: /^\/reports\/date-range-summary/,
    methods: { GET: { action: 'read', subject: 'ReportDateRangeSummary' } },
  },
  {
    pattern: /^\/reports\/comparison/,
    methods: { GET: { action: 'read', subject: 'ReportComparison' } },
  },
  {
    pattern: /^\/reports\/cashiers/,
    methods: { GET: { action: 'read', subject: 'ReportCashiers' } },
  },
  {
    pattern: /^\/reports\/payments/,
    methods: { GET: { action: 'read', subject: 'ReportPayments' } },
  },
  {
    pattern: /^\/reports\/zatca-status/,
    methods: { GET: { action: 'read', subject: 'ReportZatcaStatus' } },
  },
  {
    pattern: /^\/reports\/credit-debit-notes/,
    methods: { GET: { action: 'read', subject: 'ReportCreditDebitNotes' } },
  },
  { pattern: /^\/reports\/voids/, methods: { GET: { action: 'read', subject: 'ReportVoids' } } },
  {
    pattern: /^\/reports\/discounts/,
    methods: { GET: { action: 'read', subject: 'ReportDiscounts' } },
  },
  {
    pattern: /^\/reports\/categories/,
    methods: { GET: { action: 'read', subject: 'ReportCategories' } },
  },
  {
    pattern: /^\/reports\/salary-slips/,
    methods: { GET: { action: 'read', subject: 'ReportSalarySlips' } },
  },
  {
    pattern: /^\/reports\/employee-payments/,
    methods: { GET: { action: 'read', subject: 'ReportEmployeePayments' } },
  },
  {
    pattern: /^\/reports\/advances/,
    methods: { GET: { action: 'read', subject: 'ReportAdvances' } },
  },
]

/**
 * @param {string} apiPath path after `/api/auth`
 * @param {string} method HTTP method
 * @returns {{ action: string, subject: string } | null}
 */
export function resolveApiRoutePermission(apiPath, method) {
  const normalized = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const upper = String(method || 'GET').toUpperCase()
  for (const entry of ROUTE_PERMISSIONS) {
    if (!entry.pattern.test(normalized)) continue
    return entry.methods[upper] ?? null
  }
  return null
}
