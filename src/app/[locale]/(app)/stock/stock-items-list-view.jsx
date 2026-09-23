'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  History,
  PackagePlus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { useAppAbility } from '@/components/rbac/ability-provider'
import {
  ActionIconButton,
  ActionIconLink,
} from '@/components/row-actions/action-icon-button'
import { StockAdjustSheet } from './stock-adjust-sheet'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { AuthApiError, authDelete } from '@/lib/api/auth-client'
import { isInternetRequiredError } from '@/lib/desktop/assert-cloud-write-allowed'
import { authGetStockItemsPreferOffline } from '@/lib/desktop/local-pos-api'
import { useIsHisabiDesktop } from '@/hooks/use-is-hisabi-desktop'
import { useRequireCloudForWrite } from '@/hooks/use-require-cloud-for-write'
import { buildPaginationItems } from '@/lib/list-views/build-pagination-items'
import { LIST_PAGE_HEADER_ACTIONS } from '@/lib/list-views/list-page-toolbar-styles'
import {
  LIST_TABLE_ACTIONS_INNER,
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableActionsTdClass,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { useUrlSyncedSearchInput } from '@/lib/list-views/use-url-synced-search-input'
import { stockUnitLabel } from '@/lib/stock/units'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

/**
 * @typedef {{
 *   id: string
 *   nameAr: string
 *   nameEn: string | null
 *   unit: string
 *   unitLabel: string
 *   quantityOnHand: string
 *   lowStockThreshold: string | null
 *   unitCost: string | null
 *   isBulk: boolean
 *   active: boolean
 *   isLowStock: boolean
 * }} StockRow
 */

/**
 * @param {{
 *   items: StockRow[]
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { search: string }
 * }} props
 */
export function StockItemsListView({ items, pagination, filters }) {
  const t = useTranslations('Stock')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const ability = useAppAbility()
  const { canWrite, guardWrite, cloudOnline } = useRequireCloudForWrite()
  const desktop = useIsHisabiDesktop()
  const desktopOffline = desktop && !cloudOnline

  const [offlineSearch, setOfflineSearch] = useState(
    /** @type {null | { search: string, page: number, limit: number }} */ (null),
  )
  const effectiveSearch =
    desktopOffline && offlineSearch ? offlineSearch.search : filters.search
  const effectivePage =
    desktopOffline && offlineSearch ? offlineSearch.page : pagination.page
  const effectiveLimit =
    desktopOffline && offlineSearch ? offlineSearch.limit : pagination.limit

  const offlineListQuery = useQuery({
    queryKey: [
      'stock',
      'items',
      'offline',
      effectiveSearch,
      effectivePage,
      effectiveLimit,
    ],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(effectivePage ?? 1))
      params.set('limit', String(effectiveLimit ?? 10))
      if (effectiveSearch) params.set('search', effectiveSearch)
      return authGetStockItemsPreferOffline(`/stock/items?${params.toString()}`)
    },
    enabled: desktopOffline,
  })

  const displayItems = desktopOffline
    ? /** @type {StockRow[]} */ (offlineListQuery.data?.items ?? items)
    : items
  const displayPagination = desktopOffline
    ? offlineListQuery.data?.pagination ?? pagination
    : pagination
  const canCreate = ability.can('create', 'StockItem')
  const canUpdate = ability.can('update', 'StockItem')
  const canDelete = ability.can('delete', 'StockItem')
  const showActions = canUpdate || canDelete || ability.can('read', 'StockItem')
  const [isPending, startTransition] = useTransition()

  const [deleteTarget, setDeleteTarget] = useState(
    /** @type {StockRow | null} */ (null),
  )
  const [adjustTarget, setAdjustTarget] = useState(
    /** @type {StockRow | null} */ (null),
  )

  const { searchInput, setSearchInput, debouncedSearch, lastPushedSearch } =
    useUrlSyncedSearchInput(filters.search)

  function pushFilters(next) {
    if (desktopOffline) {
      setOfflineSearch({
        search: next.search ?? '',
        page: next.page ?? 1,
        limit: next.limit ?? effectiveLimit ?? 10,
      })
      return
    }
    const params = new URLSearchParams()
    params.set('page', String(next.page ?? 1))
    params.set('limit', String(next.limit ?? pagination.limit ?? 10))
    if (next.search) params.set('search', next.search)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  useEffect(() => {
    if (debouncedSearch === lastPushedSearch.current) return
    lastPushedSearch.current = debouncedSearch
    pushFilters({
      page: 1,
      search: debouncedSearch,
      limit: effectiveLimit,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from debounced search only
  }, [debouncedSearch])

  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => authDelete(`/stock/items/${id}`),
    onSuccess: () => {
      toast.success(t('itemDeleted'))
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['stock', 'items'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-count'] })
      router.refresh()
    },
    onError: (err) => {
      if (isInternetRequiredError(err)) return
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  function displayName(row) {
    if (locale === 'en' && row.nameEn) return row.nameEn
    return row.nameAr
  }

  const emptyMessage = filters.search ? t('emptyFiltered') : t('empty')

  const safePage = Math.max(1, displayPagination.page || 1)
  const totalPages = Math.max(1, displayPagination.totalPages || 1)
  const total = displayPagination.total || 0
  const pageSize = displayPagination.limit || 10
  const start = total === 0 ? 0 : (safePage - 1) * pageSize
  const paginationItems = useMemo(
    () => buildPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  )
  const listBusy = isPending || (desktopOffline && offlineListQuery.isFetching)
  const colSpan = 4 + (showActions ? 1 : 0)

  return (
    <div className={cn('mx-auto max-w-hisabi-container', listBusy && 'opacity-70')}>
      <div className="mb-hisabi-xl flex flex-col gap-hisabi-lg min-[1251px]:flex-row min-[1251px]:items-end min-[1251px]:justify-between">
        <div className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('title')}</h1>
          <p className="type-body-md max-w-lg text-hisabi-on-surface-variant">
            {t('subtitle')}
          </p>
        </div>
        <div className={LIST_PAGE_HEADER_ACTIONS}>
          <Link
            href="/stock/movements"
            className="type-label-md text-hisabi-on-surface-variant inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-lg py-2.5 font-bold transition-all hover:border-hisabi-outline-variant hover:text-hisabi-primary active:scale-[0.98]"
          >
            <History className="size-5 shrink-0" aria-hidden />
            {t('viewMovements')}
          </Link>
          {canCreate ? (
            <Link
              href="/stock/items/new"
              className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
              onClick={(e) => {
                if (canWrite) return
                e.preventDefault()
                guardWrite(() => {})
              }}
            >
              <Plus className="size-5 shrink-0" aria-hidden />
              {t('addItem')}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('loadingList')
              : t('showingCount', { shown: displayItems.length, total })
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchPlaceholder')}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[720px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colName')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colQty')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colUnit')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colThreshold')}
                </th>
                {showActions ? (
                  <th scope="col" className={listTableThClass()}>
                    {t('colActions')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {displayItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={colSpan}
                    className="type-body-md px-hisabi-lg py-12 text-center text-hisabi-on-surface-variant"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                displayItems.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      LIST_TABLE_ROW,
                      row.isLowStock && 'bg-red-50/70 hover:bg-red-50',
                    )}
                  >
                    <td
                      className={listTableTdClass(
                        row.isLowStock
                          ? 'bg-red-50/70 group-hover/row:bg-red-50'
                          : undefined,
                        true,
                      )}
                    >
                      <span className="type-label-lg text-hisabi-on-surface">
                        {displayName(row)}
                      </span>
                    </td>
                    <td className={listTableTdClass()}>
                      <span
                        className={cn(
                          'type-label-lg tabular-nums',
                          row.isLowStock
                            ? 'text-hisabi-error'
                            : 'text-hisabi-on-surface',
                        )}
                      >
                        {row.quantityOnHand}
                      </span>
                      {row.isLowStock ? (
                        <span className="ms-2 inline-flex items-center gap-1 type-body-sm text-hisabi-error">
                          <AlertTriangle className="size-4" aria-hidden />
                          {t('lowStockBadge')}
                        </span>
                      ) : null}
                    </td>
                    <td className={listTableTdClass()}>
                      {row.unitLabel ||
                        stockUnitLabel(
                          /** @type {import('@/lib/stock/units').StockUnit} */ (
                            row.unit
                          ),
                        )}
                    </td>
                    <td className={listTableTdClass()}>
                      {row.lowStockThreshold ?? '—'}
                    </td>
                    {showActions ? (
                      <td className={listTableActionsTdClass()}>
                        <div className={LIST_TABLE_ACTIONS_INNER}>
                          <ActionIconLink
                            label={t('view')}
                            href={`/stock/items/${row.id}`}
                            className="hover:text-hisabi-primary"
                          >
                            <Eye className="size-5" aria-hidden />
                          </ActionIconLink>
                          {canUpdate ? (
                            <ActionIconButton
                              label={t('adjustStock')}
                              onClick={() =>
                                guardWrite(() => setAdjustTarget(row))
                              }
                              className="hover:text-hisabi-primary"
                            >
                              <PackagePlus className="size-5" aria-hidden />
                            </ActionIconButton>
                          ) : null}
                          {canUpdate ? (
                            <ActionIconLink
                              label={t('edit')}
                              href={`/stock/items/${row.id}/edit`}
                              className="hover:text-hisabi-secondary"
                            >
                              <Pencil className="size-5" aria-hidden />
                            </ActionIconLink>
                          ) : null}
                          {canDelete ? (
                            <ActionIconButton
                              label={t('delete')}
                              onClick={() => setDeleteTarget(row)}
                              className="hover:text-red-600"
                            >
                              <Trash2 className="size-5" aria-hidden />
                            </ActionIconButton>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
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
                    search: filters.search,
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
                    to: start + displayItems.length,
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
                  search: filters.search,
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
                  search: filters.search,
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
                        search: filters.search,
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
                  search: filters.search,
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
                  search: filters.search,
                  limit: pageSize,
                })
              }
            >
              <ChevronsRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <StockAdjustSheet
        open={Boolean(adjustTarget)}
        onOpenChange={(open) => {
          if (!open) setAdjustTarget(null)
        }}
        item={adjustTarget}
        displayName={adjustTarget ? displayName(adjustTarget) : ''}
        onSuccess={() => router.refresh()}
      />

      <HisabiStatusModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        variant="error"
        title={t('deleteTitle')}
        description={
          deleteTarget
            ? t('deleteBody', { name: displayName(deleteTarget) })
            : undefined
        }
        primaryLabel={t('delete')}
        secondaryLabel={t('cancel')}
        primaryPending={deleteMutation.isPending}
        onPrimary={() => {
                  if (deleteTarget) {
                    guardWrite(() => deleteMutation.mutate(deleteTarget.id))
                  }
        }}
        onSecondary={() => setDeleteTarget(null)}
      />
    </div>
  )
}
