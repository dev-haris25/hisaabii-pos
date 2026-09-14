'use client'

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

export const DETAIL_TABLE_PAGE_SIZE = 5

/**
 * @template T
 * @param {T[]} items
 * @param {number} page
 * @param {number} [pageSize]
 */
export function paginateItems(items, page, pageSize = DETAIL_TABLE_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    pageRows: items.slice(start, start + pageSize),
    totalPages,
    safePage,
    totalItems: items.length,
  }
}

/**
 * @param {{
 *   totalItems: number
 *   page: number
 *   totalPages: number
 *   onPageChange: (page: number) => void
 * }} props
 */
export function DetailTablePagination({ totalItems, page, totalPages, onPageChange }) {
  const t = useTranslations('HR')

  if (totalItems === 0) return null

  const safePage = Math.min(Math.max(1, page), totalPages)

  return (
    <div className="text-hisabi-on-surface-variant flex flex-col gap-hisabi-md border-t border-hisabi-outline-variant/20 bg-slate-50/50 px-hisabi-xl py-hisabi-md text-xs font-medium sm:flex-row sm:items-center sm:justify-between sm:px-hisabi-xxl">
      <span className="type-body-sm text-slate-400">
        {totalItems} {t('records')}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
          className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('paginationFirst')}
        >
          <ChevronsLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('paginationPrevious')}
        >
          <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
        </button>
        <span className="type-label-sm px-2 font-bold text-hisabi-on-surface">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('paginationNext')}
        >
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
        </button>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('paginationLast')}
        >
          <ChevronsRight className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
