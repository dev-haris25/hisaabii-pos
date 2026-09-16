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
 * @param {unknown} raw
 * @returns {{ id: string, kind: 'serial' | 'winprinter', label: string }[]}
 */
export function parseUsbPrinters(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      const id = String(row?.id ?? '').trim()
      const kind = row?.kind === 'winprinter' ? 'winprinter' : 'serial'
      const label = String(row?.label ?? id).trim() || id
      return { id, kind, label }
    })
    .filter((row) => row.id)
}

/**
 * @param {string | null | undefined} value
 */
export function normalizePrintVia(value) {
  return value === 'usb' ? 'usb' : 'lan'
}
