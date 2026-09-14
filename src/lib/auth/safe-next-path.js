/**
 * Internal post-login destinations that may be preserved via `?next=`.
 */
const ALLOWED_NEXT_PREFIXES = [
  '/business-profile',
  '/zatca-onboarding',
  '/pos',
  '/menu',
  '/hr',
  '/invoices',
  '/settings',
  '/restaurants',
  '/invite/accept',
]

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function parseSafeNextPath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) {
    return null
  }
  if (raw.includes('\\') || raw.includes('://')) return null

  let parsed
  try {
    parsed = new URL(raw, 'https://hisabi-pos.local')
  } catch {
    return null
  }
  if (parsed.origin !== 'https://hisabi-pos.local') return null
  if (parsed.username || parsed.password) return null

  const pathAndSearch = `${parsed.pathname}${parsed.search}`
  const allowed = ALLOWED_NEXT_PREFIXES.some(
    (prefix) =>
      parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`),
  )
  if (!allowed) return null
  return pathAndSearch
}

/**
 * @param {string} href
 * @param {string | null | undefined} nextPath
 */
export function hrefWithNext(href, nextPath) {
  const safe = parseSafeNextPath(nextPath)
  if (!safe) return href
  const join = href.includes('?') ? '&' : '?'
  return `${href}${join}next=${encodeURIComponent(safe)}`
}
