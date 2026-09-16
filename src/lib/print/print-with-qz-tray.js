'use client'

import { AuthApiError } from '@/lib/api/auth-client'

/**
 * @param {Record<string, unknown>} data
 */
export async function printWithQzTray(data) {
  const printers = Array.isArray(data.printers) ? data.printers : []
  const copies = Array.isArray(data.copies) ? data.copies : []
  if (printers.length === 0) {
    throw new AuthApiError(400, 'PRINTER_NOT_CONFIGURED', 'Set the printer IP')
  }
  if (copies.length === 0) {
    throw new AuthApiError(502, 'PRINT_FAILED', 'No receipt bytes')
  }

  let qz
  try {
    const mod = await import('qz-tray')
    qz = mod.default ?? mod
  } catch {
    throw new AuthApiError(
      503,
      'QZ_TRAY_UNREACHABLE',
      'QZ Tray is not available in this browser',
    )
  }

  try {
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect()
    }
  } catch {
    throw new AuthApiError(
      503,
      'QZ_TRAY_UNREACHABLE',
      'QZ Tray is not running. Install and start QZ Tray, then try again.',
    )
  }

  /** @type {{ ip: string, ok: boolean, code: string | null, bytes: number | null }[]} */
  const results = []

  for (const printer of printers) {
    const ip = String(printer?.ip ?? '').trim()
    const port = Number(printer?.port ?? 9100)
    if (!ip) {
      results.push({
        ip: '',
        ok: false,
        code: 'PRINTER_NOT_CONFIGURED',
        bytes: null,
      })
      continue
    }

    try {
      const config = qz.configs.create({ host: ip, port })
      let lastBytes = null
      for (const copy of copies) {
        const rawBase64 = String(copy?.rawBase64 ?? '')
        if (!rawBase64) {
          throw new Error('empty copy')
        }
        await qz.print(config, [
          {
            type: 'raw',
            format: 'command',
            flavor: 'base64',
            data: rawBase64,
          },
        ])
        lastBytes = Number(copy?.bytes) || rawBase64.length
      }
      results.push({ ip, ok: true, code: null, bytes: lastBytes })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const unreachable =
        /websocket|not running|establish connection|Unable to establish/i.test(
          message,
        )
      results.push({
        ip,
        ok: false,
        code: unreachable ? 'QZ_TRAY_UNREACHABLE' : 'PRINT_FAILED',
        bytes: null,
      })
    }
  }

  const successes = results.filter((r) => r.ok)
  const failures = results.filter((r) => !r.ok)
  if (successes.length === 0) {
    const allQz = failures.every((r) => r.code === 'QZ_TRAY_UNREACHABLE')
    throw new AuthApiError(
      allQz ? 503 : 502,
      allQz ? 'QZ_TRAY_UNREACHABLE' : 'PRINT_FAILED',
      allQz
        ? 'QZ Tray is not running. Install and start QZ Tray, then try again.'
        : 'Could not print the receipt',
    )
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
