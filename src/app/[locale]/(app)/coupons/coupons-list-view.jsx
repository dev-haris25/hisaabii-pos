'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Pencil,
  Plus,
  Power,
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
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { AuthApiError, authDelete, authPatch } from '@/lib/api/auth-client'
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
  listTableActionsTdClass,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { useUrlSyncedSearchInput } from '@/lib/list-views/use-url-synced-search-input'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

/**
 * @param {{
 *   coupons: Array<Record<string, unknown>>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { search: string, active: string, codeType: string, discountKind: string }
 * }} props
 */
export function CouponsListView({ coupons, pagination, filters }) {
  const t = useTranslations('Coupons')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const ability = useAppAbility()
  const canCreate = ability.can('create', 'Coupon')
  const canUpdate = ability.can('update', 'Coupon')
  const canDelete = ability.can('delete', 'Coupon')
  const showActions = true
  const [isPending, startTransition] = useTransition()
  const [deleteTarget, setDeleteTarget] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )

  const { searchInput, setSearchInput, debouncedSearch, lastPushedSearch } =
    useUrlSyncedSearchInput(filters.search)

  function pushFilters(next) {
    const params = new URLSearchParams()
    params.set('page', String(next.page ?? 1))
    params.set('limit', String(next.limit ?? pagination.limit ?? 10))
    if (next.search) params.set('search', next.search)
    if (next.active && next.active !== 'all') params.set('active', next.active)
    if (next.codeType) params.set('codeType', next.codeType)
    if (next.discountKind) params.set('discountKind', next.discountKind)
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
      codeType: filters.codeType,
      discountKind: filters.discountKind,
      limit: pagination.limit,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from debounced search only
  }, [debouncedSearch])

  const toggleMutation = useMutation({
    mutationFn: async (/** @type {Record<string, unknown>} */ row) => {
      return authPatch(`/coupons/${row.id}`, { active: !row.active })
    },
    onSuccess: (_d, row) => {
      toast.success(row.active ? t('deactivated') : t('activated'))
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => authDelete(`/coupons/${id}`),
    onSuccess: () => {
      toast.success(t('deleted'))
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const discountKindLabel = useMemo(
    () => ({
      PERCENTAGE: t('kindPercentage'),
      FIXED_AMOUNT: t('kindFixed'),
      BOGO: t('kindBogo'),
      COMBO: t('kindCombo'),
    }),
    [t],
  )

  const codeTypeLabel = useMemo(
    () => ({
      SHARED: t('codeTypeShared'),
      UNIQUE_BATCH: t('codeTypeUniqueBatch'),
    }),
    [t],
  )

  function displayName(row) {
    return locale === 'ar'
      ? row.nameAr
      : row.nameEn?.trim() || row.nameAr
  }

  function usageLabel(row) {
    if (row.codeType === 'UNIQUE_BATCH') {
      const used =
        typeof row.usageCount === 'number' ? row.usageCount : 0
      const codes =
        typeof row.codeCount === 'number'
          ? row.codeCount
          : typeof row.batchSize === 'number'
            ? row.batchSize
            : 0
      return t('usageBatch', { used, codes })
    }
    const used = typeof row.usedCount === 'number' ? row.usedCount : 0
    if (row.totalUsageLimit == null) {
      return t('usageSharedUnlimited', { used })
    }
    return t('usageShared', {
      used,
      limit: row.totalUsageLimit,
    })
  }

  function codeLabel(row) {
    if (row.codeType === 'UNIQUE_BATCH') {
      const size =
        typeof row.batchSize === 'number'
          ? row.batchSize
          : typeof row.codeCount === 'number'
            ? row.codeCount
            : 0
      return t('batchOf', { size })
    }
    if (typeof row.code === 'string' && row.code.length > 0) return row.code
    return '—'
  }

  const emptyMessage =
    filters.search ||
    filters.active !== 'all' ||
    filters.codeType ||
    filters.discountKind
      ? t('emptyFiltered')
      : t('empty')

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
                    codeType: filters.codeType,
                    discountKind: filters.discountKind,
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
          {canCreate ? (
            <Link
              href="/coupons/new"
              className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
            >
              <Plus className="size-5 shrink-0" aria-hidden />
              {t('addCoupon')}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('loadingList')
              : t('showingCount', { shown: coupons.length, total })
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchPlaceholder')}
        >
          <select
            aria-label={t('filterCodeType')}
            value={filters.codeType}
            disabled={listBusy}
            onChange={(e) =>
              pushFilters({
                page: 1,
                search: filters.search,
                active: filters.active,
                codeType: e.target.value,
                discountKind: filters.discountKind,
                limit: pageSize,
              })
            }
            className={listTableToolbarSelectClass()}
          >
            <option value="">{t('filterCodeTypeAll')}</option>
            <option value="SHARED">{t('codeTypeShared')}</option>
            <option value="UNIQUE_BATCH">{t('codeTypeUniqueBatch')}</option>
          </select>
          <select
            aria-label={t('filterDiscountKind')}
            value={filters.discountKind}
            disabled={listBusy}
            onChange={(e) =>
              pushFilters({
                page: 1,
                search: filters.search,
                active: filters.active,
                codeType: filters.codeType,
                discountKind: e.target.value,
                limit: pageSize,
              })
            }
            className={listTableToolbarSelectClass()}
          >
            <option value="">{t('filterDiscountKindAll')}</option>
            <option value="PERCENTAGE">{t('kindPercentage')}</option>
            <option value="FIXED_AMOUNT">{t('kindFixed')}</option>
            <option value="BOGO">{t('kindBogo')}</option>
            <option value="COMBO">{t('kindCombo')}</option>
          </select>
        </ListTableToolbar>

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[860px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colName')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colCode')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colDiscountKind')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colCodeType')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colUsage')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colStatus')}
                </th>
                {showActions ? (
                  <th scope="col" className={listTableThClass()}>
                    {t('colActions')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {coupons.length === 0 ? (
                <tr>
                  <td
                    colSpan={6 + (showActions ? 1 : 0)}
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                coupons.map((row) => {
                  const name = displayName(row)
                  return (
                    <tr key={row.id} className={LIST_TABLE_ROW}>
                      <td className={listTableTdClass(undefined, true)}>
                        <Link
                          href={`/coupons/${row.id}`}
                          className="type-body-md text-start font-bold text-hisabi-on-surface hover:text-hisabi-primary hover:underline"
                        >
                          {name}
                        </Link>
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface',
                        )}
                      >
                        <span dir="ltr" className="inline-block">
                          {codeLabel(row)}
                        </span>
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface',
                        )}
                      >
                        {discountKindLabel[row.discountKind] ??
                          String(row.discountKind ?? '—')}
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface',
                        )}
                      >
                        {codeTypeLabel[row.codeType] ??
                          String(row.codeType ?? '—')}
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface tabular-nums',
                        )}
                      >
                        <span dir="ltr" className="inline-block">
                          {usageLabel(row)}
                        </span>
                      </td>
                      <td className={listTableTdClass()}>
                        <span
                          className={cn(
                            'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                            row.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {row.active
                            ? t('statusActive')
                            : t('statusInactive')}
                        </span>
                      </td>
                      {showActions ? (
                        <td className={listTableActionsTdClass()}>
                          <div className={LIST_TABLE_ACTIONS_INNER}>
                            <ActionIconLink
                              label={t('view')}
                              href={`/coupons/${row.id}`}
                              className="hover:text-hisabi-primary"
                            >
                              <Eye className="size-5" aria-hidden />
                            </ActionIconLink>
                            {canUpdate ? (
                              <ActionIconLink
                                label={t('edit')}
                                href={`/coupons/${row.id}/edit`}
                                className="hover:text-hisabi-secondary"
                              >
                                <Pencil className="size-5" aria-hidden />
                              </ActionIconLink>
                            ) : null}
                            {canUpdate ? (
                              <ActionIconButton
                                label={
                                  row.active
                                    ? t('deactivate')
                                    : t('activate')
                                }
                                disabled={toggleMutation.isPending}
                                onClick={() => toggleMutation.mutate(row)}
                                className={
                                  row.active
                                    ? 'hover:text-hisabi-error'
                                    : 'hover:text-hisabi-primary'
                                }
                              >
                                <Power className="size-5" aria-hidden />
                              </ActionIconButton>
                            ) : null}
                            {canDelete ? (
                              <ActionIconButton
                                label={t('delete')}
                                disabled={deleteMutation.isPending}
                                onClick={() => setDeleteTarget(row)}
                                className="hover:text-hisabi-error"
                              >
                                <Trash2 className="size-5" aria-hidden />
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
                    codeType: filters.codeType,
                    discountKind: filters.discountKind,
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
                    to: start + coupons.length,
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
                  codeType: filters.codeType,
                  discountKind: filters.discountKind,
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
                  codeType: filters.codeType,
                  discountKind: filters.discountKind,
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
                        codeType: filters.codeType,
                        discountKind: filters.discountKind,
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
                  codeType: filters.codeType,
                  discountKind: filters.discountKind,
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
                  codeType: filters.codeType,
                  discountKind: filters.discountKind,
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
          if (deleteTarget) deleteMutation.mutate(String(deleteTarget.id))
        }}
      />
    </div>
  )
}
