import { normalizeCustomerQueueLocale } from '@/lib/orders/customer-queue-url'

/**
 * Assumed public E-Waiter order URL shape for Step 6.
 * Path: `/{locale}/order/{businessSlug}/{qrToken}`
 * Finalize when the public menu route is built — QR PNG + admin copy use this helper.
 *
 * @param {unknown} locale
 * @param {string} slug
 * @param {string} qrToken
 */
export function eWaiterOrderPath(locale, slug, qrToken) {
  const lang = normalizeCustomerQueueLocale(locale)
  return `/${lang}/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}`
}

/**
 * @param {string} origin
 * @param {unknown} locale
 * @param {string} slug
 * @param {string} qrToken
 */
export function eWaiterOrderAbsoluteUrl(origin, locale, slug, qrToken) {
  const base = String(origin ?? '').replace(/\/$/, '')
  return `${base}${eWaiterOrderPath(locale, slug, qrToken)}`
}

/**
 * @param {Pick<Request, 'url'>} request
 */
export function eWaiterOrderOriginFromRequest(request) {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (env) return env.replace(/\/$/, '')
  return new URL(request.url).origin
}
