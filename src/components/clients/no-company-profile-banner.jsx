'use client'

import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * @param {{ className?: string }} props
 */
export function NoCompanyProfileBanner({ className }) {
  const t = useTranslations('Clients')

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-hisabi-md rounded-xl border border-red-200 bg-red-50/90 p-hisabi-lg text-red-900 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="type-body-md">{t('noCompanyBanner')}</p>
      <Link
        href="/restaurants/create"
        className="type-label-md inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-hisabi-md py-2 font-semibold text-black shadow-sm transition-colors hover:bg-red-100"
      >
        {t('addCompany')}
      </Link>
    </div>
  )
}
