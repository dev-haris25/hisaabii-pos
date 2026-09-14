/**
 * Resolve display title for an in-app notification.
 * Prefers UI-locale catalog key `InAppNotifications.{type}.title`.
 *
 * @param {(key: string, values?: Record<string, unknown>) => string} t
 * @param {{ type?: string, title?: string | null }} n
 * @param {{ has?: (key: string) => boolean }} [opts]
 */
export function resolveNotificationDisplayTitle(t, n, opts = {}) {
  const type = String(n?.type ?? '').trim()
  const stored = (n?.title && String(n.title).trim()) || ''
  if (!type) return stored || ''

  const key = `${type}.title`
  if (typeof opts.has === 'function') {
    if (!opts.has(key)) return stored || type
    return t(key)
  }

  try {
    const translated = t(key, { defaultValue: '' })
    if (translated && translated !== key) return translated
  } catch {
    // ignore
  }
  return stored || type
}
