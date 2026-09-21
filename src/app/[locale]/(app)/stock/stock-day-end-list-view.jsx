'use client'

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { ActionIconLink } from '@/components/row-actions/action-icon-button'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
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

function formatDay(isoDate, locale) {
  if (!isoDate) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
    }).format(new Date(`${isoDate}T00:00:00.000Z`))
  } catch {
    return isoDate
  }
}

/**
 * @param {{
 *   reports: Array<Record<string, unknown>>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { from: string, to: string }
 * }} props
 */
export function StockDayEndListView({ reports, pagination, filters }) {
  const t = useTranslations('Stock')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const ability = useAppAbility()
  const canUpdate = ability.can('update', 'StockItem')
  const [isPending, startTransition] = useTransition()
  const [opening, setOpening] = useState(false)

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

  async function openToday() {
    setOpening(true)
    try {
      const data = await authPost('/stock/day-end', {})
      const id = data?.report?.id
      if (!id) throw new Error('missing report')
      router.push(`/stock/day-end/${id}`)
    } catch (err) {
      toast.error(
        err instanceof AuthApiError ? err.message : t('dayEndOpenFailed'),
      )
    } finally {
      setOpening(false)
    }
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
  const listBusy = isPending || opening

  return (
    <div className={cn('mx-auto max-w-hisabi-container', listBusy && 'opacity-70')}>
      <div className="mb-hisabi-xl flex flex-col gap-hisabi-lg min-[1251px]:flex-row min-[1251px]:items-end min-[1251px]:justify-between">
        <div className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">
            {t('dayEndTitle')}
          </h1>
          <p className="type-body-md max-w-lg text-hisabi-on-surface-variant">
            {t('dayEndSubtitle')}
          </p>
        </div>
        {canUpdate ? (
          <AuthSubmitButton
            type="button"
            pending={opening}
            onClick={openToday}
            className="w-auto shrink-0 self-start min-[1251px]:self-end"
          >
            {t('dayEndOpenToday')}
          </AuthSubmitButton>
        ) : null}
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('loadingDayEnd')
              : t('showingDayEndCount', { shown: reports.length, total })
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
          <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('dayEndColDate')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('dayEndColStatus')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colActions')}
                </th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {reports.length === 0 ? (
                <tr className={LIST_TABLE_ROW}>
                  <td className={listTableTdClass()} colSpan={3}>
                    <p className="type-body-md py-hisabi-xl text-center text-hisabi-on-surface-variant">
                      {t('dayEndEmpty')}
                    </p>
                  </td>
                </tr>
              ) : (
                reports.map((row) => (
                  <tr key={String(row.id)} className={LIST_TABLE_ROW}>
                    <td className={listTableTdClass(undefined, true)}>
                      <Link
                        href={`/stock/day-end/${row.id}`}
                        className="font-semibold text-hisabi-primary hover:underline"
                      >
                        {formatDay(String(row.reportDate), locale)}
                      </Link>
                    </td>
                    <td className={listTableTdClass()}>
                      {row.status === 'submitted'
                        ? t('dayEndStatusSubmitted')
                        : t('dayEndStatusDraft')}
                    </td>
                    <td className={listTableTdClass()}>
                      <ActionIconLink
                        href={`/stock/day-end/${row.id}`}
                        label={t('view')}
                      >
                        <Eye className="size-4" aria-hidden />
                      </ActionIconLink>
                    </td>
                  </tr>
                ))
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
                    to: start + reports.length,
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
