import { toast } from 'sonner'

/**
 * @param {(key: string, values?: Record<string, unknown>) => string} t
 * @param {Record<string, unknown> | undefined} data
 */
export function toastPrintResult(t, data) {
  if (data?.dryRun) {
    toast.success(t('printDryRunSuccess'))
    return
  }
  const printed = Number(data?.printedCount)
  const failed = Number(data?.failedCount)
  if (
    Number.isFinite(printed) &&
    Number.isFinite(failed) &&
    printed > 0 &&
    failed > 0
  ) {
    toast.success(t('printPartialSuccess', { printed, failed }))
    return
  }
  toast.success(t('printSuccess'))
}
