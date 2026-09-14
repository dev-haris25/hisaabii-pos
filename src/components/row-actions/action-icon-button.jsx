'use client'

import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

const baseClassName =
  'shrink-0 cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors'

/**
 * Icon button for table row actions — shows a native tooltip via `title`.
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
    <button
      type="button"
      aria-label={label}
      title={tooltip}
      disabled={disabled}
      onClick={onClick}
      className={cn(baseClassName, className)}
      {...props}
    >
      {children}
    </button>
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
    <Link
      href={href}
      aria-label={label}
      title={tooltip}
      className={cn(baseClassName, className)}
      {...props}
    >
      {children}
    </Link>
  )
}
