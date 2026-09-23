/** @typedef {'piece' | 'g' | 'kg' | 'ml' | 'l'} StockUnit */
/** @typedef {'piece' | 'mass' | 'volume'} StockUnitFamily */

/** @type {readonly StockUnit[]} */
const STOCK_UNITS = Object.freeze(['piece', 'g', 'kg', 'ml', 'l'])

/**
 * @param {string} unit
 * @returns {unit is StockUnit}
 */
function isStockUnit(unit) {
  return STOCK_UNITS.includes(/** @type {StockUnit} */ (unit))
}

/**
 * @param {StockUnit} unit
 * @returns {StockUnitFamily}
 */
function unitFamily(unit) {
  if (unit === 'piece') return 'piece'
  if (unit === 'g' || unit === 'kg') return 'mass'
  return 'volume'
}

/**
 * @param {StockUnit} from
 * @param {StockUnit} to
 */
function canConvertUnits(from, to) {
  return unitFamily(from) === unitFamily(to)
}

/**
 * @param {string | number} qty
 * @returns {number | null}
 */
function parseQty(qty) {
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
 * @param {number} n
 * @returns {string}
 */
function formatQtyString(n) {
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
 * @param {string | number} qty
 * @returns {string}
 */
function normalizeQtyString(qty) {
  const n = parseQty(qty)
  if (n == null) return '0'
  return formatQtyString(n)
}

/**
 * @param {string | number} qty
 * @param {StockUnit} from
 * @param {StockUnit} to
 * @returns {string}
 */
function convertStockQty(qty, from, to) {
  if (from === to) return normalizeQtyString(qty)
  if (!canConvertUnits(from, to)) {
    throw new Error(`Cannot convert ${from} to ${to}`)
  }

  const n = parseQty(qty)
  if (n == null) throw new Error('Invalid quantity')

  let inBase = n
  if (from === 'kg' || from === 'l') inBase = n * 1000

  let out = inBase
  if (to === 'kg' || to === 'l') out = inBase / 1000

  return formatQtyString(out)
}

module.exports = {
  STOCK_UNITS,
  isStockUnit,
  unitFamily,
  canConvertUnits,
  parseQty,
  formatQtyString,
  normalizeQtyString,
  convertStockQty,
}
