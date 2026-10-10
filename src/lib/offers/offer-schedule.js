/**
 * Offer schedule helpers — pure (client + server). All offer schedules are
 * evaluated in Asia/Riyadh time, like the rest of the restaurant day logic.
 */

const RIYADH_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Riyadh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hour12: false,
})

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/**
 * @param {Date} [now]
 * @returns {{ day: string, minute: number, weekday: number }}
 */
export function riyadhClock(now = new Date()) {
  /** @type {Record<string, string>} */
  const p = {}
  for (const part of RIYADH_FMT.formatToParts(now)) {
    if (part.type !== 'literal') p[part.type] = part.value
  }
  const hour = Number(p.hour) % 24
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    minute: hour * 60 + Number(p.minute),
    weekday: WEEKDAY_INDEX[/** @type {keyof typeof WEEKDAY_INDEX} */ (p.weekday)] ?? 0,
  }
}

/**
 * Riyadh day that "owns" a moment for a daily window that may cross midnight.
 * A 23:00–03:00 window at 01:00 belongs to the previous day's window, so the
 * weekday filter is checked against the day the window opened.
 *
 * @param {{ weekday: number, minute: number }} clock
 * @param {number | null | undefined} startMinute
 * @param {number | null | undefined} endMinute
 */
function windowOpeningWeekday(clock, startMinute, endMinute) {
  if (
    typeof startMinute === 'number' &&
    typeof endMinute === 'number' &&
    startMinute > endMinute &&
    clock.minute < endMinute
  ) {
    return (clock.weekday + 6) % 7
  }
  return clock.weekday
}

/**
 * @param {number} minute
 * @param {number | null | undefined} start
 * @param {number | null | undefined} end
 */
export function isMinuteInDailyWindow(minute, start, end) {
  if (typeof start !== 'number' || typeof end !== 'number') return true
  if (start === end) return true
  if (start < end) return minute >= start && minute < end
  return minute >= start || minute < end
}

/**
 * Whether the offer's schedule (dates, daily window, weekdays) covers `now`.
 * Does not look at `active`, `deletedAt` or usage limits.
 *
 * @param {{
 *   startsAt?: Date | string | null
 *   endsAt?: Date | string | null
 *   dailyStartMinute?: number | null
 *   dailyEndMinute?: number | null
 *   weekdays?: number[] | null
 * }} offer
 * @param {Date} [now]
 */
export function isOfferScheduledAt(offer, now = new Date()) {
  const t = now.getTime()
  if (offer.startsAt && new Date(offer.startsAt).getTime() > t) return false
  if (offer.endsAt && new Date(offer.endsAt).getTime() <= t) return false

  const clock = riyadhClock(now)
  if (!isMinuteInDailyWindow(clock.minute, offer.dailyStartMinute, offer.dailyEndMinute)) {
    return false
  }
  const days = Array.isArray(offer.weekdays) ? offer.weekdays : []
  if (days.length > 0) {
    const weekday = windowOpeningWeekday(
      clock,
      offer.dailyStartMinute,
      offer.dailyEndMinute,
    )
    if (!days.includes(weekday)) return false
  }
  return true
}

/**
 * "HH:MM" ⇄ minutes helpers for forms.
 * @param {number | null | undefined} minute
 */
export function minuteToTimeString(minute) {
  if (typeof minute !== 'number' || !Number.isFinite(minute)) return ''
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** @param {string | null | undefined} value */
export function timeStringToMinute(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}
