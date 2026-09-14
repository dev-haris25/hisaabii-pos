/**
 * Stable data-tour ids for sidebar hrefs used by the product tour.
 * @type {Record<string, string>}
 */
export const SIDEBAR_HREF_TO_TOUR_ID = {
  '/': 'dashboard',
  '/restaurants/create': 'restaurants-create',
  '/restaurants': 'restaurants-list',
  '/pos': 'pos',
  '/menu': 'menu-list',
  '/menu/items/new': 'menu-add',
  '/menu/categories': 'menu-categories',
  '/invoices': 'invoices-list',
  '/invoices/credit-notes': 'credit-notes',
  '/invoices/debit-notes': 'debit-notes',
  '/hr/employees': 'hr-employees',
  '/hr/payslip-categories': 'hr-payslip-categories',
  '/hr/salary-slips': 'hr-salary-slips',
  '/hr/employee-payments': 'hr-employee-payments',
  '/hr/visa-status': 'hr-visa-status',
  '/settings': 'settings',
}

/**
 * @param {string} href
 * @returns {string | undefined}
 */
export function tourIdForSidebarHref(href) {
  return SIDEBAR_HREF_TO_TOUR_ID[href]
}
