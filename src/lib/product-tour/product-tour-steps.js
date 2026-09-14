/**
 * Product tour step definitions (targets + CASL/sidebar gates).
 * Copy lives in next-intl `ProductTour` namespace.
 */

import { canAccessSidebarHref, SIDEBAR_HREF_PERMISSIONS } from '@/lib/rbac/sidebar-permissions'

/**
 * @typedef {{
 *   id: string
 *   target: string
 *   titleKey: string
 *   bodyKey: string
 *   href?: string
 *   sidebarSectionId?: string
 *   openSwitcher?: boolean
 *   settingsHref?: string
 *   settingsAlways?: boolean
 *   reportsGroup?: boolean
 * }} ProductTourStepDef
 */

/** Child hrefs per expandable sidebar group (for section visibility). */
export const SIDEBAR_SECTION_CHILD_HREFS = {
  restaurants: ['/restaurants', '/restaurants/create'],
  menu: ['/menu', '/menu/items/new', '/menu/categories'],
  invoices: ['/invoices', '/invoices/credit-notes', '/invoices/debit-notes'],
  hr: [
    '/hr/employees',
    '/hr/payslip-categories',
    '/hr/salary-slips',
    '/hr/employee-payments',
    '/hr/visa-status',
  ],
  reports: Object.keys(SIDEBAR_HREF_PERMISSIONS).filter((h) =>
    h.startsWith('/reports/'),
  ),
}

/** @type {ProductTourStepDef[]} */
export const PRODUCT_TOUR_STEP_DEFS = [
  {
    id: 'dashboard',
    target: '[data-tour="dashboard"]',
    titleKey: 'dashboardTitle',
    bodyKey: 'dashboardBody',
    href: '/',
  },
  {
    id: 'restaurants-list',
    target: '[data-tour="restaurants-list"]',
    titleKey: 'restaurantsListTitle',
    bodyKey: 'restaurantsListBody',
    href: '/restaurants',
    sidebarSectionId: 'restaurants',
  },
  {
    id: 'restaurants-create',
    target: '[data-tour="restaurants-create"]',
    titleKey: 'restaurantsCreateTitle',
    bodyKey: 'restaurantsCreateBody',
    href: '/restaurants/create',
    sidebarSectionId: 'restaurants',
  },
  {
    id: 'restaurants-switcher',
    target: '[data-tour="restaurants-switcher"]',
    titleKey: 'restaurantsSwitcherTitle',
    bodyKey: 'restaurantsSwitcherBody',
    href: '/restaurants',
  },
  {
    id: 'pos',
    target: '[data-tour="pos"]',
    titleKey: 'posTitle',
    bodyKey: 'posBody',
    href: '/pos',
  },
  {
    id: 'menu-list',
    target: '[data-tour="menu-list"]',
    titleKey: 'menuListTitle',
    bodyKey: 'menuListBody',
    href: '/menu',
    sidebarSectionId: 'menu',
  },
  {
    id: 'menu-add',
    target: '[data-tour="menu-add"]',
    titleKey: 'menuAddTitle',
    bodyKey: 'menuAddBody',
    href: '/menu/items/new',
    sidebarSectionId: 'menu',
  },
  {
    id: 'menu-categories',
    target: '[data-tour="menu-categories"]',
    titleKey: 'menuCategoriesTitle',
    bodyKey: 'menuCategoriesBody',
    href: '/menu/categories',
    sidebarSectionId: 'menu',
  },
  {
    id: 'invoices-list',
    target: '[data-tour="invoices-list"]',
    titleKey: 'invoicesListTitle',
    bodyKey: 'invoicesListBody',
    href: '/invoices',
    sidebarSectionId: 'invoices',
  },
  {
    id: 'credit-notes',
    target: '[data-tour="credit-notes"]',
    titleKey: 'creditNotesTitle',
    bodyKey: 'creditNotesBody',
    href: '/invoices/credit-notes',
    sidebarSectionId: 'invoices',
  },
  {
    id: 'debit-notes',
    target: '[data-tour="debit-notes"]',
    titleKey: 'debitNotesTitle',
    bodyKey: 'debitNotesBody',
    href: '/invoices/debit-notes',
    sidebarSectionId: 'invoices',
  },
  {
    id: 'hr-employees',
    target: '[data-tour="hr-employees"]',
    titleKey: 'hrEmployeesTitle',
    bodyKey: 'hrEmployeesBody',
    href: '/hr/employees',
    sidebarSectionId: 'hr',
  },
  {
    id: 'hr-payslip-categories',
    target: '[data-tour="hr-payslip-categories"]',
    titleKey: 'hrPayslipCategoriesTitle',
    bodyKey: 'hrPayslipCategoriesBody',
    href: '/hr/payslip-categories',
    sidebarSectionId: 'hr',
  },
  {
    id: 'hr-salary-slips',
    target: '[data-tour="hr-salary-slips"]',
    titleKey: 'hrSalarySlipsTitle',
    bodyKey: 'hrSalarySlipsBody',
    href: '/hr/salary-slips',
    sidebarSectionId: 'hr',
  },
  {
    id: 'hr-employee-payments',
    target: '[data-tour="hr-employee-payments"]',
    titleKey: 'hrEmployeePaymentsTitle',
    bodyKey: 'hrEmployeePaymentsBody',
    href: '/hr/employee-payments',
    sidebarSectionId: 'hr',
  },
  {
    id: 'hr-visa-status',
    target: '[data-tour="hr-visa-status"]',
    titleKey: 'hrVisaStatusTitle',
    bodyKey: 'hrVisaStatusBody',
    href: '/hr/visa-status',
    sidebarSectionId: 'hr',
  },
  {
    id: 'reports',
    target: '[data-tour="reports"]',
    titleKey: 'reportsTitle',
    bodyKey: 'reportsBody',
    sidebarSectionId: 'reports',
    reportsGroup: true,
  },
  {
    id: 'settings',
    target: '[data-tour="settings"]',
    titleKey: 'settingsTitle',
    bodyKey: 'settingsBody',
    href: '/settings',
  },
]

/** Minimum filtered steps required to offer/start a tour. */
export const PRODUCT_TOUR_MIN_STEPS = 2

/**
 * First accessible `(app)` route for starting the tour.
 * Skips `/pos` (standalone layout remounts the shell / Joyride).
 *
 * @param {import('@casl/ability').MongoAbility} ability
 * @returns {string}
 */
export function getTourStartHref(ability, options = {}) {
  const order = [
    '/',
    '/invoices',
    '/menu',
    '/hr/employees',
    '/reports/sales',
    '/reports/salary-slips',
    '/restaurants',
    '/settings',
  ]
  for (const href of order) {
    if (canAccessSidebarHref(ability, href, options)) return href
  }
  return '/settings'
}

/**
 * @param {{
 *   canAccessHref: (href: string) => boolean
 *   hasSidebarSection: (sectionId: string) => boolean
 * }} gates
 * @returns {ProductTourStepDef[]}
 */
export function filterProductTourStepDefs({ canAccessHref, hasSidebarSection }) {
  return PRODUCT_TOUR_STEP_DEFS.filter((step) => {
    if (step.reportsGroup) {
      if (!hasSidebarSection('reports')) return false
      return SIDEBAR_SECTION_CHILD_HREFS.reports.some((href) =>
        canAccessHref(href),
      )
    }

    if (step.sidebarSectionId && !hasSidebarSection(step.sidebarSectionId)) {
      return false
    }

    if (step.href) {
      return canAccessHref(step.href)
    }

    return true
  })
}
