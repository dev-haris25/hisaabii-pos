export const CUSTOMER_QUEUE_LOCALES = /** @type {const} */ (['ar', 'en'])

/**
 * @param {unknown} value
 * @returns {'ar' | 'en'}
 */
export function normalizeCustomerQueueLocale(value) {
  return value === 'en' ? 'en' : 'ar'
}

/**
 * Path including locale prefix (for the full public link).
 * @param {unknown} locale
 * @param {string} slug
 */
export function customerQueuePath(locale, slug) {
  const lang = normalizeCustomerQueueLocale(locale)
  return `/${lang}/queue/${encodeURIComponent(slug)}`
}

/**
 * @param {string} origin
 * @param {unknown} locale
 * @param {string} slug
 */
export function customerQueueAbsoluteUrl(origin, locale, slug) {
  const base = String(origin ?? '').replace(/\/$/, '')
  return `${base}${customerQueuePath(locale, slug)}`
}

/**
 * @param {Pick<Request, 'url'>} request
 */
export function customerQueueOriginFromRequest(request) {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (env) return env.replace(/\/$/, '')
  return new URL(request.url).origin
}
