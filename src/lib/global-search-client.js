import { authGet } from '@/lib/api/auth-client'

/**
 * @param {string} q
 * @returns {Promise<Record<string, Array<{ id: string, type: string, title: string, subtitle: string | null, href: string }>>>}
 */
export async function globalSearchRequest(q) {
  const query = new URLSearchParams()
  query.set('q', String(q ?? '').trim().slice(0, 120))
  const data = await authGet(`/search?${query.toString()}`)
  if (!data || typeof data !== 'object') return {}
  const { ok: _ok, ...results } = data
  return results
}
