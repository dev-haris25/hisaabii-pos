'use client'

import { Delete, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { cn } from '@/lib/utils'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '.']

/**
 * @param {string} current
 * @param {string} key
 */
export function applyNumpadKey(current, key) {
  const raw = String(current ?? '')
  if (key === 'backspace') return raw.slice(0, -1)
  if (key === 'clear') return ''
  if (key === '.') {
    if (raw.includes('.')) return raw
    return raw === '' ? '0.' : `${raw}.`
  }
  if (key === '00') {
    if (raw === '' || raw === '0') return '0'
    return appendDigits(raw, '00')
  }
  if (key === '0') {
    if (raw === '0') return raw
    return appendDigits(raw, '0')
  }
  if (raw === '0') return key
  return appendDigits(raw, key)
}

/**
 * @param {string} current
 * @param {string} digits
 */
function appendDigits(current, digits) {
  const dot = current.indexOf('.')
  if (dot === -1) return current + digits
  const decimals = current.slice(dot + 1)
  const room = Math.max(0, 4 - decimals.length)
  if (room === 0) return current
  return current + digits.slice(0, room)
}

/**
 * @param {{
 *   open: boolean
 *   title: string
 *   value: string
 *   onKey: (key: string) => void
 *   onClose: () => void
 *   onDone: () => void
 *   className?: string
 * }} props
 */
export function PosOnScreenNumpad({
  open,
  title,
  value,
  onKey,
  onClose,
  onDone,
  className,
}) {
  const t = useTranslations('Pos')
  if (!open) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col justify-end',
        className,
      )}
    >
      <button
        type="button"
        className="absolute inset-0 bg-hisabi-on-surface/35"
        aria-label={t('keypadClose')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="border-hisabi-outline-variant/40 shadow-hisabi-2 relative z-10 rounded-t-2xl border-t bg-hisabi-surface-container-lowest px-hisabi-md pb-[max(1rem,env(safe-area-inset-bottom))] pt-hisabi-md"
      >
        <div className="mb-hisabi-sm flex items-center justify-between gap-hisabi-sm">
          <p className="type-label-md font-bold text-hisabi-on-surface">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-hisabi-on-surface-variant hover:bg-hisabi-surface-container"
            aria-label={t('keypadClose')}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p
          dir="ltr"
          className="type-headline-md mb-hisabi-md rounded-xl border border-hisabi-outline-variant/40 bg-hisabi-surface px-hisabi-md py-hisabi-sm text-end font-bold text-hisabi-on-surface"
        >
          {value || '0'}
        </p>
        <div dir="ltr" className="mb-hisabi-md grid grid-cols-3 gap-hisabi-sm">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onKey(key)}
              className="type-headline-md min-h-14 cursor-pointer rounded-xl border border-hisabi-outline-variant/40 bg-white font-bold text-hisabi-on-surface active:bg-hisabi-secondary-fixed"
            >
              {key}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-hisabi-sm">
          <button
            type="button"
            onClick={() => onKey('clear')}
            className="type-label-md min-h-12 cursor-pointer rounded-xl border border-hisabi-outline-variant/40 bg-white font-semibold text-hisabi-on-surface-variant"
          >
            {t('keypadClear')}
          </button>
          <button
            type="button"
            onClick={() => onKey('backspace')}
            className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-hisabi-outline-variant/40 bg-white text-hisabi-on-surface"
            aria-label={t('keypadBackspace')}
          >
            <Delete className="size-5" aria-hidden />
          </button>
          <AuthSubmitButton
            type="button"
            className="min-h-12"
            onClick={onDone}
          >
            {t('keypadDone')}
          </AuthSubmitButton>
        </div>
      </div>
    </div>
  )
}

/**
 * @param {{
 *   keypadEnabled: boolean
 *   active: boolean
 * } & import('react').InputHTMLAttributes<HTMLInputElement>} props
 */
export function PosMoneyField({ keypadEnabled, active, className, ...props }) {
  return (
    <input
      {...props}
      type="text"
      inputMode={keypadEnabled ? 'none' : 'decimal'}
      readOnly={keypadEnabled}
      className={cn(
        className,
        keypadEnabled && 'cursor-pointer',
        active && 'border-hisabi-primary ring-2 ring-hisabi-primary/15',
      )}
    />
  )
}
