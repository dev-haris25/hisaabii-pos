/** Rolling window for cashier invoice / note mutations (restaurant-wide). */
export const CASHIER_DOCUMENT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * @returns {Date} Earliest instant a cashier may mutate documents.
 */
export function cashierDocumentWindowStart(now = new Date()) {
  return new Date(now.getTime() - CASHIER_DOCUMENT_WINDOW_MS)
}

/**
 * @param {Date | string | null | undefined} date
 * @param {Date} [now]
 */
export function isWithinCashierDocumentWindow(date, now = new Date()) {
  if (date == null) return false
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() >= cashierDocumentWindowStart(now).getTime()
}

/**
 * Server-computed action flags for an invoice/note document.
 * Frontend must use these — never re-derive from client clock.
 *
 * @param {{
 *   ability: import('@casl/ability').MongoAbility
 *   subject: 'Invoice' | 'CreditNote' | 'DebitNote'
 *   documentDate: Date | string | null | undefined
 *   hasFullAccess?: boolean
 * }} args
 */
export function documentActionFlags({ ability, subject, documentDate, hasFullAccess = false }) {
  if (hasFullAccess || ability.can('manage', 'all')) {
    return { canEdit: true, canVoid: true, canDelete: true }
  }

  const subjectObj =
    subject === 'Invoice'
      ? { invoiceDate: documentDate instanceof Date ? documentDate : new Date(documentDate ?? 0) }
      : { noteDate: documentDate instanceof Date ? documentDate : new Date(documentDate ?? 0) }

  // Prefer CASL subject-instance check when conditions exist; also fall back to window helper.
  const inWindow = isWithinCashierDocumentWindow(documentDate)
  const canUpdateByAbility = ability.can('update', subject) || ability.can('update', /** @type {any} */ (Object.assign({ constructor: { name: subject } }, subjectObj)))
  const canDeleteByAbility = ability.can('delete', subject) || ability.can('delete', /** @type {any} */ (Object.assign({ constructor: { name: subject } }, subjectObj)))

  // For cashiers with conditional rules, require both ability + window.
  const hasUnconditionalUpdate = ability.rules.some(
    (r) =>
      !r.inverted &&
      (r.action === 'update' || r.action === 'manage') &&
      (r.subject === subject || r.subject === 'all') &&
      !r.conditions,
  )
  const hasUnconditionalDelete = ability.rules.some(
    (r) =>
      !r.inverted &&
      (r.action === 'delete' || r.action === 'manage') &&
      (r.subject === subject || r.subject === 'all') &&
      !r.conditions,
  )

  return {
    canEdit: hasUnconditionalUpdate ? canUpdateByAbility : inWindow && ability.can('update', subject),
    canVoid: hasUnconditionalUpdate ? canUpdateByAbility : inWindow && ability.can('update', subject),
    canDelete: hasUnconditionalDelete ? canDeleteByAbility : inWindow && ability.can('delete', subject),
  }
}
