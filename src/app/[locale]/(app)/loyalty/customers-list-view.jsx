'use client'

import { useMutation } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Merge,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { EditLoyaltyCustomerSheet } from './edit-loyalty-customer-sheet'
import { MergeLoyaltyCustomersSheet } from './merge-loyalty-customers-sheet'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { useAppAbility } from '@/components/rbac/ability-provider'
import {
  ActionIconButton,
  ActionIconLink,
} from '@/components/row-actions/action-icon-button'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { AuthApiError, authDelete, authPost } from '@/lib/api/auth-client'
import { buildPaginationItems } from '@/lib/list-views/build-pagination-items'
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
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

/**
 * @param {string | null | undefined} iso
 * @param {string} locale
 */
function formatDate(iso, locale) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/**
 * @param {{
 *   customers: Array<Record<string, unknown>>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { search: string }
 * }} props
 */
export function CustomersListView({ customers, pagination, filters }) {
  const t = useTranslations('Loyalty')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const ability = useAppAbility()
  const canUpdate =
    hasFullAccess(ability) || ability.can('update', 'Loyalty')
  const canDelete =
    hasFullAccess(ability) || ability.can('delete', 'Loyalty')
  const [isPending, startTransition] = useTransition()

  const [editTarget, setEditTarget] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [resetTarget, setResetTarget] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [deleteTarget, setDeleteTarget] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [mergeTarget, setMergeTarget] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )

  const { searchInput, setSearchInput, debouncedSearch, lastPushedSearch } =
    useUrlSyncedSearchInput(filters.search)

  function pushFilters(next) {
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
      limit: pagination.limit,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from debounced search only
  }, [debouncedSearch])

  const resetMutation = useMutation({
    mutationFn: (/** @type {string} */ id) =>
      authPost(`/loyalty/customers/${id}/reset-points`, {}),
    onSuccess: () => {
      toast.success(t('resetSuccess'))
      setResetTarget(null)
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) =>
      authDelete(`/loyalty/customers/${id}`),
    onSuccess: () => {
      toast.success(t('deleteSuccess'))
      setDeleteTarget(null)
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const emptyMessage = filters.search
    ? t('customersEmptyFiltered')
    : t('customersEmpty')

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
      <div className="mb-hisabi-xl space-y-1">
        <h1 className="type-headline-xl text-hisabi-on-surface">
          {t('customersTitle')}
        </h1>
        <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
          {t('customersSubtitle')}
        </p>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('customersLoadingList')
              : t('customersShowingCount', {
                  shown: customers.length,
                  total,
                })
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('customersSearchPlaceholder')}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[820px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colPhone')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colBalance')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colCreatedAt')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colActions')}
                </th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                customers.map((row) => (
                  <tr key={String(row.id)} className={LIST_TABLE_ROW}>
                    <td className={listTableTdClass(undefined, true)}>
                      <Link
                        href={`/loyalty/customers/${row.id}`}
                        className="type-body-md text-start font-bold text-hisabi-on-surface hover:text-hisabi-primary hover:underline"
                        dir="ltr"
                      >
                        {String(row.phone ?? '—')}
                      </Link>
                    </td>
                    <td
                      className={listTableTdClass(
                        'type-body-sm text-hisabi-on-surface tabular-nums',
                      )}
                    >
                      <span dir="ltr" className="inline-block">
                        {String(row.balance ?? '0')}
                      </span>
                    </td>
                    <td
                      className={listTableTdClass(
                        'type-body-sm text-hisabi-on-surface-variant',
                      )}
                    >
                      {formatDate(
                        typeof row.createdAt === 'string'
                          ? row.createdAt
                          : null,
                        locale,
                      )}
                    </td>
                    <td className={listTableActionsTdClass()}>
                      <div className={LIST_TABLE_ACTIONS_INNER}>
                        <ActionIconLink
                          label={t('view')}
                          href={`/loyalty/customers/${row.id}`}
                          className="hover:text-hisabi-primary"
                        >
                          <Eye className="size-5" aria-hidden />
                        </ActionIconLink>
                        {canUpdate ? (
                          <ActionIconButton
                            label={t('edit')}
                            onClick={() => setEditTarget(row)}
                            className="hover:text-hisabi-secondary"
                          >
                            <Pencil className="size-5" aria-hidden />
                          </ActionIconButton>
                        ) : null}
                        {canUpdate ? (
                          <ActionIconButton
                            label={t('resetPoints')}
                            disabled={resetMutation.isPending}
                            onClick={() => setResetTarget(row)}
                            className="hover:text-hisabi-secondary"
                          >
                            <RotateCcw className="size-5" aria-hidden />
                          </ActionIconButton>
                        ) : null}
                        {canDelete ? (
                          <ActionIconButton
                            label={t('merge')}
                            onClick={() => setMergeTarget(row)}
                            className="hover:text-hisabi-primary"
                          >
                            <Merge className="size-5" aria-hidden />
                          </ActionIconButton>
                        ) : null}
                        {canDelete ? (
                          <ActionIconButton
                            label={t('deleteAccount')}
                            disabled={deleteMutation.isPending}
                            onClick={() => setDeleteTarget(row)}
                            className="hover:text-hisabi-error"
                          >
                            <Trash2 className="size-5" aria-hidden />
                          </ActionIconButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
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
                    to: Math.min(start + pageSize, total),
                    total,
                  })}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button
              type="button"
              disabled={listBusy || safePage <= 1}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-hisabi-on-surface-variant hover:bg-hisabi-surface-container disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('pageFirst')}
              onClick={() =>
                pushFilters({
                  page: 1,
                  search: filters.search,
                  limit: pageSize,
                })
              }
            >
              <ChevronsLeft className="size-4 rtl:rotate-180" aria-hidden />
            </button>
            <button
              type="button"
              disabled={listBusy || safePage <= 1}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-hisabi-on-surface-variant hover:bg-hisabi-surface-container disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('pagePrev')}
              onClick={() =>
                pushFilters({
                  page: Math.max(1, safePage - 1),
                  search: filters.search,
                  limit: pageSize,
                })
              }
            >
              <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            </button>
            {paginationItems.map((item, idx) =>
              item === 'ellipsis' ? (
                <span
                  key={`e-${idx}`}
                  className="type-label-sm px-1 text-hisabi-on-surface-variant"
                >
                  …
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
                    'type-label-sm inline-flex size-8 cursor-pointer items-center justify-center rounded-lg font-bold',
                    item === safePage
                      ? 'bg-hisabi-primary-container text-white'
                      : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                  )}
                >
                  {item}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={listBusy || safePage >= totalPages}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-hisabi-on-surface-variant hover:bg-hisabi-surface-container disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('pageNext')}
              onClick={() =>
                pushFilters({
                  page: Math.min(totalPages, safePage + 1),
                  search: filters.search,
                  limit: pageSize,
                })
              }
            >
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
            </button>
            <button
              type="button"
              disabled={listBusy || safePage >= totalPages}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-hisabi-on-surface-variant hover:bg-hisabi-surface-container disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('pageLast')}
              onClick={() =>
                pushFilters({
                  page: totalPages,
                  search: filters.search,
                  limit: pageSize,
                })
              }
            >
              <ChevronsRight className="size-4 rtl:rotate-180" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <EditLoyaltyCustomerSheet
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        customer={
          editTarget
            ? {
                id: String(editTarget.id),
                phone: String(editTarget.phone ?? ''),
                balance: String(editTarget.balance ?? '0'),
              }
            : null
        }
        onSuccess={() => {
          router.refresh()
        }}
      />

      <MergeLoyaltyCustomersSheet
        open={Boolean(mergeTarget)}
        onOpenChange={(open) => {
          if (!open) setMergeTarget(null)
        }}
        sourceCustomer={
          mergeTarget
            ? {
                id: String(mergeTarget.id),
                phone: String(mergeTarget.phone ?? ''),
                balance: String(mergeTarget.balance ?? '0'),
              }
            : null
        }
        onSuccess={() => {
          router.refresh()
        }}
      />

      <HisabiStatusModal
        open={Boolean(resetTarget)}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
        variant="warning"
        title={t('resetConfirmTitle')}
        description={
          resetTarget
            ? t('resetConfirmBody', {
                phone: String(resetTarget.phone ?? ''),
              })
            : undefined
        }
        primaryLabel={t('resetConfirm')}
        secondaryLabel={t('cancel')}
        primaryPending={resetMutation.isPending}
        onPrimary={() => {
          if (resetTarget) resetMutation.mutate(String(resetTarget.id))
        }}
      />

      <HisabiStatusModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        variant="error"
        title={t('deleteConfirmTitle')}
        description={
          deleteTarget
            ? t('deleteConfirmBody', {
                phone: String(deleteTarget.phone ?? ''),
              })
            : undefined
        }
        primaryLabel={t('deleteConfirm')}
        secondaryLabel={t('cancel')}
        primaryPending={deleteMutation.isPending}
        onPrimary={() => {
          if (deleteTarget) deleteMutation.mutate(String(deleteTarget.id))
        }}
      />
    </div>
  )
}
