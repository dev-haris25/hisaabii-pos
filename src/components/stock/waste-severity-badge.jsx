import { cn } from '@/lib/utils'

/**
 * @param {{
 *   severity: string | null | undefined
 *   labels: { low: string, bearable: string, high: string }
 *   className?: string
 * }} props
 */
export function WasteSeverityBadge({ severity, labels, className }) {
  if (severity !== 'low' && severity !== 'bearable' && severity !== 'high') {
    return null
  }
  return (
    <span
      className={cn(
        'type-label-sm inline-flex rounded-full px-2 py-0.5 font-semibold',
        severity === 'low' && 'bg-green-50 text-green-700',
        severity === 'bearable' && 'bg-amber-50 text-amber-800',
        severity === 'high' && 'bg-red-50 text-red-700',
        className,
      )}
    >
      {labels[severity]}
    </span>
  )
}
