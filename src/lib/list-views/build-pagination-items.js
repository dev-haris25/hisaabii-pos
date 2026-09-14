/**
 * Compact page-number window for list footers (Hisabi products/invoices pattern).
 *
 * @param {number} current
 * @param {number} totalPages
 * @returns {(number | 'ellipsis')[]}
 */
export function buildPaginationItems(current, totalPages) {
  if (totalPages < 1) return [1]
  if (totalPages === 1) return [1]
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  if (current <= 3) {
    return [1, 2, 3, 'ellipsis', totalPages]
  }
  if (current >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages]
  }
  return [
    1,
    'ellipsis',
    current - 1,
    current,
    current + 1,
    'ellipsis',
    totalPages,
  ]
}
