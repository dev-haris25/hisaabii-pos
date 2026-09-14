/**
 * Build an auth API path with optional list query params.
 * Skips empty, null, undefined, and 'all' values.
 *
 * @param {string} path e.g. '/clients'
 * @param {Record<string, string | number | boolean | null | undefined>} params
 * @returns {string}
 */
export function buildListQueryUrl(path, params) {
  const sp = new URLSearchParams()
  for (const [key, raw] of Object.entries(params)) {
    if (raw == null) continue
    const val = String(raw).trim()
    if (!val || val === 'all') continue
    sp.set(key, val)
  }
  const qs = sp.toString()
  return qs ? `${path}?${qs}` : path
}
