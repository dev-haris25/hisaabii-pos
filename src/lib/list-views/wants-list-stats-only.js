/**
 * @param {URLSearchParams} searchParams
 * @returns {boolean}
 */
export function wantsListStatsOnly(searchParams) {
  const v = searchParams.get('statsOnly')
  return v === '1' || v === 'true'
}
