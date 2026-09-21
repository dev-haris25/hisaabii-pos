'use client'

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useTransition } from 'react'

import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { ActionIconLink } from '@/components/row-actions/action-icon-button'
import { WasteSeverityBadge } from '@/components/stock/waste-severity-badge'
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
import { displayedKitchenUsedQty } from '@/lib/stock/kitchen-waste-ai-result'
import { stockUnitLabel } from '@/lib/stock/units'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

function formatWhen(iso, locale) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function itemLabel(stock, locale) {
  if (!stock) return '—'
  if (locale === 'ar') return stock.nameAr || stock.nameEn || '—'
  return stock.nameEn || stock.nameAr || '—'
}

/**
 * @param {{
 *   allocations: Array<Record<string, unknown>>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { from: string, to: string }
 * }} props
 */
export function StockWastageListView({ allocations, pagination, filters }) {
  const t = useTranslations('Stock')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function pushFilters(next) {
    const params = new URLSearchParams()
    params.set('page', String(next.page ?? 1))
    params.set('limit', String(next.limit ?? pagination.limit ?? 10))
    if (next.from) params.set('from', next.from)
    if (next.to) params.set('to', next.to)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

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
      <div className="mb-hisabi-xl flex flex-col gap-hisabi-lg min-[1251px]:flex-row min-[1251px]:items-end min-[1251px]:justify-between">
        <div className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">
            {t('wastageTitle')}
          </h1>
          <p className="type-body-md max-w-lg text-hisabi-on-surface-variant">
            {t('wastageSubtitle')}
          </p>
          <p className="type-body-sm max-w-lg text-hisabi-on-surface-variant">
            {t('wastageBulkAiDisclaimer')}
          </p>
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('loadingWastage')
              : t('showingWastageCount', { shown: allocations.length, total })
          }
        >
          <label className="type-body-sm flex items-center gap-2 text-hisabi-on-surface-variant">
            {t('wastageFilterFrom')}
            <input
              type="date"
              value={filters.from}
              disabled={listBusy}
              onChange={(e) =>
                pushFilters({
                  page: 1,
                  from: e.target.value,
                  to: filters.to,
                  limit: pageSize,
                })
              }
              className={listTableToolbarSelectClass()}
            />
          </label>
          <label className="type-body-sm flex items-center gap-2 text-hisabi-on-surface-variant">
            {t('wastageFilterTo')}
            <input
              type="date"
              value={filters.to}
              disabled={listBusy}
              onChange={(e) =>
                pushFilters({
                  page: 1,
                  from: filters.from,
                  to: e.target.value,
                  limit: pageSize,
                })
              }
              className={listTableToolbarSelectClass()}
            />
          </label>
        </ListTableToolbar>

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[720px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colName')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('kitchenColIssued')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('kitchenColUsed')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('wastageColWaste')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('wastageColSeverity')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('wastageColRecipes')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('wastageColDays')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('wastageColClosed')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colActions')}
                </th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {allocations.length === 0 ? (
                <tr className={LIST_TABLE_ROW}>
                  <td className={listTableTdClass()} colSpan={9}>
                    <p className="type-body-md py-hisabi-xl text-center text-hisabi-on-surface-variant">
                      {t('wastageEmpty')}
                    </p>
                  </td>
                </tr>
              ) : (
                allocations.map((row) => {
                  const stock = /** @type {Record<string, unknown> | null} */ (
                    row.stockItem
                  )
                  const unit = stockUnitLabel(
                    /** @type {string | undefined} */ (stock?.unit),
                  )
                  const stats = /** @type {Record<string, number | null>} */ (
                    row.stats ?? {}
                  )
                  return (
                    <tr key={String(row.id)} className={LIST_TABLE_ROW}>
                      <td className={listTableTdClass(undefined, true)}>
                        <Link
                          href={`/stock/wastage/${row.id}`}
                          className="font-semibold text-hisabi-primary hover:underline"
                        >
                          {itemLabel(stock, locale)}
                        </Link>
                        {row.isBulk === true ? (
                          <span className="type-label-sm text-hisabi-on-surface-variant ms-2">
                            ({t('bulkBadge')})
                          </span>
                        ) : null}
                      </td>
                      <td className={cn(listTableTdClass(), 'tabular-nums')}>
                        {String(row.quantityIssued)} {unit}
                      </td>
                      <td className={cn(listTableTdClass(), 'tabular-nums')}>
                        {displayedKitchenUsedQty(row)} {unit}
                      </td>
                      <td className={cn(listTableTdClass(), 'tabular-nums')}>
                        {String(row.quantityWaste ?? '0')} {unit}
                      </td>
                      <td className={listTableTdClass()}>
                        <WasteSeverityBadge
                          severity={
                            typeof row.wasteSeverity === 'string'
                              ? row.wasteSeverity
                              : null
                          }
                          labels={{
                            low: t('wastageSeverityLow'),
                            bearable: t('wastageSeverityBearable'),
                            high: t('wastageSeverityHigh'),
                          }}
                        />
                      </td>
                      <td className={cn(listTableTdClass(), 'tabular-nums')}>
                        {Number(stats.recipeCount ?? 0)}
                      </td>
                      <td className={cn(listTableTdClass(), 'tabular-nums')}>
                        {stats.durationDays != null
                          ? Number(stats.durationDays)
                          : '—'}
                      </td>
                      <td className={listTableTdClass()}>
                        {formatWhen(
                          /** @type {string | null} */ (row.closedAt),
                          locale,
                        )}
                      </td>
                      <td className={listTableTdClass()}>
                        <ActionIconLink
                          href={`/stock/wastage/${row.id}`}
                          label={t('view')}
                        >
                          <Eye className="size-4" aria-hidden />
                        </ActionIconLink>
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
                    from: filters.from,
                    to: filters.to,
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
                    to: start + allocations.length,
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
                pushFilters({
                  page: 1,
                  from: filters.from,
                  to: filters.to,
                  limit: pageSize,
                })
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
                  from: filters.from,
                  to: filters.to,
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
                        from: filters.from,
                        to: filters.to,
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
                  from: filters.from,
                  to: filters.to,
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
                  from: filters.from,
                  to: filters.to,
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
