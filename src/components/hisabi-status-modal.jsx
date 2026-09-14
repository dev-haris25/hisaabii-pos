'use client'

import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { cn } from '@/lib/utils'

/**
 * Centered status dialog using Hisabi tokens.
 *
 * Variant map (match Hisabi):
 * - **error** — delete / destructive (red bar + destructive CTA)
 * - **warning** — cancel / deactivate / caution (gold bar + muted CTA)
 * - **success** — positive completion (teal bar + muted CTA)
 *
 * @typedef {'error' | 'success' | 'warning'} HisabiStatusModalVariant
 */

const VARIANT_CONFIG = {
  error: {
    accent: 'bg-hisabi-error',
    iconWrap: 'bg-hisabi-error-container text-hisabi-error',
    Icon: AlertCircle,
  },
  success: {
    accent: 'bg-hisabi-surface-tint',
    iconWrap: 'bg-hisabi-primary-fixed text-hisabi-primary-container',
    Icon: CheckCircle2,
  },
  warning: {
    accent: 'bg-hisabi-secondary',
    iconWrap: 'bg-hisabi-secondary-container text-hisabi-secondary',
    Icon: AlertTriangle,
  },
}

/**
 * Centered status dialog (error / success / warning) using Hisabi tokens.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   variant: HisabiStatusModalVariant
 *   title: string
 *   description?: import('react').ReactNode
 *   primaryLabel: string
 *   primaryStartIcon?: import('react').ReactNode
 *   onPrimary?: () => void
 *   primaryPending?: boolean
 *   secondaryLabel?: string
 *   onSecondary?: () => void
 *   className?: string
 * }} props
 */
export function HisabiStatusModal({
  open,
  onOpenChange,
  variant,
  title,
  description,
  primaryLabel,
  primaryStartIcon,
  onPrimary,
  primaryPending = false,
  secondaryLabel,
  onSecondary,
  className,
}) {
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null))
  const titleId = useId()
  const descId = useId()
  const cfg = VARIANT_CONFIG[variant]
  const Icon = cfg.Icon

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    function onClose() {
      onOpenChange(false)
    }
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [onOpenChange])

  function handleBackdropMouseDown(e) {
    if (e.target === e.currentTarget) {
      onOpenChange(false)
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        'fixed inset-0 z-[100] m-0 max-h-none max-w-none',
        'h-full w-full border-0 bg-transparent p-0',
        'backdrop:bg-hisabi-primary/50 backdrop:backdrop-blur-sm',
      )}
    >
      <div
        className="flex h-full min-h-0 w-full items-center justify-center bg-hisabi-on-primary-fixed/80 p-hisabi-margin-mobile sm:p-hisabi-margin-desktop"
        onMouseDown={handleBackdropMouseDown}
      >
        <div
          className={cn(
            'w-full max-w-[var(--width-hisabi-overlay-md)] overflow-hidden rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest shadow-hisabi-2',
            className,
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={cn('h-1 w-full shrink-0', cfg.accent)} aria-hidden />
          <div className="px-hisabi-lg pb-hisabi-xl pt-hisabi-lg text-center sm:px-hisabi-xl sm:pt-hisabi-xl">
            <div className="mb-hisabi-lg flex justify-center">
              <div
                className={cn(
                  'flex size-16 shrink-0 items-center justify-center rounded-full',
                  cfg.iconWrap,
                )}
              >
                <Icon
                  className="size-9"
                  strokeWidth={variant === 'success' ? 2.25 : 2}
                  aria-hidden
                />
              </div>
            </div>
            <h2
              id={titleId}
              className={cn(
                'type-headline-md text-hisabi-on-surface',
                description ? 'mb-hisabi-sm' : 'mb-hisabi-xl',
              )}
            >
              {title}
            </h2>
            {description ? (
              <div
                id={descId}
                className="type-body-md text-hisabi-on-surface-variant mb-hisabi-xl overflow-visible px-hisabi-sm"
              >
                {description}
              </div>
            ) : null}
            <div className="space-y-hisabi-md">
              <AuthSubmitButton
                type="button"
                variant={variant === 'error' ? 'destructive' : 'muted'}
                pending={primaryPending}
                onClick={() => {
                  onPrimary?.()
                }}
              >
                {primaryStartIcon ? (
                  <span className="flex items-center justify-center gap-hisabi-sm">
                    {primaryStartIcon}
                    {primaryLabel}
                  </span>
                ) : (
                  primaryLabel
                )}
              </AuthSubmitButton>
              {secondaryLabel ? (
                <button
                  type="button"
                  className={cn(
                    'type-label-md text-hisabi-on-surface-variant flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-xl py-4 transition-colors',
                    'hover:bg-hisabi-surface-container hover:text-hisabi-teal',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hisabi-surface-tint/40',
                  )}
                  onClick={() => {
                    onSecondary?.()
                    onOpenChange(false)
                  }}
                >
                  {secondaryLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
