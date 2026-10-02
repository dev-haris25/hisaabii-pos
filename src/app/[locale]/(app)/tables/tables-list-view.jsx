'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { AddTableSheet } from './add-table-sheet'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { useAppAbility } from '@/components/rbac/ability-provider'
import {
  ActionIconButton,
  ActionIconLink,
} from '@/components/row-actions/action-icon-button'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  AuthApiError,
  authDelete,
  authGetBlob,
  authPost,
} from '@/lib/api/auth-client'
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
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

/**
 * @param {{
 *   tables: Array<Record<string, unknown>>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { search: string, status: string }
 * }} props
 */
export function TablesListView({ tables, pagination, filters }) {
  const t = useTranslations('Tables')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const ability = useAppAbility()
  const canCreate = ability.can('create', 'ETable')
  const canUpdate = ability.can('update', 'ETable')
  const canDelete = ability.can('delete', 'ETable')
  const showActions = canUpdate || canDelete || ability.can('read', 'ETable')
  const [isPending, startTransition] = useTransition()

  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [regenerateTarget, setRegenerateTarget] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [qrPreview, setQrPreview] = useState(
    /** @type {{ row: Record<string, unknown>, objectUrl: string } | null} */ (
      null
    ),
  )
  const [qrLoadingId, setQrLoadingId] = useState(
    /** @type {string | null} */ (null),
  )

  const { searchInput, setSearchInput, debouncedSearch, lastPushedSearch } =
    useUrlSyncedSearchInput(filters.search)

  function pushFilters(next) {
    const params = new URLSearchParams()
    params.set('page', String(next.page ?? 1))
    params.set('limit', String(next.limit ?? pagination.limit ?? 10))
    if (next.search) params.set('search', next.search)
    if (next.status && next.status !== 'all') params.set('status', next.status)
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
      status: filters.status,
      limit: pagination.limit,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from debounced search only
  }, [debouncedSearch])

  useEffect(() => {
    return () => {
      if (qrPreview?.objectUrl) URL.revokeObjectURL(qrPreview.objectUrl)
    }
  }, [qrPreview?.objectUrl])

  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => authDelete(`/tables/${id}`),
    onSuccess: () => {
      toast.success(t('deleted'))
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables-active-exists'] })
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const regenerateMutation = useMutation({
    mutationFn: (/** @type {string} */ id) =>
      authPost(`/tables/${id}/regenerate-qr`, {}),
    onSuccess: () => {
      toast.success(t('regenerated'))
      setRegenerateTarget(null)
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  /**
   * @param {Record<string, unknown>} row
   * @param {'preview' | 'download'} mode
   */
  async function handleQrAction(row, mode) {
    const id = String(row.id ?? '')
    if (!id) return
    setQrLoadingId(id)
    try {
      const { blob, filename } = await authGetBlob(`/tables/${id}/qr`)
      if (mode === 'download') {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || `table-qr.png`
        a.click()
        URL.revokeObjectURL(url)
        toast.success(t('qrDownloaded'))
      } else {
        if (qrPreview?.objectUrl) URL.revokeObjectURL(qrPreview.objectUrl)
        setQrPreview({ row, objectUrl: URL.createObjectURL(blob) })
      }
    } catch (err) {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    } finally {
      setQrLoadingId(null)
    }
  }

  const emptyMessage =
    filters.search || filters.status !== 'all'
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
  const colSpan = 2 + (showActions ? 1 : 0)

  return (
    <div
      className={cn('mx-auto max-w-hisabi-container', listBusy && 'opacity-70')}
    >
      <div className="mb-hisabi-xl flex flex-col gap-hisabi-lg min-[1251px]:flex-row min-[1251px]:items-end min-[1251px]:justify-between">
        <div className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">
            {t('title')}
          </h1>
          <p className="type-body-md max-w-lg text-hisabi-on-surface-variant">
            {t('subtitle')}
          </p>
        </div>
        <div className={LIST_PAGE_HEADER_ACTIONS}>
          <div className="flex w-full rounded-lg border border-hisabi-outline-variant/60 bg-white p-1 sm:w-auto">
            {(
              /** @type {const} */ ([
                ['all', 'filterAll'],
                ['available', 'statusAvailable'],
                ['occupied', 'statusOccupied'],
              ])
            ).map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  pushFilters({
                    page: 1,
                    search: filters.search,
                    status: key,
                    limit: pageSize,
                  })
                }
                disabled={listBusy}
                className={cn(
                  'type-label-sm flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2 text-center font-bold transition-colors sm:flex-none sm:px-hisabi-md',
                  filters.status === key
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
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={listBusy}
              className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
            >
              <Plus className="size-5 shrink-0" aria-hidden />
              {t('addTable')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('loadingList')
              : t('showingCount', { shown: tables.length, total })
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchPlaceholder')}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colName')}
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
              {tables.length === 0 ? (
                <tr>
                  <td
                    colSpan={colSpan}
                    className="type-body-md px-hisabi-lg py-12 text-center text-hisabi-on-surface-variant"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                tables.map((row) => {
                  const id = String(row.id)
                  const status = String(row.status ?? 'available')
                  return (
                    <tr key={id} className={LIST_TABLE_ROW}>
                      <td className={listTableTdClass(undefined, true)}>
                        <span className="type-label-lg text-hisabi-on-surface">
                          {String(row.name ?? '')}
                        </span>
                      </td>
                      <td className={listTableTdClass()}>
                        <span
                          className={cn(
                            'type-label-sm inline-flex rounded-full px-hisabi-sm py-0.5 font-medium',
                            status === 'occupied'
                              ? 'bg-hisabi-error/10 text-hisabi-error'
                              : 'bg-hisabi-teal-container/30 text-hisabi-teal',
                          )}
                        >
                          {status === 'occupied'
                            ? t('statusOccupied')
                            : t('statusAvailable')}
                        </span>
                      </td>
                      {showActions ? (
                        <td className={listTableActionsTdClass()}>
                          <div className={LIST_TABLE_ACTIONS_INNER}>
                            <ActionIconButton
                              label={t('viewQr')}
                              disabled={qrLoadingId === id || listBusy}
                              onClick={() =>
                                void handleQrAction(row, 'preview')
                              }
                              className="hover:text-hisabi-primary"
                            >
                              <QrCode className="size-5" aria-hidden />
                            </ActionIconButton>
                            <ActionIconButton
                              label={t('downloadQr')}
                              disabled={qrLoadingId === id || listBusy}
                              onClick={() =>
                                void handleQrAction(row, 'download')
                              }
                              className="hover:text-hisabi-primary"
                            >
                              <Download className="size-5" aria-hidden />
                            </ActionIconButton>
                            {canUpdate ? (
                              <ActionIconButton
                                label={t('regenerateQr')}
                                disabled={
                                  regenerateMutation.isPending || listBusy
                                }
                                onClick={() => setRegenerateTarget(row)}
                                className="hover:text-hisabi-secondary"
                              >
                                <RefreshCw className="size-5" aria-hidden />
                              </ActionIconButton>
                            ) : null}
                            {canUpdate ? (
                              <ActionIconLink
                                label={t('edit')}
                                href={`/tables/${id}/edit`}
                                className="hover:text-hisabi-secondary"
                              >
                                <Pencil className="size-5" aria-hidden />
                              </ActionIconLink>
                            ) : null}
                            {canDelete ? (
                              <ActionIconButton
                                label={t('delete')}
                                disabled={
                                  deleteMutation.isPending || listBusy
                                }
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
                    search: filters.search,
                    status: filters.status,
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
                    to: start + tables.length,
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
                  status: filters.status,
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
                  status: filters.status,
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
                        status: filters.status,
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
                  status: filters.status,
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
                  status: filters.status,
                  limit: pageSize,
                })
              }
            >
              <ChevronsRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <AddTableSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => router.refresh()}
      />

      <HisabiStatusModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        variant="error"
        title={t('deleteTitle')}
        description={t('deleteBody', {
          name: String(deleteTarget?.name ?? ''),
        })}
        primaryLabel={t('delete')}
        primaryPending={deleteMutation.isPending}
        onPrimary={() => {
          if (deleteTarget?.id) deleteMutation.mutate(String(deleteTarget.id))
        }}
        secondaryLabel={t('cancel')}
        onSecondary={() => setDeleteTarget(null)}
      />

      <HisabiStatusModal
        open={Boolean(regenerateTarget)}
        onOpenChange={(open) => {
          if (!open) setRegenerateTarget(null)
        }}
        variant="warning"
        title={t('regenerateTitle')}
        description={t('regenerateBody', {
          name: String(regenerateTarget?.name ?? ''),
        })}
        primaryLabel={t('regenerateConfirm')}
        primaryPending={regenerateMutation.isPending}
        onPrimary={() => {
          if (regenerateTarget?.id) {
            regenerateMutation.mutate(String(regenerateTarget.id))
          }
        }}
        secondaryLabel={t('cancel')}
        onSecondary={() => setRegenerateTarget(null)}
      />

      <HisabiStatusModal
        open={Boolean(qrPreview)}
        onOpenChange={(open) => {
          if (!open) {
            if (qrPreview?.objectUrl) URL.revokeObjectURL(qrPreview.objectUrl)
            setQrPreview(null)
          }
        }}
        variant="success"
        title={t('qrPreviewTitle', {
          name: String(qrPreview?.row?.name ?? ''),
        })}
        description={
          qrPreview ? (
            <div className="space-y-hisabi-md">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob URL from auth QR endpoint */}
              <img
                src={qrPreview.objectUrl}
                alt=""
                className="mx-auto size-[min(100%,280px)] rounded-lg border border-hisabi-outline-variant/30 bg-white p-hisabi-sm"
              />
              <p className="type-body-sm break-all text-hisabi-on-surface-variant">
                {qrPreview.row?.orderUrl
                  ? t('qrPreviewBody', { url: String(qrPreview.row.orderUrl) })
                  : t('qrPreviewBodyNoUrl')}
              </p>
            </div>
          ) : null
        }
        primaryLabel={t('downloadQr')}
        onPrimary={() => {
          if (qrPreview?.row) void handleQrAction(qrPreview.row, 'download')
        }}
        secondaryLabel={t('close')}
        onSecondary={() => {
          if (qrPreview?.objectUrl) URL.revokeObjectURL(qrPreview.objectUrl)
          setQrPreview(null)
        }}
      />
    </div>
  )
}
