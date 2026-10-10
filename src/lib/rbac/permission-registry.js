/** @typedef {'create' | 'read' | 'update' | 'delete'} CrudAction */

export const DEFAULT_CRUD_ACTIONS = /** @type {const} */ (['create', 'read', 'update', 'delete'])

export const READ_ONLY_ACTIONS = /** @type {const} */ (['read'])

/**
 * Permission registry — subjects grouped by sidebar module.
 * Drives seed data and server-side validation.
 *
 * @type {Record<string, { moduleLabelKey: string, subjects: Record<string, { labelKey?: string, actions?: readonly string[] }> }>}
 */
export const PERMISSION_REGISTRY = {
  dashboard: {
    moduleLabelKey: 'navDashboard',
    subjects: {
      Dashboard: { labelKey: 'subDashboard', actions: READ_ONLY_ACTIONS },
    },
  },
  restaurants: {
    moduleLabelKey: 'navRestaurants',
    subjects: {
      BusinessProfile: { labelKey: 'subRestaurantsList' },
    },
  },
  menu: {
    moduleLabelKey: 'navMenu',
    subjects: {
      MenuItem: { labelKey: 'subMenuList' },
      MenuCategory: { labelKey: 'subMenuCategories' },
    },
  },
  stock: {
    moduleLabelKey: 'navStock',
    subjects: {
      StockItem: { labelKey: 'subStockItems' },
    },
  },
  pos: {
    moduleLabelKey: 'navPos',
    subjects: {
      Pos: { labelKey: 'navPos' },
      Coupon: { labelKey: 'subCoupons' },
      Offer: { labelKey: 'subOffers' },
      Loyalty: { labelKey: 'subLoyalty' },
      ETable: { labelKey: 'subETables' },
      TableSession: { labelKey: 'subTableSessions' },
    },
  },
  kitchen: {
    moduleLabelKey: 'navKitchenBoard',
    subjects: {
      KitchenBoard: {
        labelKey: 'navKitchenBoard',
        actions: /** @type {const} */ (['read', 'update']),
      },
    },
  },
  invoices: {
    moduleLabelKey: 'navInvoices',
    subjects: {
      Invoice: { labelKey: 'subInvoicesList' },
      CreditNote: { labelKey: 'subCreditNotes' },
      DebitNote: { labelKey: 'subDebitNotes' },
    },
  },
  hr: {
    moduleLabelKey: 'navHr',
    subjects: {
      Employee: { labelKey: 'subHrEmployees' },
      SalarySlip: { labelKey: 'subHrSalarySlips' },
      EmployeePayment: { labelKey: 'subHrEmployeePayments' },
      PayslipCategory: { labelKey: 'subHrPayslipCategories' },
      VisaStatus: { labelKey: 'subHrVisaStatus' },
    },
  },
  reports: {
    moduleLabelKey: 'navReports',
    subjects: {
      ReportSales: { labelKey: 'subReportSales', actions: READ_ONLY_ACTIONS },
      ReportMenuItems: { labelKey: 'subReportMenuItems', actions: READ_ONLY_ACTIONS },
      ReportTax: { labelKey: 'subReportTax', actions: READ_ONLY_ACTIONS },
      ReportDaily: { labelKey: 'subReportDaily', actions: READ_ONLY_ACTIONS },
      ReportDateRangeSummary: { labelKey: 'subReportDateRangeSummary', actions: READ_ONLY_ACTIONS },
      ReportComparison: { labelKey: 'subReportComparison', actions: READ_ONLY_ACTIONS },
      ReportCashiers: { labelKey: 'subReportCashiers', actions: READ_ONLY_ACTIONS },
      ReportPayments: { labelKey: 'subReportPayments', actions: READ_ONLY_ACTIONS },
      ReportZatcaStatus: { labelKey: 'subReportZatcaStatus', actions: READ_ONLY_ACTIONS },
      ReportCreditDebitNotes: { labelKey: 'subReportCreditDebitNotes', actions: READ_ONLY_ACTIONS },
      ReportVoids: { labelKey: 'subReportVoids', actions: READ_ONLY_ACTIONS },
      ReportDiscounts: { labelKey: 'subReportDiscounts', actions: READ_ONLY_ACTIONS },
      ReportCategories: { labelKey: 'subReportCategories', actions: READ_ONLY_ACTIONS },
      ReportSalarySlips: { labelKey: 'subReportSalarySlips', actions: READ_ONLY_ACTIONS },
      ReportEmployeePayments: { labelKey: 'subReportEmployeePayments', actions: READ_ONLY_ACTIONS },
      ReportAdvances: { labelKey: 'subReportAdvances', actions: READ_ONLY_ACTIONS },
    },
  },
  settings: {
    moduleLabelKey: 'navSettings',
    subjects: {
      BusinessSettings: { labelKey: 'navSettings' },
    },
  },
}

/** All sales/ops report subjects (Manager + Accountant). */
export const ALL_REPORT_SUBJECTS = [
  'ReportSales',
  'ReportMenuItems',
  'ReportTax',
  'ReportDaily',
  'ReportDateRangeSummary',
  'ReportComparison',
  'ReportCashiers',
  'ReportPayments',
  'ReportZatcaStatus',
  'ReportCreditDebitNotes',
  'ReportVoids',
  'ReportDiscounts',
  'ReportCategories',
  'ReportSalarySlips',
  'ReportEmployeePayments',
  'ReportAdvances',
]

/** HR-only report subjects. */
export const HR_REPORT_SUBJECTS = [
  'ReportSalarySlips',
  'ReportEmployeePayments',
  'ReportAdvances',
]

/** @type {Set<string>} */
const ALL_SUBJECTS = new Set()

/** @type {Map<string, Set<string>>} */
const SUBJECT_ACTIONS = new Map()

/** @type {Map<string, string>} */
const SUBJECT_TO_MODULE = new Map()

for (const [moduleKey, module] of Object.entries(PERMISSION_REGISTRY)) {
  for (const [subject, config] of Object.entries(module.subjects)) {
    ALL_SUBJECTS.add(subject)
    const actions = config.actions ?? DEFAULT_CRUD_ACTIONS
    SUBJECT_ACTIONS.set(subject, new Set(actions))
    SUBJECT_TO_MODULE.set(subject, moduleKey)
  }
}

/** @param {string} subject */
export function subjectToModule(subject) {
  return SUBJECT_TO_MODULE.get(subject) ?? null
}

/** @param {string} subject */
export function isValidSubject(subject) {
  return ALL_SUBJECTS.has(subject)
}

/**
 * @param {string} subject
 * @param {string} action
 */
export function isValidPermission(subject, action) {
  const actions = SUBJECT_ACTIONS.get(subject)
  return Boolean(actions?.has(action))
}

/**
 * @returns {Array<{ moduleKey: string, moduleLabelKey: string, subjects: Array<{ subject: string, labelKey?: string, actions: readonly string[] }> }>}
 */
export function getPermissionMatrixGroups() {
  return Object.entries(PERMISSION_REGISTRY).map(([moduleKey, module]) => ({
    moduleKey,
    moduleLabelKey: module.moduleLabelKey,
    subjects: Object.entries(module.subjects).map(([subject, config]) => ({
      subject,
      labelKey: config.labelKey,
      actions: config.actions ?? DEFAULT_CRUD_ACTIONS,
    })),
  }))
}

export const ADMIN_ROLE_NAME = 'Admin'
/** @deprecated Use ADMIN_ROLE_NAME — Owner is no longer a role. */
export const OWNER_ROLE_NAME = ADMIN_ROLE_NAME
export const MANAGER_ROLE_NAME = 'Manager'
export const ACCOUNTANT_ROLE_NAME = 'Accountant'
export const HR_ROLE_NAME = 'HR'
export const CASHIER_ROLE_NAME = 'Cashier'
export const STAFF_ROLE_NAME = 'Staff'
/** @deprecated Use STAFF_ROLE_NAME */
export const KITCHEN_STAFF_ROLE_NAME = STAFF_ROLE_NAME
export const KITCHEN_BOARD_MANAGER_ROLE_NAME = 'Kitchen board manager'
/** @deprecated Removed — customer queue is a public restaurant URL. */
export const QUEUE_DISPLAY_ROLE_NAME = 'Queue display'
export const LEGACY_KITCHEN_STAFF_ROLE_NAME = 'Kitchen/Staff'

/**
 * Roles whose effective permission union is empty — no login account is created.
 */
export const NO_LOGIN_ROLE_NAMES = new Set([
  STAFF_ROLE_NAME,
  LEGACY_KITCHEN_STAFF_ROLE_NAME,
])

/**
 * @param {Array<{ action: string, subject: string }>} permissions
 */
export function validateRolePermissions(permissions) {
  for (const { action, subject } of permissions) {
    if (!isValidSubject(subject)) {
      return { ok: false, reason: `Invalid subject: ${subject}` }
    }
    if (!isValidPermission(subject, action)) {
      return { ok: false, reason: `Invalid action ${action} for subject ${subject}` }
    }
  }
  return { ok: true }
}

/**
 * All CRUD permissions for a list of subjects.
 * @param {string[]} subjects
 * @returns {Array<{ action: string, subject: string }>}
 */
export function crudFor(subjects) {
  /** @type {Array<{ action: string, subject: string }>} */
  const out = []
  for (const subject of subjects) {
    const actions = SUBJECT_ACTIONS.get(subject) ?? new Set(DEFAULT_CRUD_ACTIONS)
    for (const action of actions) {
      out.push({ action, subject })
    }
  }
  return out
}

/**
 * Read-only permissions for a list of subjects.
 * @param {string[]} subjects
 */
export function readFor(subjects) {
  return subjects.map((subject) => ({ action: 'read', subject }))
}
