/** Saudi CR / VAT digit caps used across business profile and create-organization flows. */
export const CR_NUMBER_MAX_DIGITS = 10
export const VAT_NUMBER_MAX_DIGITS = 15

/**
 * @param {string} raw
 * @param {number} maxLen
 */
export function digitsOnlyLimited(raw, maxLen) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.slice(0, maxLen)
}

/**
 * Compare two tax IDs by digits only (ignores spaces/formatting).
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function taxIdDigitsEqual(a, b) {
  const da = String(a ?? '').replace(/\D/g, '')
  const db = String(b ?? '').replace(/\D/g, '')
  return da === db
}
