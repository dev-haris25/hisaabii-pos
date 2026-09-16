'use client'

import { AuthApiError, authGet } from '@/lib/api/auth-client'
import { getHisabiDesktop } from '@/lib/desktop/hisabi-desktop'
import {
  normalizePrintVia,
  parseLanPrinters,
  parseUsbPrinters,
} from '@/lib/tills/till-printers'

async function loadBoundTill() {
  const desktop = getHisabiDesktop()
  const tillId = await desktop?.getTillId?.()
  if (!tillId) return null
  const data = await authGet(`/pos/till?id=${encodeURIComponent(tillId)}`)
  return data.till && typeof data.till === 'object' ? data.till : null
}

/**
 * @param {Record<string, unknown>} data
 */
export async function printWithElectron(data) {
  const desktop = getHisabiDesktop()
  if (!desktop?.printRaw) {
    throw new AuthApiError(503, 'PRINT_FAILED', 'Desktop print is not available')
  }
  const copies = Array.isArray(data.copies) ? data.copies : []
  if (copies.length === 0) {
    throw new AuthApiError(502, 'PRINT_FAILED', 'No receipt bytes')
  }

  const till = await loadBoundTill()
  if (!till) {
    throw new AuthApiError(
      400,
      'PRINTER_NOT_CONFIGURED',
      'Bind this PC to a till in Settings',
    )
  }

  const printVia = normalizePrintVia(
    typeof till.printVia === 'string' ? till.printVia : 'lan',
  )

  if (printVia === 'usb') {
    const devices = parseUsbPrinters(till.usbPrinters)
    if (devices.length === 0 || !desktop.printUsb) {
      throw new AuthApiError(
        400,
        'USB_PRINTER_NOT_CONFIGURED',
        'Choose a USB printer in Till settings',
      )
    }
    let lastBytes = null
    for (const device of devices) {
      for (const copy of copies) {
        const rawBase64 = String(copy?.rawBase64 ?? '')
        if (!rawBase64) throw new AuthApiError(502, 'PRINT_FAILED', 'No receipt bytes')
        await desktop.printUsb({
          kind: device.kind,
          id: device.id,
          base64: rawBase64,
        })
        lastBytes = Number(copy?.bytes) || rawBase64.length
      }
    }
    return {
      printed: true,
      printedCount: devices.length,
      failedCount: 0,
      dryRun: false,
      bytes: lastBytes,
    }
  }

  const printers = parseLanPrinters(till.lanPrinters)
  if (printers.length === 0) {
    throw new AuthApiError(400, 'PRINTER_NOT_CONFIGURED', 'Set the printer IP')
  }

  /** @type {{ ip: string, ok: boolean, code: string | null, bytes: number | null }[]} */
  const results = []
  for (const printer of printers) {
    const ip = printer.ip
    const port = printer.port || 9100
    try {
      let lastBytes = null
      for (const copy of copies) {
        const rawBase64 = String(copy?.rawBase64 ?? '')
        if (!rawBase64) throw new Error('empty copy')
        await desktop.printRaw({ host: ip, port, base64: rawBase64 })
        lastBytes = Number(copy?.bytes) || rawBase64.length
      }
      results.push({ ip, ok: true, code: null, bytes: lastBytes })
    } catch {
      results.push({ ip, ok: false, code: 'PRINT_FAILED', bytes: null })
    }
  }

  const successes = results.filter((r) => r.ok)
  const failures = results.filter((r) => !r.ok)
  if (successes.length === 0) {
    throw new AuthApiError(502, 'PRINT_FAILED', 'Could not print the receipt')
  }
  return {
    printed: true,
    printedCount: successes.length,
    failedCount: failures.length,
    printers: results,
    dryRun: false,
    bytes: successes[0]?.bytes ?? null,
  }
}
