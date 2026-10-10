import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/** Riyadh has no DST — restaurant time is always UTC+03:00. */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000

/**
 * ISO instant → `YYYY-MM-DDTHH:mm` in restaurant (Riyadh) time for
 * `<input type="datetime-local">`.
 * @param {unknown} iso
 */
export function isoToRiyadhInput(iso) {
  if (typeof iso !== 'string' || !iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 16)
}

/**
 * `YYYY-MM-DDTHH:mm` (Riyadh) → ISO instant, or null when blank/invalid.
 * @param {string} value
 */
export function riyadhInputToIso(value) {
  const v = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null
  const d = new Date(`${v}:00+03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** @param {string} locale */
function intlLocale(locale) {
  return locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB'
}

/**
 * Short date + time in restaurant time.
 * @param {string} iso
 * @param {string} locale
 */
export function formatRiyadhDateTime(iso, locale) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/**
 * Localized short weekday names, index 0 = Sunday … 6 = Saturday.
 * @param {string} locale
 * @param {'short' | 'long'} [width]
 */
export function weekdayNames(locale, width = 'short') {
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: width,
    timeZone: 'UTC',
  })
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(Date.UTC(2023, 0, 1 + i))),
  )
}

/**
 * "20.00" → "20", "12.50" → "12.5" for percentages.
 * @param {unknown} value
 */
export function formatPercent(value) {
  const n = parseMoney(/** @type {string} */ (value))
  return String(Math.round(n * 100) / 100)
}

/** @param {unknown} value */
export function formatMoney(value) {
  return decimalStringFromNumber(parseMoney(/** @type {string} */ (value)))
}

/**
 * Rebuilds a full save body from the admin JSON (PATCH is a full save).
 * Images are left out, so the server keeps them unchanged.
 *
 * @param {Record<string, any>} row admin JSON (`mapOfferAdminJson`)
 * @param {Record<string, unknown>} [overrides]
 */
export function offerBodyFromAdminJson(row, overrides = {}) {
  return {
    nameAr: row.nameAr,
    nameEn: row.nameEn ?? null,
    kind: row.kind,
    discountType: row.discountType ?? null,
    discountValue: row.discountValue ?? null,
    appliesToAllItems: row.appliesToAllItems === true,
    comboPrice: row.comboPrice ?? null,
    startsAt: row.startsAt ?? null,
    endsAt: row.endsAt ?? null,
    dailyStartTime: row.dailyStartTime || null,
    dailyEndTime: row.dailyEndTime || null,
    weekdays: Array.isArray(row.weekdays) ? row.weekdays : [],
    totalUsageLimit: row.totalUsageLimit ?? null,
    dailyUsageLimit: row.dailyUsageLimit ?? null,
    maxPerOrder: row.maxPerOrder ?? null,
    active: row.active === true,
    sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
    items: (Array.isArray(row.items) ? row.items : []).map((it) => ({
      role: it.role,
      menuItemId: it.menuItemId,
      quantity: it.quantity,
      discountPercent: it.role === 'GET' ? (it.discountPercent ?? '100') : null,
      variantOptionIds: Array.isArray(it.variantOptionIds)
        ? it.variantOptionIds
        : [],
    })),
    ...overrides,
  }
}
