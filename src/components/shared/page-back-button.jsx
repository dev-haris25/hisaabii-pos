'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useIsRtl } from '@/components/auth/use-is-rtl'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * Shared back control for nested pages (rules.md #12).
 *
 * @param {{
 *   href: string
 *   label?: string
 *   className?: string
 * }} props
 */
export function PageBackButton({ href, label, className }) {
  const t = useTranslations('Common')
  const isRtl = useIsRtl()
  const Icon = isRtl ? ArrowRight : ArrowLeft
  const text = label ?? t('back')

  return (
    <Link
      href={href}
      className={cn(
        'type-label-md text-hisabi-primary hover:bg-hisabi-surface-container-low mb-hisabi-md inline-flex items-center gap-hisabi-xs rounded-full px-2 py-1 transition-colors',
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {text}
    </Link>
  )
}
