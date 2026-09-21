'use client'

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useTransition } from 'react'

import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { PageBackButton } from '@/components/shared/page-back-button'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { buildPaginationItems } from '@/lib/list-views/build-pagination-items'
import { listTableToolbarSelectClass } from '@/lib/list-views/list-page-toolbar-styles'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const TYPE_OPTIONS = [
  'all',
  'purchase',
  'adjust_in',
  'adjust_out',
  'opening',
  'recipe_deduct',
  'allotment_issue',
  'kitchen_stock_issue',
]

function formatWhen(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * @param {{
 *   movements: Array<Record<string, unknown>>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { type: string }
 * }} props
 */
export function StockMovementsListView({ movements, pagination, filters }) {
  const t = useTranslations('Stock')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function pushFilters(next) {
    const params = new URLSearchParams()
    params.set('page', String(next.page ?? 1))
    params.set('limit', String(next.limit ?? pagination.limit ?? 10))
    if (next.type && next.type !== 'all') params.set('type', next.type)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const emptyMessage =
    filters.type !== 'all' ? t('movementsEmptyFiltered') : t('movementsEmpty')

  const safePage = Math.max(1, pagination.page || 1)
  const totalPages = Math.max(1, pagination.totalPages || 1)
  const total = pagination.total || 0
  const pageSize = pagination.limit || 10
  const start = total === 0 ? 0 : (safePage - 1) * pageSize
  const paginationItems = useMemo(
    () => buildPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  )
  const listBusy = isPending

  return (
    <div className={cn('mx-auto max-w-hisabi-container', listBusy && 'opacity-70')}>
      <PageBackButton href="/stock" label={t('backToList')} />

      <div className="mb-hisabi-xl space-y-1">
        <h1 className="type-headline-xl text-hisabi-on-surface">
          {t('movementsTitle')}
        </h1>
        <p className="type-body-md max-w-lg text-hisabi-on-surface-variant">
          {t('movementsSubtitle')}
        </p>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('loadingMovements')
              : t('showingMovementsCount', {
                  shown: movements.length,
                  total,
                })
          }
        >
          <select
            aria-label={t('filterMovementType')}
            value={filters.type}
            disabled={listBusy}
            onChange={(e) =>
              pushFilters({
                page: 1,
                type: e.target.value,
                limit: pageSize,
              })
            }
            className={listTableToolbarSelectClass()}
          >
            {TYPE_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {key === 'all'
                  ? t('filterAll')
                  : t(`movementType_${key}`)}
              </option>
            ))}
          </select>
        </ListTableToolbar>

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[720px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={listTableThClass()}>
                  {t('colWhen')}
                </th>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colName')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colMovementType')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colMovementQty')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colBalance')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colReason')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colBy')}
                </th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {movements.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="type-body-md px-hisabi-lg py-12 text-center text-hisabi-on-surface-variant"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                movements.map((row) => {
                  const stockItem =
                    /** @type {{ nameEn?: string | null, nameAr?: string } | null} */ (
                      row.stockItem
                    )
                  const name =
                    locale === 'en' && stockItem?.nameEn
                      ? stockItem.nameEn
                      : stockItem?.nameAr ?? '—'
                  const signed =
                    row.direction === 'out'
                      ? `−${row.quantity}`
                      : `+${row.quantity}`
                  return (
                    <tr key={String(row.id)} className={LIST_TABLE_ROW}>
                      <td className={listTableTdClass()}>
                        {formatWhen(String(row.createdAt), locale)}
                      </td>
                      <td className={listTableTdClass(undefined, true)}>
                        <Link
                          href={`/stock/items/${row.stockItemId}`}
                          className="text-hisabi-primary hover:underline"
                        >
                          {name}
                        </Link>
                      </td>
                      <td className={listTableTdClass()}>
                        {t(`movementType_${row.type}`)}
                      </td>
                      <td
                        className={cn(
                          listTableTdClass(),
                          'tabular-nums',
                          row.direction === 'out'
                            ? 'text-hisabi-error'
                            : 'text-hisabi-on-surface',
                        )}
                      >
                        {signed} {String(row.unitLabel ?? '')}
                      </td>
                      <td className={cn(listTableTdClass(), 'tabular-nums')}>
                        {String(row.quantityBefore)} → {String(row.quantityAfter)}
                      </td>
                      <td className={listTableTdClass()}>
                        {row.reason ? String(row.reason) : '—'}
                      </td>
                      <td className={listTableTdClass()}>
                        {row.createdByName ? String(row.createdByName) : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-hisabi-md border-t border-hisabi-outline-variant/20 bg-slate-50/50 p-hisabi-md text-xs font-medium text-hisabi-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-hisabi-lg">
            <div className="flex items-center gap-2">
              <span>{t('rowsPerPage')}</span>
              <select
                className="type-label-sm cursor-pointer border-none bg-transparent py-0 pe-6 ps-1 font-bold text-hisabi-on-surface focus:ring-0"
                aria-label={t('rowsPerPageAria')}
                value={pageSize}
                disabled={listBusy}
                onChange={(e) =>
                  pushFilters({
                    page: 1,
                    type: filters.type,
                    limit: Number(e.target.value),
                  })
                }
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <span>
              {total === 0
                ? t('rangeEmpty')
                : t('range', {
                    from: start + 1,
                    to: start + movements.length,
                    total,
                  })}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 sm:justify-end">
            <button
              type="button"
              disabled={safePage <= 1 || listBusy}
              className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={t('pageFirst')}
              onClick={() =>
                pushFilters({ page: 1, type: filters.type, limit: pageSize })
              }
            >
              <ChevronsLeft className="size-5" />
            </button>
            <button
              type="button"
              disabled={safePage <= 1 || listBusy}
              className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={t('pagePrev')}
              onClick={() =>
                pushFilters({
                  page: Math.max(1, safePage - 1),
                  type: filters.type,
                  limit: pageSize,
                })
              }
            >
              <ChevronLeft className="size-5 rtl:rotate-180" />
            </button>
            <div className="flex items-center gap-1">
              {paginationItems.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e-${idx}`} className="px-2 text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    disabled={listBusy}
                    onClick={() =>
                      pushFilters({
                        page: item,
                        type: filters.type,
                        limit: pageSize,
                      })
                    }
                    className={cn(
                      'type-label-sm flex size-8 cursor-pointer items-center justify-center rounded-lg text-xs font-bold transition-colors',
                      item === safePage
                        ? 'bg-hisabi-primary text-white'
                        : 'border border-transparent text-slate-600 hover:border-hisabi-outline-variant/30 hover:bg-white',
                    )}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              disabled={safePage >= totalPages || listBusy}
              className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={t('pageNext')}
              onClick={() =>
                pushFilters({
                  page: Math.min(totalPages, safePage + 1),
                  type: filters.type,
                  limit: pageSize,
                })
              }
            >
              <ChevronRight className="size-5 rtl:rotate-180" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages || listBusy}
              className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={t('pageLast')}
              onClick={() =>
                pushFilters({
                  page: totalPages,
                  type: filters.type,
                  limit: pageSize,
                })
              }
            >
              <ChevronsRight className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
