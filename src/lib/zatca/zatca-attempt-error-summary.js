import { humanizeZatcaError } from '@/lib/zatca/humanize-zatca-error'

/**
 * Human-readable ZATCA failure summary for storage / notifications (rules §5).
 * @param {unknown} err
 * @returns {string}
 */
export function zatcaAttemptErrorSummary(err) {
  const msg = err instanceof Error ? err.message : String(err)
  const humanized = humanizeZatcaError(msg)
  const first = humanized.issues?.[0]
  const summary = first?.message
    ? [first.title, first.message, first.actionHint].filter(Boolean).join(' — ')
    : msg
  return summary.slice(0, 1000)
}
