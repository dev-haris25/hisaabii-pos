/**
 * Call the on-site print bridge. Failures become typed errors for the API layer.
 *
 * @param {{
 *   receipt: Record<string, unknown>
 *   printer: { ip: string | null | undefined, port: number | null | undefined }
 *   dryRun?: boolean
 * }} opts
 */
export async function sendReceiptToPrintBridge(opts) {
  const base = (
    process.env.PRINT_BRIDGE_URL?.trim() || 'http://127.0.0.1:3910'
  ).replace(/\/$/, '')
  const secret = process.env.PRINT_BRIDGE_SECRET?.trim() || ''

  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers.Authorization = `Bearer ${secret}`

  const dryRunEnv =
    process.env.PRINT_BRIDGE_DRY_RUN === 'true' ||
    process.env.PRINT_BRIDGE_DRY_RUN === '1'

  let res
  try {
    res = await fetch(`${base}/print`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        receipt: opts.receipt,
        printer: {
          ip: opts.printer.ip || null,
          port: opts.printer.port ?? 9100,
        },
        dryRun: opts.dryRun === true || dryRunEnv,
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw Object.assign(new Error(message), { code: 'PRINT_BRIDGE_UNREACHABLE' })
  }

  let data = {}
  try {
    data = await res.json()
  } catch {
    // ignore
  }

  if (!res.ok) {
    const code =
      typeof data.code === 'string' ? data.code : 'PRINT_FAILED'
    const message =
      typeof data.message === 'string' ? data.message : 'Print failed'
    throw Object.assign(new Error(message), { code })
  }

  return data
}
