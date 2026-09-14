'use client'

import { X } from 'lucide-react'
import { useId } from 'react'

import { cn } from '@/lib/utils'

/**
 * Shared Hisabi overlay shell (forms, previews, multi-action dialogs).
 * Type-colored top accent bar — pick by situation:
 * - **error** — destructive flows
 * - **warning** — caution / deactivate
 * - **success** — completed positive outcome
 * - **neutral** — create/edit forms, help, legal (default)
 *
 * @typedef {'error' | 'success' | 'warning' | 'neutral'} HisabiOverlayModalVariant
 */

const ACCENT = {
  error: 'bg-hisabi-error',
  success: 'bg-hisabi-surface-tint',
  warning: 'bg-hisabi-secondary',
  neutral: 'bg-hisabi-primary-container',
}

/**
 * Shared Hisabi overlay shell (category deactivate / status modal family).
 * Type-colored top accent bar; optional header + scrollable body + footer.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   variant?: HisabiOverlayModalVariant
 *   title: string
 *   description?: import('react').ReactNode
 *   children?: import('react').ReactNode
 *   footer?: import('react').ReactNode
 *   closeLabel?: string
 *   dismissible?: boolean
 *   panelClassName?: string
 *   className?: string
 * }} props
 */
export function HisabiOverlayModal({
  open,
  onOpenChange,
  variant = 'neutral',
  title,
  description,
  children,
  footer,
  closeLabel = 'Close',
  dismissible = true,
  panelClassName,
  className,
}) {
  const titleId = useId()
  const accent = ACCENT[variant] ?? ACCENT.neutral

  if (!open) return null

  function handleClose() {
    if (!dismissible) return
    onOpenChange(false)
  }

  return (
    <div className={cn('fixed inset-0 z-[130]', className)} role="presentation">
      <div
        className="pointer-events-none absolute inset-0 bg-hisabi-primary/50 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="absolute inset-0 flex h-full min-h-0 w-full items-center justify-center bg-hisabi-on-primary-fixed/80 p-hisabi-margin-mobile sm:p-hisabi-margin-desktop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) handleClose()
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            'relative flex max-h-[min(92vh,900px)] w-full max-w-[var(--width-hisabi-overlay-md)] flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest shadow-hisabi-2',
            panelClassName,
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={cn('h-1 w-full shrink-0', accent)} aria-hidden />
          <div className="flex items-start justify-between gap-hisabi-md border-b border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="type-headline-sm text-hisabi-on-surface font-bold"
              >
                {title}
              </h2>
              {description ? (
                <div className="type-body-sm text-hisabi-on-surface-variant mt-1">
                  {description}
                </div>
              ) : null}
            </div>
            {dismissible ? (
              <button
                type="button"
                onClick={handleClose}
                className="text-hisabi-outline hover:bg-hisabi-surface-container shrink-0 rounded-full p-2"
                aria-label={closeLabel}
              >
                <X className="size-5" aria-hidden />
              </button>
            ) : null}
          </div>
          {children ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-hisabi-lg py-hisabi-md">
              {children}
            </div>
          ) : null}
          {footer ? (
            <div className="shrink-0 space-y-hisabi-sm border-t border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
