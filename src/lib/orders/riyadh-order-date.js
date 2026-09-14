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

/** @param {number | null | undefined} n */
export function formatOrderNumber(n) {
  const value = Number(n)
  if (!Number.isFinite(value) || value < 1) return null
  return `ORD-${String(Math.trunc(value)).padStart(4, '0')}`
}
