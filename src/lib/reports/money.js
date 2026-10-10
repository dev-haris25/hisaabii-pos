import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

// Reports share the invoice money helpers (rules §23) — re-exported for callers.
export { parseMoney }

/** @param {number} n */
export function toMoneyStr(n) {
  return decimalStringFromNumber(n)
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
