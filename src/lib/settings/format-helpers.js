/**
 * Map next-intl / app locale (`ar` | `en`) to an Intl locale that shapes digits.
 *
 * @param {string | null | undefined} locale
 * @returns {'ar-SA' | 'en-US'}
 */
export function intlLocaleForApp(locale) {
  const raw = String(locale ?? 'en').toLowerCase()
  return raw === 'ar' || raw.startsWith('ar') ? 'ar-SA' : 'en-US'
}

/**
 * Locale-aware number for counts and pagination.
 *
 * @param {number | string | null | undefined} value
 * @param {string | null | undefined} locale
 * @param {Intl.NumberFormatOptions} [options]
 */
export function formatLocalizedNumber(value, locale, options = {}) {
  const n =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? '').replace(/,/g, ''))
  if (!Number.isFinite(n)) {
    return new Intl.NumberFormat(intlLocaleForApp(locale), {
      maximumFractionDigits: 0,
      ...options,
    }).format(0)
  }
  return new Intl.NumberFormat(intlLocaleForApp(locale), options).format(n)
}

/**
 * @param {string | number} n
 * @param {string} prefix
 * @param {number} [padding]
 */
export function formatDocumentNumber(n, prefix, padding = 4) {
  const num = Number.parseInt(String(n), 10)
  const pad = Math.max(1, Math.min(10, Number(padding) || 4))
  if (!Number.isFinite(num) || num < 1) {
    return `${prefix}${String(1).padStart(pad, '0')}`
  }
  return `${prefix}${String(num).padStart(pad, '0')}`
}

const SAR_CURRENCY_SYMBOL = 'SAR'

/**
 * @param {string | number | null | undefined} amount
 * @param {string | null | undefined} [locale]
 * @param {{ minimumFractionDigits?: number, maximumFractionDigits?: number }} [options]
 */
export function formatSarAmount(amount, locale = 'en', options = {}) {
  const n = Number(String(amount ?? '').replace(/,/g, ''))
  const value = Number.isFinite(n) ? n : 0
  const formatted = new Intl.NumberFormat(intlLocaleForApp(locale), {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(value)
  return `${SAR_CURRENCY_SYMBOL} ${formatted}`
}

