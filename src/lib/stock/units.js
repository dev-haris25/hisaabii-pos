/** @typedef {'piece' | 'g' | 'kg' | 'ml' | 'l'} StockUnit */
/** @typedef {'piece' | 'mass' | 'volume'} StockUnitFamily */

/** @type {readonly StockUnit[]} */
export const STOCK_UNITS = Object.freeze(['piece', 'g', 'kg', 'ml', 'l'])

/**
 * @param {string} unit
 * @returns {unit is StockUnit}
 */
export function isStockUnit(unit) {
  return STOCK_UNITS.includes(/** @type {StockUnit} */ (unit))
}

/**
 * @param {StockUnit} unit
 * @returns {StockUnitFamily}
 */
export function unitFamily(unit) {
  if (unit === 'piece') return 'piece'
  if (unit === 'g' || unit === 'kg') return 'mass'
  return 'volume'
}

/**
 * Units allowed for the same stock item / recipe line (same family only).
 * @param {StockUnit} unit
 * @returns {readonly StockUnit[]}
 */
export function compatibleUnits(unit) {
  const family = unitFamily(unit)
  if (family === 'piece') return /** @type {const} */ (['piece'])
  if (family === 'mass') return /** @type {const} */ (['g', 'kg'])
  return /** @type {const} */ (['ml', 'l'])
}

/**
 * @param {StockUnit} from
 * @param {StockUnit} to
 */
export function canConvertUnits(from, to) {
  return unitFamily(from) === unitFamily(to)
}

/**
 * Convert quantity between compatible units. Mass ↔ volume is not allowed.
 * @param {string | number} qty
 * @param {StockUnit} from
 * @param {StockUnit} to
 * @returns {string}
 */
export function convertStockQty(qty, from, to) {
  if (from === to) return normalizeQtyString(qty)
  if (!canConvertUnits(from, to)) {
    throw new Error(`Cannot convert ${from} to ${to}`)
  }

  const n = parseQty(qty)
  if (n == null) throw new Error('Invalid quantity')

  let inBase = n
  if (from === 'kg' || from === 'l') inBase = n * 1000
  // g and ml are already base for their family; piece has no scale

  let out = inBase
  if (to === 'kg' || to === 'l') out = inBase / 1000

  return formatQtyString(out)
}

/**
 * @param {string | number} qty
 * @returns {number | null}
 */
export function parseQty(qty) {
  if (typeof qty === 'number') {
    return Number.isFinite(qty) ? qty : null
  }
  const s = String(qty ?? '').trim()
  if (!s) return null
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {string | number} qty
 * @returns {string}
 */
export function normalizeQtyString(qty) {
  const n = parseQty(qty)
  if (n == null) return '0'
  return formatQtyString(n)
}

/**
 * @param {number} n
 * @returns {string}
 */
export function formatQtyString(n) {
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 1e6) / 1e6
  if (Object.is(rounded, -0)) return '0'
  let s = String(rounded)
  if (s.includes('e') || s.includes('E')) {
    s = rounded.toFixed(6).replace(/\.?0+$/, '')
  }
  return s
}

/**
 * Display label for unit (L for litre).
 * @param {StockUnit} unit
 */
export function stockUnitLabel(unit) {
  if (unit === 'l') return 'L'
  return unit
}

/**
 * True when on-hand is at or below threshold (both in same base unit).
 * @param {string} quantityOnHand
 * @param {string | null | undefined} lowStockThreshold
 */
export function isLowStock(quantityOnHand, lowStockThreshold) {
  if (lowStockThreshold == null || String(lowStockThreshold).trim() === '') {
    return false
  }
  const qty = parseQty(quantityOnHand)
  const thr = parseQty(lowStockThreshold)
  if (qty == null || thr == null) return false
  return qty <= thr
}
