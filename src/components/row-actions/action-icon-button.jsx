'use client'

import { Tooltip } from '@/components/shared/tooltip'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

const baseClassName =
  'shrink-0 cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors'

/**
 * Icon button for table row actions (rules §13) — wrapped in the shared `Tooltip`.
 * `title` is kept for backward compatibility and overrides the tooltip text; it is not
 * rendered as a native `title` attribute.
 *
 * @param {{
 *   label: string
 *   title?: string
 *   children: import('react').ReactNode
 *   className?: string
 *   disabled?: boolean
 *   onClick?: () => void
 * }} props
 */
export function ActionIconButton({
  label,
  title,
  children,
  className,
  disabled,
  onClick,
  ...props
}) {
  const tooltip = title ?? label

  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(baseClassName, className)}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  )
}

/**
 * @param {{
 *   label: string
 *   title?: string
 *   href: string
 *   children: import('react').ReactNode
 *   className?: string
 * }} props
 */
export function ActionIconLink({ label, title, href, children, className, ...props }) {
  const tooltip = title ?? label

  return (
    <Tooltip content={tooltip}>
      <Link
        href={href}
        aria-label={label}
        className={cn(baseClassName, className)}
        {...props}
      >
        {children}
      </Link>
    </Tooltip>
  )
}
