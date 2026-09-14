'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

/**
 * @param {{
 *   fromDate: string
 *   toDate: string
 *   onFromDateChange: (v: string) => void
 *   onToDateChange: (v: string) => void
 *   onQuickSelect?: (from: string, to: string) => void
 *   showQuickSelect?: boolean
 *   className?: string
 * }} props
 */
export function ReportDateRangeFilter({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onQuickSelect,
  showQuickSelect = true,
  className,
}) {
  const t = useTranslations('Reports')

  function applyQuick(kind) {
    const now = new Date()
    let from
    let to
    if (kind === 'thisMonth') {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else if (kind === 'lastMonth') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      to = new Date(now.getFullYear(), now.getMonth(), 0)
    } else if (kind === 'thisQuarter') {
      const q = Math.floor(now.getMonth() / 3)
      from = new Date(now.getFullYear(), q * 3, 1)
      to = new Date(now.getFullYear(), q * 3 + 3, 0)
    } else if (kind === 'thisYear') {
      from = new Date(now.getFullYear(), 0, 1)
      to = new Date(now.getFullYear(), 11, 31)
    } else {
      return
    }
    const fromStr = from.toISOString().slice(0, 10)
    const toStr = to.toISOString().slice(0, 10)
    onFromDateChange(fromStr)
    onToDateChange(toStr)
    onQuickSelect?.(fromStr, toStr)
  }

  const quickButtons = [
    ['thisMonth', 'quickThisMonth'],
    ['lastMonth', 'quickLastMonth'],
    ['thisQuarter', 'quickThisQuarter'],
    ['thisYear', 'quickThisYear'],
  ]

  return (
    <div className={cn('flex flex-col gap-hisabi-sm', className)}>
      <div className="flex flex-col gap-hisabi-md sm:flex-row sm:items-end">
        <div className="space-y-hisabi-xs min-w-[10rem] flex-1">
          <label className="type-label-sm text-hisabi-on-surface-variant block font-semibold">
            {t('fromDate')}
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="space-y-hisabi-xs min-w-[10rem] flex-1">
          <label className="type-label-sm text-hisabi-on-surface-variant block font-semibold">
            {t('toDate')}
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>
      {showQuickSelect ? (
        <div className="flex flex-wrap gap-hisabi-xs">
          {quickButtons.map(([kind, labelKey]) => (
            <button
              key={kind}
              type="button"
              onClick={() => applyQuick(kind)}
              className="type-label-sm text-hisabi-primary hover:bg-hisabi-primary-container/10 rounded-lg border border-hisabi-outline-variant/40 px-hisabi-md py-1.5 font-semibold transition-colors"
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** @returns {{ formatDate: (iso: string | null | undefined) => string, formatAmount: (v: string | number | null | undefined) => string, uiLocale: string }} */
export function useReportFormatters() {
  const locale = useLocale()
  const uiLocale = locale === 'ar' ? 'ar-SA' : 'en-US'

  const formatDate = useCallback(
    (iso) => {
      if (!iso) return '—'
      const d = new Date(iso.includes('T') ? iso : `${iso.slice(0, 10)}T12:00:00`)
      if (Number.isNaN(d.getTime())) return '—'
      return new Intl.DateTimeFormat(uiLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(d)
    },
    [uiLocale],
  )

  const formatAmount = useCallback(
    (v) => {
      const n = Number.parseFloat(String(v ?? '')) || 0
      return formatSarAmount(n, locale)
    },
    [locale],
  )

  return { formatDate, formatAmount, uiLocale }
}

/**
 * @param {{ label: string, value: string | number, hint?: string, icon: import('react').ComponentType<{ className?: string }>, iconClassName?: string }} props
 */
export function ReportStatCard({ label, value, hint, icon: Icon, iconClassName }) {
  return (
    <div className="rounded-xl border border-hisabi-outline-variant/30 bg-white p-hisabi-lg shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-hisabi-md">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            iconClassName ?? 'bg-hisabi-primary-container/15 text-hisabi-primary',
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <p className="type-label-sm text-hisabi-outline text-end font-bold uppercase tracking-wider">
          {label}
        </p>
      </div>
      <p className="type-headline-md text-hisabi-primary mt-hisabi-md" dir="ltr">
        {value}
      </p>
      {hint ? (
        <p className="type-body-sm text-hisabi-on-surface-variant mt-hisabi-xs">{hint}</p>
      ) : null}
    </div>
  )
}
