/** @param {string | number | null | undefined} v */
export function parseMoney(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/** @param {number} n */
export function toMoneyStr(n) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

/**
 * @param {number} a
 * @param {number} b
 */
export function percentChange(a, b) {
  if (a === 0 && b === 0) return { percentChange: '0.00', direction: 'flat' }
  if (a === 0) return { percentChange: '100.00', direction: b > 0 ? 'up' : 'down' }
  const pct = ((b - a) / Math.abs(a)) * 100
  const direction = pct > 0.005 ? 'up' : pct < -0.005 ? 'down' : 'flat'
  return { percentChange: toMoneyStr(pct), direction }
}
