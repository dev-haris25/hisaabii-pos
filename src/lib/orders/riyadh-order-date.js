/**
 * Calendar date for the daily kitchen order counter (Asia/Riyadh).
 * @param {Date} [now]
 * @returns {Date} UTC midnight of that calendar day (Prisma `@db.Date`)
 */
export function riyadhOrderDate(now = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return new Date(`${s}T00:00:00.000Z`)
}

/**
 * Absolute UTC bounds for an Asia/Riyadh calendar date (no DST in Saudi Arabia).
 * @param {string} isoDate YYYY-MM-DD
 * @returns {{ from: Date, to: Date } | null}
 */
export function riyadhDayBounds(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null
  const from = new Date(`${isoDate}T00:00:00+03:00`)
  const to = new Date(`${isoDate}T23:59:59.999+03:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  return { from, to }
}

/** @param {number | null | undefined} n */
export function formatOrderNumber(n) {
  const value = Number(n)
  if (!Number.isFinite(value) || value < 1) return null
  return `ORD-${String(Math.trunc(value)).padStart(4, '0')}`
}
