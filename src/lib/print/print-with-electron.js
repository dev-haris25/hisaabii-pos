'use client'

import { AuthApiError } from '@/lib/api/auth-client'
import { getHisabiDesktop } from '@/lib/desktop/hisabi-desktop'

/**
 * @param {Record<string, unknown>} data
 */
export async function printWithElectron(data) {
  const desktop = getHisabiDesktop()
  if (!desktop?.printRaw) {
    throw new AuthApiError(503, 'PRINT_FAILED', 'Desktop print is not available')
  }
  const printers = Array.isArray(data.printers) ? data.printers : []
  const copies = Array.isArray(data.copies) ? data.copies : []
  if (printers.length === 0) {
    throw new AuthApiError(400, 'PRINTER_NOT_CONFIGURED', 'Set the printer IP')
  }
  if (copies.length === 0) {
    throw new AuthApiError(502, 'PRINT_FAILED', 'No receipt bytes')
  }

  /** @type {{ ip: string, ok: boolean, code: string | null, bytes: number | null }[]} */
  const results = []
  for (const printer of printers) {
    const ip = String(printer?.ip ?? '').trim()
    const port = Number(printer?.port ?? 9100)
    if (!ip) {
      results.push({ ip: '', ok: false, code: 'PRINTER_NOT_CONFIGURED', bytes: null })
      continue
    }
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
