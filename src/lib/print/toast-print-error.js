import { toast } from 'sonner'

/**
 * Always show the real print/desktop error (not a generic toast).
 *
 * @param {unknown} err
 */
export function formatPrintError(err) {
  if (err == null) return 'Print failed'
  const code = typeof err.code === 'string' ? err.code.trim() : ''
  const raw =
    err instanceof Error
      ? String(err.message ?? '').trim()
      : String(err).trim()
  const parts = []
  if (code && code !== raw) parts.push(code)
  if (raw) parts.push(raw)
  return parts.join(' — ') || 'Print failed'
}

/**
 * @param {unknown} err
 */
export function toastPrintError(err) {
  const text = formatPrintError(err)
  console.error('[hisabi print]', err)
  toast.error(text)
}
