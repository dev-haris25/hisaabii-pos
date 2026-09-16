'use client'

import { useMutation } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  Pencil,
  Printer,
  Send,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { SoftDeleteConfirmModal } from '@/components/invoices/soft-delete-confirm-modal'
import { ZatcaStatusBadge } from '@/components/invoices/zatca-status-badge'
import { ListBulkActionsBar } from '@/components/list-views/list-bulk-actions-bar'
import { ListRowSelectionCheckbox } from '@/components/list-views/list-row-selection-checkbox'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import {
  ActionIconButton,
  ActionIconLink,
} from '@/components/row-actions/action-icon-button'
import { usePathname, useRouter, Link } from '@/i18n/navigation'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'
import { printDocument } from '@/lib/print/print-document'
import { invoiceReceiptActionLabel } from '@/lib/print/receipt-action-label'
import { toastPrintResult } from '@/lib/print/toast-print-result'
import { bulkDeleteRows } from '@/lib/list-views/bulk-delete-rows'
import { canRepairFailedNote, canSoftDeleteNote } from '@/lib/notes/can-repair-failed-note'
import { canReportNoteToZatca } from '@/lib/notes/map-note-json'
import { buildPaginationItems } from '@/lib/list-views/build-pagination-items'
import { LIST_PAGE_HEADER_ACTIONS } from '@/lib/list-views/list-page-toolbar-styles'
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
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const ZATCA_FILTER_KEYS = /** @type {const} */ ([
  ['all', 'filterZatcaAll'],
  ['pending', 'zatcaPending'],
  ['reported', 'zatcaReported'],
  ['failed', 'zatcaFailed'],
])

/**
 * @param {{
 *   documentNature: 'credit' | 'debit'
 *   notes: Array<{
 *     id: string
 *     noteNumber: string
 *     noteDate: string
 *     invoiceId: string | null
 *     invoiceNumber: string | null
 *     reasonAr: string
 *     reasonEn: string | null
 *     grandTotal: string
 *     zatcaStatus: string | null
 *     hasQr: boolean
 *   }>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { search: string, zatca: string }
 *   cashierWindowOnly?: boolean
 * }} props
 */
export function NotesListView({
  documentNature,
  notes,
  pagination,
  filters,
  cashierWindowOnly = false,
}) {
  const ns = documentNature === 'credit' ? 'CreditNotes' : 'DebitNotes'
  const t = useTranslations(ns)
  const tList = useTranslations('ListViews')
  const tInv = useTranslations('Invoices')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [reportingId, setReportingId] = useState(
    /** @type {string | null} */ (null),
  )
  const [printingId, setPrintingId] = useState(
    /** @type {string | null} */ (null),
  )
  const [deleteTarget, setDeleteTarget] = useState(
    /** @type {{ id: string, noteNumber: string } | null} */ (null),
  )
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)

  const apiSegment = documentNature === 'credit' ? 'credit-notes' : 'debit-notes'

  const { searchInput, setSearchInput, debouncedSearch, lastPushedSearch } =
    useUrlSyncedSearchInput(filters.search)

  const pageSize = pagination.limit
  const total = pagination.total
  const safePage = Math.min(pagination.page, Math.max(1, pagination.totalPages))
  const start = (safePage - 1) * pageSize
  const paginationItems = buildPaginationItems(safePage, pagination.totalPages)

  const selectableRows = useMemo(
    () => notes.filter((row) => canSoftDeleteNote(row)),
    [notes],
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
    filters.zatca,
    pagination.page,
    pagination.limit,
    clearSelection,
  ])

  function pushFilters(next) {
    const params = new URLSearchParams()
    params.set('page', String(next.page ?? 1))
    params.set('limit', String(next.limit ?? pageSize))
    if (next.search) params.set('search', next.search)
    if (next.zatca && next.zatca !== 'all') params.set('zatca', next.zatca)
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
      zatca: filters.zatca,
      limit: pageSize,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from debounced search only
  }, [debouncedSearch])

  const reportMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => {
      setReportingId(id)
      return authPost(`/${apiSegment}/${id}/send`)
    },
    onSuccess: () => {
      toast.success(tInv('reportSuccess'))
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
    onSettled: () => setReportingId(null),
  })

  const printMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => {
      setPrintingId(id)
      return printDocument({ noteId: id, noteType: documentNature })
    },
    onSuccess: (data) => {
      toastPrintResult(tInv, data)
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
    onSettled: () => setPrintingId(null),
  })

  const listBusy =
    isPending || reportMutation.isPending || printMutation.isPending

  const zatcaLabels = {
    pending: tInv('zatcaPending'),
    reported: tInv('zatcaReported'),
    failed: tInv('zatcaFailed'),
    cleared: tInv('zatcaCleared'),
    unknown: tInv('zatcaUnknown'),
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    } catch {
      return iso
    }
  }

  function reasonLabel(row) {
    if (locale === 'ar') return row.reasonAr
    return row.reasonEn?.trim() || row.reasonAr
  }

  const emptyMessage =
    filters.search || filters.zatca !== 'all' ? t('emptyFiltered') : t('empty')

  async function handleBulkDelete() {
    setBulkDeletePending(true)
    try {
      const { deleted, failed } = await bulkDeleteRows(
        [...selectedIds],
        (id) => `/${apiSegment}/${id}`,
      )
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
            {cashierWindowOnly ? t('subtitleCashierWindow') : t('subtitle')}
          </p>
        </div>
        <div className={LIST_PAGE_HEADER_ACTIONS}>
          <div className="flex w-full rounded-lg border border-hisabi-outline-variant/60 bg-white p-1 sm:w-auto">
            {ZATCA_FILTER_KEYS.map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  pushFilters({
                    page: 1,
                    search: filters.search,
                    zatca: key,
                    limit: pageSize,
                  })
                }
                disabled={listBusy}
                className={cn(
                  'type-label-sm flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2 text-center font-bold transition-colors sm:flex-none sm:px-hisabi-md',
                  filters.zatca === key
                    ? 'bg-hisabi-primary-container text-white'
                    : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                  listBusy && 'opacity-60',
                )}
              >
                {tInv(labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('loadingList')
              : t('showingCount', {
                  shown: notes.length,
                  total,
                })
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchPlaceholder')}
        />

        <ListBulkActionsBar
          selectedCount={selectedCount}
          onDelete={() => setBulkDeleteModalOpen(true)}
          onClear={clearSelection}
          deletePending={bulkDeletePending}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[720px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={LIST_TABLE_TH_CHECKBOX}>
                  <ListRowSelectionCheckbox
                    checked={allPageSelected}
                    indeterminate={somePageSelected && !allPageSelected}
                    onChange={toggleAllOnPage}
                    ariaLabel={tList('selectAllOnPage')}
                    disabled={listBusy || selectableRows.length === 0}
                  />
                </th>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colNote')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colDate')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colInvoice')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colReason')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colTotal')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {tInv('colZatca')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {tInv('colActions')}
                </th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {notes.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                notes.map((row) => {
                  const rowSelectable = canSoftDeleteNote(row)
                  return (
                  <tr key={row.id} className={LIST_TABLE_ROW}>
                    <td className={LIST_TABLE_TD_CHECKBOX}>
                      <ListRowSelectionCheckbox
                        checked={isSelected(row.id)}
                        onChange={() => toggleRow(row.id)}
                        ariaLabel={tList('selectRow')}
                        disabled={listBusy || !rowSelectable}
                      />
                    </td>
                    <td className={listTableTdClass(undefined, true)}>
                      <span
                        dir="ltr"
                        className="type-body-md font-bold text-hisabi-on-surface"
                      >
                        {row.noteNumber}
                      </span>
                    </td>
                    <td className={listTableTdClass()}>
                      <span
                        dir="ltr"
                        className="type-body-sm text-hisabi-on-surface"
                      >
                        {formatDate(row.noteDate)}
                      </span>
                    </td>
                    <td className={listTableTdClass()}>
                      {row.invoiceNumber && row.invoiceId ? (
                        <Link
                          href={`/invoices/${row.invoiceId}`}
                          className="type-body-md font-semibold text-hisabi-primary hover:underline"
                          dir="ltr"
                        >
                          {row.invoiceNumber}
                        </Link>
                      ) : (
                        <span
                          dir="ltr"
                          className="type-body-md text-hisabi-on-surface-variant"
                        >
                          {row.invoiceNumber || '—'}
                        </span>
                      )}
                    </td>
                    <td className={listTableTdClass()}>
                      <span className="type-body-md line-clamp-2 text-hisabi-on-surface">
                        {reasonLabel(row)}
                      </span>
                    </td>
                    <td className={listTableTdClass()}>
                      <span
                        dir="ltr"
                        className="type-body-md font-bold text-hisabi-on-surface"
                      >
                        {row.grandTotal}
                      </span>
                    </td>
                    <td className={listTableTdClass()}>
                      <ZatcaStatusBadge
                        status={row.zatcaStatus}
                        labels={zatcaLabels}
                      />
                    </td>
                    <td className={listTableActionsTdClass()}>
                      <div className={LIST_TABLE_ACTIONS_INNER}>
                        <ActionIconLink
                          href={`${pathname}/${row.id}`}
                          label={tInv('actionView')}
                          className="hover:text-hisabi-primary"
                        >
                          <Eye className="size-5" aria-hidden />
                        </ActionIconLink>
                        {row.hasQr ? (
                          <ActionIconButton
                            label={invoiceReceiptActionLabel(tInv)}
                            disabled={printingId === row.id}
                            className="hover:text-hisabi-primary"
                            onClick={() => printMutation.mutate(row.id)}
                          >
                            {isHisabiDesktop() ? (
                              <Printer className="size-5" aria-hidden />
                            ) : (
                              <Download className="size-5" aria-hidden />
                            )}
                          </ActionIconButton>
                        ) : null}
                        {canReportNoteToZatca(row.zatcaStatus) ? (
                          <ActionIconButton
                            label={tInv('actionReport')}
                            disabled={reportingId === row.id}
                            className="hover:text-hisabi-teal"
                            onClick={() => reportMutation.mutate(row.id)}
                          >
                            <Send className="size-5" aria-hidden />
                          </ActionIconButton>
                        ) : null}
                        {canRepairFailedNote(row) ? (
                          <ActionIconLink
                            href={`${pathname}/${row.id}/edit`}
                            label={t('actionEdit')}
                            className="hover:text-hisabi-secondary"
                          >
                            <Pencil className="size-5" aria-hidden />
                          </ActionIconLink>
                        ) : null}
                        {canSoftDeleteNote(row) ? (
                          <ActionIconButton
                            label={t('actionDelete')}
                            className="hover:text-hisabi-error"
                            onClick={() =>
                              setDeleteTarget({
                                id: row.id,
                                noteNumber: row.noteNumber,
                              })
                            }
                          >
                            <Trash2 className="size-5" aria-hidden />
                          </ActionIconButton>
                        ) : null}
                      </div>
                    </td>
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
              <span>{tInv('rowsPerPage')}</span>
              <select
                className="type-label-sm cursor-pointer border-none bg-transparent py-0 ps-1 pe-6 font-bold text-hisabi-on-surface focus:ring-0"
                aria-label={tInv('rowsPerPageAria')}
                value={pageSize}
                disabled={listBusy}
                onChange={(e) =>
                  pushFilters({
                    page: 1,
                    search: filters.search,
                    zatca: filters.zatca,
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
                ? tInv('rangeEmpty')
                : tInv('range', {
                    from: start + 1,
                    to: start + notes.length,
                    total,
                  })}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 sm:justify-end">
            <button
              type="button"
              disabled={safePage <= 1 || listBusy}
              className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={tInv('pageFirst')}
              onClick={() =>
                pushFilters({
                  page: 1,
                  search: filters.search,
                  zatca: filters.zatca,
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
              aria-label={tInv('pagePrev')}
              onClick={() =>
                pushFilters({
                  page: Math.max(1, safePage - 1),
                  search: filters.search,
                  zatca: filters.zatca,
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
                        zatca: filters.zatca,
                        limit: pageSize,
                      })
                    }
                    className={cn(
                      'type-label-sm min-w-8 cursor-pointer rounded-lg px-2 py-1.5 font-bold transition-colors',
                      item === safePage
                        ? 'bg-hisabi-primary-container text-white'
                        : 'text-slate-500 hover:bg-white hover:text-hisabi-on-surface',
                    )}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              disabled={safePage >= pagination.totalPages || listBusy}
              className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={tInv('pageNext')}
              onClick={() =>
                pushFilters({
                  page: Math.min(pagination.totalPages, safePage + 1),
                  search: filters.search,
                  zatca: filters.zatca,
                  limit: pageSize,
                })
              }
            >
              <ChevronRight className="size-5 rtl:rotate-180" />
            </button>
            <button
              type="button"
              disabled={safePage >= pagination.totalPages || listBusy}
              className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={tInv('pageLast')}
              onClick={() =>
                pushFilters({
                  page: pagination.totalPages,
                  search: filters.search,
                  zatca: filters.zatca,
                  limit: pageSize,
                })
              }
            >
              <ChevronsRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {deleteTarget ? (
        <SoftDeleteConfirmModal
          open={Boolean(deleteTarget)}
          onOpenChange={(next) => {
            if (!next) setDeleteTarget(null)
          }}
          apiPath={`/${apiSegment}/${deleteTarget.id}`}
          documentNumber={deleteTarget.noteNumber}
          title={t('deleteConfirmTitle')}
          body={t('deleteConfirmBody', { number: deleteTarget.noteNumber })}
          successMessage={t('deleteSuccess')}
        />
      ) : null}

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
