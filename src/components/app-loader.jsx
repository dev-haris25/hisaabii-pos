'use client'

import { useTranslations } from 'next-intl'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { cn } from '@/lib/utils'

/**
 * Centered page-level loader — use inside a flex/min-h-dvh container for full-screen states.
 */
export function AppLoader({ className }) {
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
      <HisabiSpinner size="page" className="text-hisabi-teal" />
      <span className="sr-only">{t('loadingAria')}</span>
    </div>
  )
}
