'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FolderTree,
  Pencil,
  Plus,
  Power,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { ListBulkActionsBar } from '@/components/list-views/list-bulk-actions-bar'
import { ListRowSelectionCheckbox } from '@/components/list-views/list-row-selection-checkbox'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import {
  ActionIconButton,
  ActionIconLink,
} from '@/components/row-actions/action-icon-button'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { AuthApiError, authDelete, authPatch } from '@/lib/api/auth-client'
import { isInternetRequiredError } from '@/lib/desktop/assert-cloud-write-allowed'
import {
  authGetMenuCategoriesPreferOffline,
  authGetMenuItemsPreferOffline,
} from '@/lib/desktop/local-pos-api'
import { useIsHisabiDesktop } from '@/hooks/use-is-hisabi-desktop'
import { useRequireCloudForWrite } from '@/hooks/use-require-cloud-for-write'
import { bulkDeleteRows } from '@/lib/list-views/bulk-delete-rows'
import { buildPaginationItems } from '@/lib/list-views/build-pagination-items'
import {
  LIST_PAGE_HEADER_ACTIONS,
  listTableToolbarSelectClass,
} from '@/lib/list-views/list-page-toolbar-styles'
import {
  LIST_TABLE_ACTIONS_INNER,
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  LIST_TABLE_TD_CHECKBOX,
  LIST_TABLE_TH_CHECKBOX,
  listTableActionsTdClass,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { useListRowSelection } from '@/lib/list-views/use-list-row-selection'
import { useUrlSyncedSearchInput } from '@/lib/list-views/use-url-synced-search-input'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

/**
 * @param {{
 *   items: Array<Record<string, unknown>>
 *   categories: Array<Record<string, unknown>>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { search: string, active: string, categoryId: string }
 * }} props
 */
export function MenuListView({ items, categories, pagination, filters }) {
  const t = useTranslations('Menu')
  const tList = useTranslations('ListViews')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const ability = useAppAbility()
  const { canWrite, guardWrite, cloudOnline } = useRequireCloudForWrite()
  const desktop = useIsHisabiDesktop()
  const desktopOffline = desktop && !cloudOnline
  const canCreateItem = ability.can('create', 'MenuItem')
  const canUpdateItem = ability.can('update', 'MenuItem')
  const canDeleteItem = ability.can('delete', 'MenuItem')
  const showItemActions = true
  const [isPending, startTransition] = useTransition()
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)

  const { searchInput, setSearchInput, debouncedSearch, lastPushedSearch } =
    useUrlSyncedSearchInput(filters.search)

  const [offlineFilterOverride, setOfflineFilterOverride] = useState(
    /** @type {null | { search: string, active: string, categoryId: string, page: number, limit: number }} */ (
      null
    ),
  )

  const effectiveFilters = desktopOffline && offlineFilterOverride
    ? {
        search: offlineFilterOverride.search,
        active: offlineFilterOverride.active,
        categoryId: offlineFilterOverride.categoryId,
      }
    : filters
  const effectivePage =
    desktopOffline && offlineFilterOverride
      ? offlineFilterOverride.page
      : pagination.page
  const effectiveLimit =
    desktopOffline && offlineFilterOverride
      ? offlineFilterOverride.limit
      : pagination.limit

  const offlineListQuery = useQuery({
    queryKey: [
      'menu',
      'items',
      'offline',
      effectiveFilters.search,
      effectiveFilters.active,
      effectiveFilters.categoryId,
      effectivePage,
      effectiveLimit,
    ],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(effectivePage ?? 1))
      params.set('limit', String(effectiveLimit ?? 10))
      if (effectiveFilters.search) params.set('search', effectiveFilters.search)
      if (effectiveFilters.active && effectiveFilters.active !== 'all') {
        params.set('active', effectiveFilters.active)
      }
      if (effectiveFilters.categoryId) {
        params.set('categoryId', effectiveFilters.categoryId)
      }
      return authGetMenuItemsPreferOffline(`/menu/items?${params.toString()}`)
    },
    enabled: desktopOffline,
  })

  const offlineCategoriesQuery = useQuery({
    queryKey: ['menu', 'categories', 'offline'],
    queryFn: () => authGetMenuCategoriesPreferOffline(),
    enabled: desktopOffline,
  })

  const displayItems = desktopOffline
    ? /** @type {Array<Record<string, unknown>>} */ (
        offlineListQuery.data?.items ?? items
      )
    : items
  const displayCategories = desktopOffline
    ? /** @type {Array<Record<string, unknown>>} */ (
        offlineCategoriesQuery.data?.categories ?? categories
      )
    : categories
  const displayPagination = desktopOffline
    ? offlineListQuery.data?.pagination ?? pagination
    : pagination

  const selectableRows = useMemo(
    () => displayItems.filter((item) => item.active === true),
    [displayItems],
  )
  const {
    selectedIds,
    selectedCount,
    allPageSelected,
    somePageSelected,
    toggleRow,
    toggleAllOnPage,
    clearSelection,
    isSelected,
  } = useListRowSelection(selectableRows)

  useEffect(() => {
    clearSelection()
  }, [
    filters.search,
    filters.active,
    filters.categoryId,
    displayPagination.page,
    displayPagination.limit,
    clearSelection,
  ])

  function pushFilters(next) {
    if (desktopOffline) {
      setOfflineFilterOverride({
        search: next.search ?? '',
        active: next.active ?? 'all',
        categoryId: next.categoryId ?? '',
        page: next.page ?? 1,
        limit: next.limit ?? effectiveLimit ?? 10,
      })
      return
    }
    const params = new URLSearchParams()
    params.set('page', String(next.page ?? 1))
    params.set('limit', String(next.limit ?? pagination.limit ?? 10))
    if (next.search) params.set('search', next.search)
    if (next.active && next.active !== 'all') params.set('active', next.active)
    if (next.categoryId) params.set('categoryId', next.categoryId)
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
      active: filters.active,
      categoryId: filters.categoryId,
      limit: displayPagination.limit,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from debounced search only
  }, [debouncedSearch])

  const toggleMutation = useMutation({
    mutationFn: async (/** @type {{ id: string, active: boolean }} */ item) => {
      if (item.active) return authDelete(`/menu/items/${item.id}`)
      return authPatch(`/menu/items/${item.id}`, { active: true })
    },
    onSuccess: (_d, item) => {
      toast.success(item.active ? t('deactivated') : t('activated'))
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
      router.refresh()
    },
    onError: (err) => {
      if (isInternetRequiredError(err)) return
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const vatLabel = useMemo(
    () => ({
      standard: t('vatStandard'),
      zero: t('vatZero'),
      exempt: t('vatExempt'),
    }),
    [t],
  )

  const emptyMessage =
    filters.search || filters.active !== 'all' || filters.categoryId
      ? t('emptyFiltered')
      : t('empty')

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

  async function handleBulkDelete() {
    setBulkDeletePending(true)
    try {
      const { deleted, failed } = await bulkDeleteRows(
        [...selectedIds],
        (id) => `/menu/items/${id}`,
      )
      await queryClient.invalidateQueries({ queryKey: ['menu'] })
      setBulkDeleteModalOpen(false)
      clearSelection()
      if (deleted.length > 0 && failed.length === 0) {
        toast.success(tList('bulkDeleteSuccess', { count: deleted.length }))
      } else if (deleted.length > 0) {
        toast.warning(
          tList('bulkDeletePartial', {
            deleted: deleted.length,
            failed: failed.length,
          }),
        )
      } else if (failed.length > 0) {
        toast.error(
          tList('bulkDeletePartial', {
            deleted: 0,
            failed: failed.length,
          }),
        )
      }
      router.refresh()
    } finally {
      setBulkDeletePending(false)
    }
  }

  return (
    <div className={cn('mx-auto max-w-hisabi-container', listBusy && 'opacity-70')}>
      <div className="mb-hisabi-xl flex flex-col gap-hisabi-lg min-[1251px]:flex-row min-[1251px]:items-end min-[1251px]:justify-between">
        <div className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('title')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('subtitle')}
          </p>
        </div>
        <div className={LIST_PAGE_HEADER_ACTIONS}>
          <div className="flex w-full rounded-lg border border-hisabi-outline-variant/60 bg-white p-1 sm:w-auto">
            {(
              /** @type {const} */ ([
                ['all', 'filterAll'],
                ['true', 'filterActiveOnly'],
                ['false', 'filterInactiveOnly'],
              ])
            ).map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  pushFilters({
                    page: 1,
                    search: filters.search,
                    active: key,
                    categoryId: filters.categoryId,
                    limit: pageSize,
                  })
                }
                disabled={listBusy}
                className={cn(
                  'type-label-sm flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2 text-center font-bold transition-colors sm:flex-none sm:px-hisabi-md',
                  filters.active === key
                    ? 'bg-hisabi-primary-container text-white'
                    : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                  listBusy && 'opacity-60',
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <Link
            href="/menu/categories"
            className="type-label-md text-hisabi-on-surface-variant inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-lg py-2.5 font-bold transition-all hover:border-hisabi-outline-variant hover:text-hisabi-primary active:scale-[0.98]"
          >
            <FolderTree className="size-5 shrink-0" aria-hidden />
            {t('manageCategories')}
          </Link>
          {canCreateItem ? (
            <Link
              href="/menu/items/new"
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
        >
          <select
            aria-label={t('filterCategory')}
            value={filters.categoryId}
            disabled={listBusy}
            onChange={(e) =>
              pushFilters({
                page: 1,
                search: filters.search,
                active: filters.active,
                categoryId: e.target.value,
                limit: pageSize,
              })
            }
            className={listTableToolbarSelectClass()}
          >
            <option value="">{t('filterCategoryAll')}</option>
            {displayCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === 'ar' ? c.nameAr : c.nameEn?.trim() || c.nameAr}
              </option>
            ))}
          </select>
        </ListTableToolbar>

        {canDeleteItem ? (
          <ListBulkActionsBar
            selectedCount={selectedCount}
            onDelete={() => setBulkDeleteModalOpen(true)}
            onClear={clearSelection}
            deletePending={bulkDeletePending}
          />
        ) : null}

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[720px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                {canDeleteItem ? (
                  <th scope="col" className={LIST_TABLE_TH_CHECKBOX}>
                    <ListRowSelectionCheckbox
                      checked={allPageSelected}
                      indeterminate={somePageSelected && !allPageSelected}
                      onChange={toggleAllOnPage}
                      ariaLabel={tList('selectAllOnPage')}
                      disabled={listBusy || selectableRows.length === 0}
                    />
                  </th>
                ) : null}
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colName')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colCategory')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colPrice')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colVat')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colSortOrder')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colStatus')}
                </th>
                {showItemActions ? (
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
                    colSpan={
                      6 + (canDeleteItem ? 1 : 0) + (showItemActions ? 1 : 0)
                    }
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                displayItems.map((item) => {
                  const name =
                    locale === 'ar'
                      ? item.nameAr
                      : item.nameEn?.trim() || item.nameAr
                  const catName = item.category
                    ? locale === 'ar'
                      ? item.category.nameAr
                      : item.category.nameEn?.trim() || item.category.nameAr
                    : '—'
                  const rowSelectable = item.active === true
                  return (
                    <tr key={item.id} className={LIST_TABLE_ROW}>
                      {canDeleteItem ? (
                        <td className={LIST_TABLE_TD_CHECKBOX}>
                          <ListRowSelectionCheckbox
                            checked={isSelected(item.id)}
                            onChange={() => toggleRow(item.id)}
                            ariaLabel={tList('selectRow')}
                            disabled={listBusy || !rowSelectable}
                          />
                        </td>
                      ) : null}
                      <td className={listTableTdClass(undefined, true)}>
                        <div className="flex items-center gap-hisabi-md">
                          <div className="bg-hisabi-surface-container-high text-hisabi-primary relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-bold">
                            {typeof item.imageUrl === 'string' &&
                            item.imageUrl.length > 0 ? (
                              // eslint-disable-next-line @next/next/no-img-element -- authenticated menu item image
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="absolute inset-0 size-full object-cover"
                              />
                            ) : (
                              name.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <Link
                            href={`/menu/items/${item.id}`}
                            className="type-body-md text-start font-bold text-hisabi-on-surface hover:text-hisabi-primary hover:underline"
                          >
                            {name}
                          </Link>
                        </div>
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface',
                        )}
                      >
                        {catName}
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface font-medium',
                        )}
                      >
                        <span dir="ltr" className="inline-block">
                          {item.price}
                        </span>
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface',
                        )}
                      >
                        {vatLabel[item.vatPreset] ?? item.vatPreset}
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface tabular-nums',
                        )}
                      >
                        <span dir="ltr" className="inline-block">
                          {typeof item.sortOrder === 'number'
                            ? item.sortOrder
                            : 0}
                        </span>
                      </td>
                      <td className={listTableTdClass()}>
                        <span
                          className={cn(
                            'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                            item.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {item.active ? t('statusActive') : t('statusInactive')}
                        </span>
                      </td>
                      {showItemActions ? (
                        <td className={listTableActionsTdClass()}>
                          <div className={LIST_TABLE_ACTIONS_INNER}>
                            <ActionIconLink
                              label={t('view')}
                              href={`/menu/items/${item.id}`}
                              className="hover:text-hisabi-primary"
                            >
                              <Eye className="size-5" aria-hidden />
                            </ActionIconLink>
                            {canUpdateItem ? (
                              <ActionIconLink
                                label={t('edit')}
                                href={`/menu/items/${item.id}/edit`}
                                className="hover:text-hisabi-secondary"
                              >
                                <Pencil className="size-5" aria-hidden />
                              </ActionIconLink>
                            ) : null}
                            {canUpdateItem ? (
                              <ActionIconButton
                                label={item.active ? t('deactivate') : t('activate')}
                              disabled={toggleMutation.isPending || !canWrite}
                              onClick={() =>
                                guardWrite(() => toggleMutation.mutate(item))
                              }
                                className={
                                  item.active
                                    ? 'hover:text-hisabi-error'
                                    : 'hover:text-hisabi-primary'
                                }
                              >
                                <Power className="size-5" aria-hidden />
                              </ActionIconButton>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="text-hisabi-on-surface-variant flex flex-col gap-hisabi-md border-t border-hisabi-outline-variant/20 bg-slate-50/50 p-hisabi-md text-xs font-medium sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-hisabi-lg">
            <div className="flex items-center gap-2">
              <span>{t('rowsPerPage')}</span>
              <select
                className="type-label-sm cursor-pointer border-none bg-transparent py-0 ps-1 pe-6 font-bold text-hisabi-on-surface focus:ring-0"
                aria-label={t('rowsPerPageAria')}
                value={pageSize}
                disabled={listBusy}
                onChange={(e) =>
                  pushFilters({
                    page: 1,
                    search: filters.search,
                    active: filters.active,
                    categoryId: filters.categoryId,
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
                  active: filters.active,
                  categoryId: filters.categoryId,
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
                  active: filters.active,
                  categoryId: filters.categoryId,
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
                        active: filters.active,
                        categoryId: filters.categoryId,
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
                  active: filters.active,
                  categoryId: filters.categoryId,
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
                  active: filters.active,
                  categoryId: filters.categoryId,
                  limit: pageSize,
                })
              }
            >
              <ChevronsRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <HisabiStatusModal
        open={bulkDeleteModalOpen && selectedCount > 0}
        onOpenChange={setBulkDeleteModalOpen}
        variant="error"
        title={tList('bulkDeleteConfirmTitle')}
        description={tList('bulkDeleteConfirmDescription', {
          count: selectedCount,
        })}
        primaryLabel={tList('bulkDeleteConfirmDelete')}
        primaryPending={bulkDeletePending}
        onPrimary={() => {
          void handleBulkDelete()
        }}
        secondaryLabel={tList('bulkDeleteConfirmCancel')}
      />
    </div>
  )
}
