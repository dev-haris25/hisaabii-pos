/**
 * Encode / decode opaque sync pull cursor.
 * Full: { m: 'full', p: phaseIndex, o: offset }
 * Incremental: { m: 'inc', t: isoTimestamp }
 */

const PHASES = [
  'bootstrap',
  'auth',
  'menuCategories',
  'menuItems',
  'kitchenOrders',
  'stockItems',
  'stockMovements',
  'invoices',
  'done',
]

/**
 * @param {unknown} raw
 */
export function decodePullCursor(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { m: 'full', p: 0, o: 0 }
  }
  try {
    const json = Buffer.from(raw.trim(), 'base64url').toString('utf8')
    const parsed = JSON.parse(json)
    if (parsed?.m === 'inc' && typeof parsed.t === 'string') {
      return { m: 'inc', t: parsed.t }
    }
    const p = Number(parsed?.p) || 0
    const o = Number(parsed?.o) || 0
    return { m: 'full', p: Math.max(0, Math.min(p, PHASES.length - 1)), o: Math.max(0, o) }
  } catch {
    return { m: 'full', p: 0, o: 0 }
  }
}

/**
 * @param {{ m: string, p?: number, o?: number, t?: string }} cursor
 */
export function encodePullCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function pullPhaseName(index) {
  return PHASES[index] || 'done'
}

export function pullPhaseCount() {
  return PHASES.length
}

export { PHASES }
