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
 *   createdAt: Date
 *   updatedAt: Date
 * }} row
 */
export function mapTillToJson(row) {
  const lanPrinters = parseLanPrinters(row.lanPrinters)
  return {
    id: row.id,
    name: row.name,
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
