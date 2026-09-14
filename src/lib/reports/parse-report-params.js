/** @param {string} iso */
export function parseIsoDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Inclusive start of day for date-only strings. */
export function startOfDay(iso) {
  const d = parseIsoDate(iso)
  if (!d) return null
  d.setHours(0, 0, 0, 0)
  return d
}

/** Inclusive end of day for date-only strings. */
export function endOfDay(iso) {
  const d = parseIsoDate(iso)
  if (!d) return null
  d.setHours(23, 59, 59, 999)
  return d
}

/** @returns {string} YYYY-MM-DD */
export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** @returns {{ from: string, to: string }} */
export function thisMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

/** @returns {{ from: string, to: string }} */
export function lastYearSameMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1)
  const to = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

/**
 * @param {URLSearchParams} searchParams
 * @param {{ required?: boolean }} [opts]
 */
export function parseDateRangeParams(searchParams, opts = {}) {
  const fromDate = (searchParams.get('fromDate') ?? searchParams.get('dateFrom') ?? '').trim()
  const toDate = (searchParams.get('toDate') ?? searchParams.get('dateTo') ?? '').trim()

  if (opts.required && (!fromDate || !toDate)) {
    return { error: 'Date range is required' }
  }

  const from = fromDate ? startOfDay(fromDate) : null
  const to = toDate ? endOfDay(toDate) : null

  if (fromDate && !from) return { error: 'Invalid fromDate' }
  if (toDate && !to) return { error: 'Invalid toDate' }
  if (from && to && from.getTime() > to.getTime()) {
    return { error: 'fromDate must be before toDate' }
  }

  return { fromDate, toDate, from, to }
}

/**
 * @param {URLSearchParams} searchParams
 */
export function parseSingleDateParam(searchParams) {
  const date = (searchParams.get('date') ?? '').trim() || todayIso()
  const from = startOfDay(date)
  const to = endOfDay(date)
  if (!from || !to) return { error: 'Invalid date' }
  return { date, from, to }
}

/**
 * @param {URLSearchParams} searchParams
 */
export function parseComparisonParams(searchParams) {
  const fromDateA = (searchParams.get('fromDateA') ?? '').trim()
  const toDateA = (searchParams.get('toDateA') ?? '').trim()
  const fromDateB = (searchParams.get('fromDateB') ?? '').trim()
  const toDateB = (searchParams.get('toDateB') ?? '').trim()
  if (!fromDateA || !toDateA || !fromDateB || !toDateB) {
    return { error: 'Both period ranges are required' }
  }
  const fromA = startOfDay(fromDateA)
  const toA = endOfDay(toDateA)
  const fromB = startOfDay(fromDateB)
  const toB = endOfDay(toDateB)
  if (!fromA || !toA || !fromB || !toB) return { error: 'Invalid comparison dates' }
  if (fromA.getTime() > toA.getTime() || fromB.getTime() > toB.getTime()) {
    return { error: 'fromDate must be before toDate' }
  }
  return {
    periodA: { from: fromA, to: toA, fromDate: fromDateA, toDate: toDateA },
    periodB: { from: fromB, to: toB, fromDate: fromDateB, toDate: toDateB },
  }
}
