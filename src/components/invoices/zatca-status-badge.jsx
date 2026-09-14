'use client'

import { cn } from '@/lib/utils'

/**
 * Status pill matching cashiers/menu + Hisabi invoice badge colors.
 * When `invoiceStatus` is voided, shows canceled instead of ZATCA reporting state.
 *
 * @param {{
 *   status: string | null | undefined
 *   invoiceStatus?: string | null
 *   labels: {
 *     pending: string
 *     reported: string
 *     failed: string
 *     cleared: string
 *     unknown: string
 *     voided?: string
 *   }
 *   className?: string
 * }} props
 */
export function ZatcaStatusBadge({ status, invoiceStatus, labels, className }) {
  if (invoiceStatus === 'voided' && labels.voided) {
    return (
      <span
        className={cn(
          'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
          'bg-hisabi-surface-container text-hisabi-on-surface-variant',
          className,
        )}
      >
        {labels.voided}
      </span>
    )
  }

  const key = status || 'pending'
  const label =
    key === 'reported'
      ? labels.reported
      : key === 'failed'
        ? labels.failed
        : key === 'cleared'
          ? labels.cleared
          : key === 'pending'
            ? labels.pending
            : labels.unknown

  const tone =
    key === 'reported' || key === 'cleared'
      ? 'bg-teal-100 text-teal-700'
      : key === 'failed'
        ? 'bg-red-100 text-red-700'
        : 'bg-slate-100 text-slate-600'

  return (
    <span
      className={cn(
        'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
        tone,
        className,
      )}
    >
      {label}
    </span>
  )
}
