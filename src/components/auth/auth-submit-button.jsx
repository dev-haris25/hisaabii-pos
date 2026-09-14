'use client'

import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner'
import { cn } from '@/lib/utils'

/**
 * @typedef {'muted' | 'gold' | 'destructive' | 'secondary'} AuthSubmitButtonVariant
 */

/**
 * Primary CTA — shared by auth flows, business profile, and in-app forms.
 * All variants use the same label typography (`type-label-md` + bold); only fill/text/hover differ.
 *
 * @param {{
 *   children: import('react').ReactNode
 *   pending?: boolean
 *   disabled?: boolean
 *   className?: string
 *   type?: 'submit' | 'button' | 'reset'
 *   variant?: AuthSubmitButtonVariant
 * } & Omit<import('react').ComponentProps<'button'>, 'type' | 'disabled' | 'children'>} props
 */
export function AuthSubmitButton({
  children,
  pending = false,
  disabled = false,
  className,
  type = 'submit',
  variant = 'muted',
  ...rest
}) {
  const isDisabled = disabled || pending

  const variantClasses =
    variant === 'destructive'
      ? 'bg-hisabi-error text-white shadow-sm hover:bg-[color-mix(in_srgb,var(--hisabi-error)_82%,#000)] disabled:opacity-60 disabled:hover:bg-hisabi-error'
      : variant === 'secondary'
        ? 'border border-hisabi-outline-variant/60 bg-white text-hisabi-on-surface shadow-none hover:bg-hisabi-surface-container disabled:opacity-60 disabled:hover:bg-white'
        : 'bg-hisabi-gold-muted text-hisabi-on-secondary-container shadow-sm hover:bg-hisabi-gold-muted-hover disabled:opacity-60 disabled:hover:bg-hisabi-gold-muted'

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={pending || undefined}
      className={cn(
        'type-label-md flex min-h-hisabi-btn w-full cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl py-hisabi-btn font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed [&_svg]:h-[var(--size-hisabi-icon-md)] [&_svg]:w-[var(--size-hisabi-icon-md)]',
        variantClasses,
        className,
      )}
      {...rest}
    >
      {pending ? <AuthButtonSpinner /> : children}
    </button>
  )
}
