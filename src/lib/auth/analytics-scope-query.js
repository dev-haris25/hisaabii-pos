export const ANALYTICS_SCOPE_ALL = 'all'

/**
 * @param {string} path
 * @param {string | null | undefined} scope
 */
export function withAnalyticsScopeQuery(path, scope) {
  if (!scope || scope === 'active') return path
  const join = path.includes('?') ? '&' : '?'
  return `${path}${join}scope=${encodeURIComponent(scope)}`
}
