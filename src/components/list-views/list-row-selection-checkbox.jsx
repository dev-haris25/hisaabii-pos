'use client'

import { cn } from '@/lib/utils'

/**
 * @param {{
 *   checked: boolean
 *   indeterminate?: boolean
 *   onChange: () => void
 *   disabled?: boolean
 *   ariaLabel: string
 *   className?: string
 * }} props
 */
export function ListRowSelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  ariaLabel,
  className,
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate
      }}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded border-hisabi-outline-variant/40 text-hisabi-primary focus:ring-hisabi-primary/30 disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    />
  )
}
