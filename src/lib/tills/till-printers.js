export const MAX_TILL_LAN_PRINTERS = 8

/**
 * @param {unknown} raw
 * @returns {{ ip: string, port: number }[]}
 */
export function parseLanPrinters(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => ({
      ip: String(row?.ip ?? '').trim(),
      port: Number(row?.port) || 9100,
    }))
    .filter((row) => row.ip)
}

/**
 * @param {string | null | undefined} id
 * @param {string | null | undefined} label
 * @returns {'a4' | 'thermal80'}
 */
export function guessWinPrinterPaper(id, label) {
  const hay = `${id ?? ''} ${label ?? ''}`.toLowerCase()
  if (
    /thermal|receipt|pos\b|xp-?\s*80|xp-?\s*58|tm-\d|epson\s*tm|star\s|bixolon|xprinter|rongta|80mm|58mm/.test(
      hay,
    )
  ) {
    return 'thermal80'
  }
  return 'a4'
}

/**
 * @param {unknown} value
 * @param {string} [id]
 * @param {string} [label]
 * @returns {'a4' | 'thermal80'}
 */
export function normalizeWinPrinterPaper(value, id = '', label = '') {
  if (value === 'a4' || value === 'thermal80') return value
  return guessWinPrinterPaper(id, label)
}

/**
 * @param {unknown} raw
 * @returns {{ id: string, kind: 'serial' | 'winprinter', label: string, paper: 'a4' | 'thermal80' }[]}
 */
export function parseUsbPrinters(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      const id = String(row?.id ?? '').trim()
      const kind = row?.kind === 'winprinter' ? 'winprinter' : 'serial'
      const label = String(row?.label ?? id).trim() || id
      const paper =
        kind === 'winprinter'
          ? normalizeWinPrinterPaper(row?.paper, id, label)
          : 'thermal80'
      return { id, kind, label, paper }
    })
    .filter((row) => row.id)
}

/**
 * @param {string | null | undefined} value
 */
export function normalizePrintVia(value) {
  return value === 'usb' ? 'usb' : 'lan'
}
