'use client'

import { useTranslations } from 'next-intl'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { cn } from '@/lib/utils'

/**
 * Shared area / page loader (rules §12) — centered spinner + visually-hidden status text.
 * Use inside a flex/min-h-dvh container for full-screen states; `size="lg"` for list,
 * table-body and section loading.
 *
 * @param {{
 *   className?: string
 *   size?: 'md' | 'lg' | 'page'
 *   label?: string
 * }} props
 */
export function AppLoader({ className, size = 'page', label }) {
  const t = useTranslations('Common')

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-hisabi-sm',
        className,
      )}
    >
      <HisabiSpinner size={size} className="text-hisabi-teal" />
      <span className="sr-only">{label ?? t('loadingAria')}</span>
    </div>
  )
}
