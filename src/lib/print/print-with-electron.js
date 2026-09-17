'use client'

import { AuthApiError, authGet, authPost } from '@/lib/api/auth-client'
import { getHisabiDesktop } from '@/lib/desktop/hisabi-desktop'
import { renderThermalReceiptPrintJobs } from '@/lib/print/render-thermal-receipt-print-html'
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
 * @param {Record<string, unknown> | null | undefined} invoice
 */
function requireQr(invoice) {
  const qr = String(invoice?.qrCode ?? '').trim()
  if (!qr) {
    throw new AuthApiError(409, 'QR_REQUIRED', 'Wait for ZATCA QR')
  }
}

/**
 * @param {unknown} err
 * @param {string} [code]
 */
function throwPrintError(err, code = 'PRINT_FAILED') {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'Print failed'
  throw new AuthApiError(502, code, message || 'Print failed')
}

/**
 * @param {{
 *   copies?: unknown[]
 *   invoice?: Record<string, unknown> | null
 *   logoUrl?: string | null
 *   documentLabel?: string | null
 *   printBody?: { invoiceId?: string, noteId?: string, noteType?: string }
 * }} data
 */
export async function printWithElectron(data) {
  const desktop = getHisabiDesktop()
  if (!desktop) {
    throw new AuthApiError(503, 'PRINT_FAILED', 'Desktop print is not available')
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
    const winprinters = devices.filter((d) => d.kind === 'winprinter')
    /** Motherboard COM1/COM2 are for drawer/display — not a USB receipt printer. */
    const serials = devices.filter(
      (d) => d.kind === 'serial' && !/^COM[12]$/i.test(d.id),
    )
    if (devices.length === 0) {
      throw new AuthApiError(
        400,
        'USB_PRINTER_NOT_CONFIGURED',
        'Choose a USB printer in Till settings',
      )
    }
    if (winprinters.length === 0 && serials.length === 0) {
      throw new AuthApiError(
        400,
        'USB_PRINTER_NOT_CONFIGURED',
        'COM1/COM2 is not the USB receipt printer. In Till settings, tick the Windows printer name (for example XP-80C), not COM1.',
      )
    }

    if (winprinters.length) {
      if (!desktop.printWin) {
        throw new AuthApiError(503, 'PRINT_FAILED', 'Desktop print is not available')
      }
      const invoice = data.invoice
      if (!invoice) {
        throw new AuthApiError(400, 'VALIDATION_ERROR', 'Missing document')
      }
      requireQr(invoice)
      let jobs
      try {
        jobs = await renderThermalReceiptPrintJobs({
          invoice,
          logoUrl: data.logoUrl ?? null,
          documentLabel: data.documentLabel ?? invoice.documentLabel ?? null,
        })
      } catch (err) {
        throwPrintError(err)
      }
      for (const device of winprinters) {
        for (const job of jobs) {
          try {
            await desktop.printWin({
              printerName: device.id,
              html: job.html,
              heightMicrons: job.heightMicrons,
            })
          } catch (err) {
            throwPrintError(err)
          }
        }
      }
    } else {
      if (!desktop.printUsb) {
        throw new AuthApiError(503, 'PRINT_FAILED', 'Desktop print is not available')
      }
      const copies = await loadEscposCopies(data)
      for (const device of serials) {
        for (const copy of copies) {
          const rawBase64 = String(copy?.rawBase64 ?? '')
          if (!rawBase64) throw new AuthApiError(502, 'PRINT_FAILED', 'No receipt bytes')
          try {
            await desktop.printUsb({
              kind: 'serial',
              id: device.id,
              base64: rawBase64,
            })
          } catch (err) {
            const raw = err instanceof Error ? err.message : String(err ?? '')
            if (/file not found|cannot find|ENOENT/i.test(raw)) {
              throw new AuthApiError(
                502,
                'PRINT_FAILED',
                `${device.id} is not available. For a normal USB printer, tick the Windows printer name in Till settings, not a COM port.`,
              )
            }
            throwPrintError(err)
          }
        }
      }
    }

    return {
      printed: true,
      printedCount: winprinters.length || serials.length,
      failedCount: 0,
      dryRun: false,
    }
  }

  if (!desktop.printRaw) {
    throw new AuthApiError(503, 'PRINT_FAILED', 'Desktop print is not available')
  }

  const printers = parseLanPrinters(till.lanPrinters)
  if (printers.length === 0) {
    throw new AuthApiError(400, 'PRINTER_NOT_CONFIGURED', 'Set the printer IP')
  }

  const copies = await loadEscposCopies(data)

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

/**
 * @param {{ copies?: unknown[], printBody?: { invoiceId?: string, noteId?: string, noteType?: string } }} data
 */
async function loadEscposCopies(data) {
  if (Array.isArray(data.copies) && data.copies.length > 0) {
    return data.copies
  }
  const prepared = await authPost('/pos/print', data.printBody ?? {})
  const copies = Array.isArray(prepared?.copies) ? prepared.copies : []
  if (copies.length === 0) {
    throw new AuthApiError(502, 'PRINT_FAILED', 'No receipt bytes')
  }
  return copies
}
