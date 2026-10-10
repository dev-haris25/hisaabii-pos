'use client'

import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AppLoader } from '@/components/app-loader'
import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import { cn } from '@/lib/utils'
import {
  LIST_TABLE_TOOLBAR_EXPORT_BUTTON,
  LIST_TABLE_TOOLBAR_ROW,
} from '@/lib/list-views/list-page-toolbar-styles'

/**
 * @param {{
 *   title: string
 *   subtitle?: string
 *   hasBusinessProfile?: boolean
 *   loading?: boolean
 *   error?: boolean
 *   onRetry?: () => void
 *   statCards?: import('react').ReactNode
 *   filters?: import('react').ReactNode
 *   onExportCsv?: () => void
 *   exportDisabled?: boolean
 *   banner?: import('react').ReactNode
 *   headerExtra?: import('react').ReactNode
 *   children: import('react').ReactNode
 * }} props
 */
export function ReportPageShell({
  title,
  subtitle,
  hasBusinessProfile = true,
  loading = false,
  error = false,
  onRetry,
  statCards,
  filters,
  onExportCsv,
  exportDisabled = false,
  banner,
  headerExtra,
  children,
}) {
  const t = useTranslations('Reports')

  if (hasBusinessProfile !== true) {
    return (
      <div className="mx-auto max-w-hisabi-container">
        <NoCompanyProfileBanner className="mb-hisabi-lg" />
        <div className="pointer-events-none select-none opacity-40">
          <div className="mb-hisabi-xl space-y-1">
            <h1 className="type-headline-xl text-hisabi-on-surface">{title}</h1>
            {subtitle ? (
              <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-hisabi-container">
      <header className="mb-hisabi-xl flex flex-col gap-hisabi-md sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{title}</h1>
          {subtitle ? (
            <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">{subtitle}</p>
          ) : null}
        </div>
        {headerExtra}
      </header>

      {banner}

      {statCards ? (
        <div className="mb-hisabi-xl grid grid-cols-1 gap-hisabi-md sm:grid-cols-2 xl:grid-cols-4">
          {statCards}
        </div>
      ) : null}

      {filters || onExportCsv ? (
        <div className={cn(LIST_TABLE_TOOLBAR_ROW, 'mb-hisabi-lg sm:items-end')}>
          <div className="min-w-0 flex-1">{filters}</div>
          {onExportCsv ? (
            <button
              type="button"
              onClick={onExportCsv}
              disabled={exportDisabled || loading}
              className={LIST_TABLE_TOOLBAR_EXPORT_BUTTON}
            >
              <Download className="size-4" aria-hidden />
              {t('exportCsv')}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="type-body-md text-hisabi-error px-hisabi-lg py-hisabi-xl text-center">
          {t('loadError')}{' '}
          {onRetry ? (
            <button type="button" onClick={onRetry} className="text-hisabi-primary underline">
              {t('retryLoad')}
            </button>
          ) : null}
        </div>
      ) : loading ? (
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader size="lg" />
        </div>
      ) : (
        children
      )}
    </div>
  )
}

/**
 * @param {{ children: import('react').ReactNode, className?: string }} props
 */
export function ReportTableWrap({ children, className }) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * @param {{ children: import('react').ReactNode }} props
 */
export function ReportEmptyState({ children }) {
  const t = useTranslations('Reports')
  return (
    <p className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center">
      {children ?? t('noDataForPeriod')}
    </p>
  )
}
