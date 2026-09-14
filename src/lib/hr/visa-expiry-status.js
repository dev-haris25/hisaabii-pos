/**
 * Shared single source of truth for employee visa expiry status.
 * Uses a 30-day window (matching the daily visa reminder pass and the
 * original visa-status list styling) so thresholds never drift between
 * the API, the list rows, and the sidebar badge.
 *
 * @typedef {'ok' | 'expiring' | 'expired'} VisaExpiryStatus
 */

export const VISA_EXPIRY_WINDOW_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whole calendar days until the expiry date (negative once expired).
 * Both dates are normalized to midnight so partial days don't skew the count.
 *
 * @param {Date | string} expiry
 * @param {Date} [now]
 * @returns {number}
 */
export function computeVisaDaysLeft(expiry, now = new Date()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const exp = new Date(expiry)
  exp.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - today.getTime()) / DAY_MS)
}

/**
 * @param {number | null | undefined} daysLeft
 * @returns {VisaExpiryStatus}
 */
export function getVisaExpiryStatus(daysLeft) {
  if (daysLeft == null) return 'ok'
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= VISA_EXPIRY_WINDOW_DAYS) return 'expiring'
  return 'ok'
}
