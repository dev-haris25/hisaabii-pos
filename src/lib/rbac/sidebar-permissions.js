import { hasFullAccess } from '@/lib/rbac/ability-utils'

/**
 * Maps sidebar hrefs to CASL subjects for UI gating.
 *
 * @type {Record<string, { subject: string, action?: 'read' | 'create', subjectsAny?: string[] }>}
 */
export const SIDEBAR_HREF_PERMISSIONS = {
  '/': { subject: 'Dashboard', action: 'read' },
  '/restaurants': { subject: 'BusinessProfile', action: 'read' },
  '/restaurants/create': { subject: 'BusinessProfile', action: 'create' },
  '/pos': { subject: 'Pos', action: 'read' },
  '/pos?tab=tables': { subject: 'TableSession', action: 'read' },
  '/kitchen': { subject: 'KitchenBoard', action: 'read' },
  '/queue': { subject: 'KitchenBoard', action: 'read' },
  '/menu': { subject: 'MenuItem', action: 'read' },
  '/menu/items/new': { subject: 'MenuItem', action: 'create' },
  '/menu/categories': { subject: 'MenuCategory', action: 'read' },
  '/stock': { subject: 'StockItem', action: 'read' },
  '/stock/items/new': { subject: 'StockItem', action: 'create' },
  '/stock/movements': { subject: 'StockItem', action: 'read' },
  '/stock/kitchen': { subject: 'StockItem', action: 'read' },
  '/stock/wastage': { subject: 'StockItem', action: 'read' },
  '/stock/day-end': { subject: 'StockItem', action: 'read' },
  '/coupons': { subject: 'Coupon', action: 'read' },
  '/coupons/new': { subject: 'Coupon', action: 'create' },
  '/offers': { subject: 'Offer', action: 'read' },
  '/offers/new': { subject: 'Offer', action: 'create' },
  '/loyalty': { subject: 'Loyalty', action: 'read' },
  '/loyalty/settings': { subject: 'Loyalty', action: 'read' },
  '/loyalty/customers': { subject: 'Loyalty', action: 'read' },
  // E-Waiter: manage tables & QR (admins/managers). Floor is /pos?tab=tables.
  '/tables': { subject: 'ETable', action: 'read' },
  '/table-sessions': { subject: 'TableSession', action: 'read' },
  '/invoices': { subject: 'Invoice', action: 'read' },
  '/invoices/credit-notes': { subject: 'CreditNote', action: 'read' },
  '/invoices/debit-notes': { subject: 'DebitNote', action: 'read' },
  '/hr/employees': { subject: 'Employee', action: 'read' },
  '/hr/employees/add': { subject: 'Employee', action: 'create' },
  '/hr/payslip-categories': { subject: 'PayslipCategory', action: 'read' },
  '/hr/employee-payments': { subject: 'EmployeePayment', action: 'read' },
  '/hr/salary-slips': { subject: 'SalarySlip', action: 'read' },
  '/hr/visa-status': { subject: 'VisaStatus', action: 'read' },
  '/reports/sales': { subject: 'ReportSales', action: 'read' },
  '/reports/menu-items': { subject: 'ReportMenuItems', action: 'read' },
  '/reports/tax': { subject: 'ReportTax', action: 'read' },
  '/reports/daily': { subject: 'ReportDaily', action: 'read' },
  '/reports/date-range-summary': { subject: 'ReportDateRangeSummary', action: 'read' },
  '/reports/comparison': { subject: 'ReportComparison', action: 'read' },
  '/reports/cashiers': { subject: 'ReportCashiers', action: 'read' },
  '/reports/payments': { subject: 'ReportPayments', action: 'read' },
  '/reports/zatca-status': { subject: 'ReportZatcaStatus', action: 'read' },
  '/reports/credit-debit-notes': { subject: 'ReportCreditDebitNotes', action: 'read' },
  '/reports/voids': { subject: 'ReportVoids', action: 'read' },
  '/reports/discounts': { subject: 'ReportDiscounts', action: 'read' },
  '/reports/categories': { subject: 'ReportCategories', action: 'read' },
  '/reports/salary-slips': { subject: 'ReportSalarySlips', action: 'read' },
  '/reports/employee-payments': { subject: 'ReportEmployeePayments', action: 'read' },
  '/reports/advances': { subject: 'ReportAdvances', action: 'read' },
  // /settings is open to all authenticated roles (lands on Profile)
}

/**
 * List/create restaurants is owner-only (Admin keeps settings + switcher).
 * @param {string} href
 */
export function isRestaurantPortfolioHref(href) {
  return href === '/restaurants' || href === '/restaurants/create'
}

/**
 * @param {import('@casl/ability').MongoAbility} ability
 * @param {string} href
 * @param {{ isRestaurantOwner?: boolean }} [options]
 */
export function canAccessSidebarHref(ability, href, options = {}) {
  if (isRestaurantPortfolioHref(href) && options.isRestaurantOwner !== true) {
    return false
  }
  if (href === '/kitchen' || href === '/queue') {
    return hasFullAccess(ability) || options.isRestaurantOwner === true
  }
  if (hasFullAccess(ability)) return true
  const rule = SIDEBAR_HREF_PERMISSIONS[href]
  if (!rule) return true
  if (rule.subjectsAny?.length) {
    return rule.subjectsAny.some((subject) => ability.can(rule.action ?? 'read', subject))
  }
  return ability.can(rule.action ?? 'read', rule.subject)
}

/**
 * @param {import('@casl/ability').MongoAbility} ability
 * @param {Array<{ href: string, [key: string]: unknown }>} children
 * @param {{ isRestaurantOwner?: boolean }} [options]
 */
export function filterSidebarChildren(ability, children, options = {}) {
  return children.filter((child) =>
    canAccessSidebarHref(ability, child.href, options),
  )
}

/**
 * First accessible top-level route for post-login redirect.
 * @param {import('@casl/ability').MongoAbility} ability
 * @param {{ isRestaurantOwner?: boolean }} [options]
 * @returns {string}
 */
export function getFirstAccessibleRouteFromAbility(ability, options = {}) {
  const order = [
    '/',
    '/pos',
    '/pos?tab=tables',
    '/invoices',
    '/menu',
    '/stock',
    '/hr/employees',
    '/reports/sales',
    '/reports/salary-slips',
    '/restaurants',
    '/settings',
  ]
  for (const href of order) {
    if (canAccessSidebarHref(ability, href, options)) return href
  }
  return '/pos'
}
