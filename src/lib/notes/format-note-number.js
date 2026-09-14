/**
 * Human-facing credit/debit note number, e.g. CN-0001 / DN-0001.
 * @param {number | string} n
 * @param {string} [prefix]
 * @param {number} [padding]
 */
export function formatNoteNumber(n, prefix = 'CN-', padding = 4) {
  const num = Number.parseInt(String(n), 10)
  const pad = Math.max(1, Math.min(10, Number(padding) || 4))
  if (!Number.isFinite(num) || num < 1) {
    return `${prefix}${String(1).padStart(pad, '0')}`
  }
  return `${prefix}${String(num).padStart(pad, '0')}`
}
