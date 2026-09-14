'use client'

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { useLocale } from 'next-intl'

import { formatLocalizedNumber } from '@/lib/settings/format-helpers'

/**
 * @param {{
 *   total: number
 *   safePage: number
 *   totalPages: number
 *   recordsLabel: string
 *   onPageChange: (page: number) => void
 * }} props
 */
export function ListTablePagination({
  total,
  safePage,
  totalPages,
  recordsLabel,
  onPageChange,
}) {
  const locale = useLocale()
  const totalLabel = formatLocalizedNumber(total, locale, {
    maximumFractionDigits: 0,
  })
  const pageLabel = formatLocalizedNumber(safePage, locale, {
    maximumFractionDigits: 0,
  })
  const pagesLabel = formatLocalizedNumber(totalPages, locale, {
    maximumFractionDigits: 0,
  })

  return (
    <div className="text-hisabi-on-surface-variant flex flex-col gap-hisabi-md border-t border-hisabi-outline-variant/20 bg-slate-50/50 p-hisabi-md text-xs font-medium sm:flex-row sm:items-center sm:justify-between">
      <span className="type-body-sm text-slate-400">
        {totalLabel} {recordsLabel}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
          className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronsLeft className="size-5" />
        </button>
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
        </button>
        <span className="type-label-sm px-2 font-bold text-hisabi-on-surface">
          {pageLabel} / {pagesLabel}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
        </button>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronsRight className="size-5" />
        </button>
      </div>
    </div>
  )
}
