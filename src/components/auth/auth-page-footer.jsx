'use client'

import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

/** Same footer as auth flows: Login namespace — copyright + Privacy + Terms. */
export function AuthPageFooter() {
  const t = useTranslations('Login')
  const year = new Date().getFullYear()

  return (
    <footer className="type-label-sm text-hisabi-outline/60 flex shrink-0 flex-wrap items-center justify-between gap-hisabi-md pt-hisabi-xl">
      <span>{t('footerCopyright', { year })}</span>
      <div className="flex flex-wrap gap-hisabi-md">
        <Link href="/privacy" className="text-hisabi-outline hover:text-hisabi-teal">
          {t('privacy')}
        </Link>
        <Link href="/terms" className="text-hisabi-outline hover:text-hisabi-teal">
          {t('terms')}
        </Link>
      </div>
    </footer>
  )
}
