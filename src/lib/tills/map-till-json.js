import {
  normalizePrintVia,
  parseLanPrinters,
  parseUsbPrinters,
} from '@/lib/tills/till-printers'

/**
 * @param {{
 *   id: string
 *   name: string
 *   displayEnabled: boolean
 *   displayPort: string | null
 *   displayBaud: number
 *   displayProtocol: string
 *   drawerEnabled: boolean
 *   drawerPort: string | null
 *   drawerProtocol: string
 *   printVia?: string
 *   lanPrinters?: unknown
 *   usbPrinters?: unknown
 *   lastHeartbeatAt?: Date | null
 *   pendingUploadCount?: number
 *   createdAt: Date
 *   updatedAt: Date
 * }} row
 * @param {string | null | undefined} [primaryPosTillId]
 */
export function mapTillToJson(row, primaryPosTillId) {
  const lanPrinters = parseLanPrinters(row.lanPrinters)
  const isPrimary =
    typeof primaryPosTillId === 'string' &&
    primaryPosTillId.length > 0 &&
    row.id === primaryPosTillId
  return {
    id: row.id,
    name: row.name,
    isPrimary,
    displayEnabled: row.displayEnabled === true,
    displayPort: row.displayPort ?? '',
    displayBaud: row.displayBaud ?? 9600,
    displayProtocol: row.displayProtocol || 'vfd_ascii',
    drawerEnabled: row.drawerEnabled === true,
    drawerPort: row.drawerPort ?? '',
    drawerProtocol: row.drawerProtocol || 'escpos_pulse',
    printVia: normalizePrintVia(row.printVia),
    lanPrinters:
      lanPrinters.length > 0 ? lanPrinters : [{ ip: '', port: 9100 }],
    usbPrinters: parseUsbPrinters(row.usbPrinters),
    lastHeartbeatAt: row.lastHeartbeatAt
      ? row.lastHeartbeatAt.toISOString()
      : null,
    pendingUploadCount: Number(row.pendingUploadCount) || 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
