'use client'

import { useMutation } from '@tanstack/react-query'
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  Loader2,
  Pencil,
  Printer,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { InvoiceCancelConfirmModal } from '@/components/invoices/invoice-cancel-confirm-modal'
import { PosThermalReceiptPreview } from '@/components/invoices/pos-thermal-receipt-preview'
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
import {
  invoiceReceiptActionLabel,
  receiptActionLabel,
} from '@/lib/print/receipt-action-label'
import { toastPrintError } from '@/lib/print/toast-print-error'
import { toastPrintResult } from '@/lib/print/toast-print-result'
import { canReportInvoiceToZatca } from '@/lib/invoices/map-invoice-json'
import { formatOrderNumber } from '@/lib/orders/riyadh-order-date'
import {
  canEditOrCancelInvoice,
  canRepairFailedInvoice,
  canSoftDeleteInvoice,
} from '@/lib/notes/can-edit-or-cancel-invoice'
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
 *   invoices: Array<{
 *     id: string
 *     invoiceNumber: string
 *     orderNumber?: number | null
 *     invoiceDate: string
 *     paymentMethod: string
 *     grandTotal: string
 *     totalVat: string
 *     status: string
 *     zatcaStatus: string | null
 *     zatcaLastError: string | null
 *     hasQr: boolean
 *     staffName: string | null
 *     creditNotes?: Array<{ id: string, noteNumber: string }>
 *     debitNotes?: Array<{ id: string, noteNumber: string }>
 *   }>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { search: string, zatca: string, payment: string }
 *   logoUrl?: string | null
 *   cashierWindowOnly?: boolean
 * }} props
 */
export function InvoicesListView({
  invoices,
  pagination,
  filters,
  logoUrl = null,
  cashierWindowOnly = false,
}) {
  const t = useTranslations('Invoices')
  const tList = useTranslations('ListViews')
  const tPos = useTranslations('Pos')
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
  const [receipt, setReceipt] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [cancelTarget, setCancelTarget] = useState(
    /** @type {{ id: string, invoiceNumber: string } | null} */ (null),
  )
  const [deleteTarget, setDeleteTarget] = useState(
    /** @type {{ id: string, invoiceNumber: string } | null} */ (null),
  )
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)

  const { searchInput, setSearchInput, debouncedSearch, lastPushedSearch } =
    useUrlSyncedSearchInput(filters.search)

  const pageSize = pagination.limit
  const total = pagination.total
  const safePage = Math.min(pagination.page, Math.max(1, pagination.totalPages))
  const start = (safePage - 1) * pageSize
  const paginationItems = buildPaginationItems(safePage, pagination.totalPages)

  const selectableRows = useMemo(
    () => invoices.filter((row) => canSoftDeleteInvoice(row)),
    [invoices],
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
    filters.payment,
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
    if (next.payment && next.payment !== 'all') {
      params.set('payment', next.payment)
    }
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
      payment: filters.payment,
      limit: pageSize,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from debounced search only
  }, [debouncedSearch])

  const reportMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => {
      setReportingId(id)
      return authPost(`/invoices/${id}/send`)
    },
    onSuccess: (data) => {
      toast.success(t('reportSuccess'))
      if (data?.invoice && typeof data.invoice === 'object') {
        setReceipt(/** @type {Record<string, unknown>} */ (data.invoice))
      }
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
      return printDocument({ invoiceId: id })
    },
    onSuccess: (data) => {
      toastPrintResult(t, data)
    },
    onError: (err) => {
      toastPrintError(err)
    },
    onSettled: () => setPrintingId(null),
  })

  const modalPrintMutation = useMutation({
    mutationFn: () => {
      const invoiceId =
        receipt && typeof receipt.id === 'string' ? receipt.id : ''
      if (!invoiceId) {
        throw new AuthApiError(400, 'VALIDATION_ERROR', 'Missing invoice')
      }
      return printDocument({ invoiceId })
    },
    onSuccess: (data) => {
      toastPrintResult(t, data)
    },
    onError: (err) => {
      toastPrintError(err)
    },
  })

  const listBusy =
    isPending || reportMutation.isPending || printMutation.isPending

  const zatcaLabels = {
    pending: t('zatcaPending'),
    reported: t('zatcaReported'),
    failed: t('zatcaFailed'),
    cleared: t('zatcaCleared'),
    unknown: t('zatcaUnknown'),
    voided: t('statusVoided'),
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

  function closeReceipt() {
    setReceipt(null)
  }

  const emptyMessage =
    filters.search || filters.zatca !== 'all' || filters.payment !== 'all'
      ? t('emptyFiltered')
      : t('empty')

  async function handleBulkDelete() {
    setBulkDeletePending(true)
    try {
      const { deleted, failed } = await bulkDeleteRows(
        [...selectedIds],
        (id) => `/invoices/${id}`,
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
                    payment: filters.payment,
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
                {t(labelKey)}
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
                  shown: invoices.length,
                  total,
                })
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchPlaceholder')}
        >
          <select
            aria-label={t('filterPayment')}
            value={filters.payment}
            disabled={listBusy}
            onChange={(e) =>
              pushFilters({
                page: 1,
                search: filters.search,
                zatca: filters.zatca,
                payment: e.target.value,
                limit: pageSize,
              })
            }
            className={listTableToolbarSelectClass()}
          >
            <option value="all">{t('filterPaymentAll')}</option>
            <option value="cash">{t('paymentCash')}</option>
            <option value="card">{t('paymentCard')}</option>
          </select>
        </ListTableToolbar>

        <ListBulkActionsBar
          selectedCount={selectedCount}
          onDelete={() => setBulkDeleteModalOpen(true)}
          onClear={clearSelection}
          deletePending={bulkDeletePending}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[920px]')}>
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
                  {t('colInvoice')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colOrder')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colDate')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colCashier')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colPayment')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colTotal')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colCreditNote')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colDebitNote')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colZatca')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colActions')}
                </th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                invoices.map((row) => {
                  const rowSelectable = canSoftDeleteInvoice(row)
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
                      <Link
                        href={`/invoices/${row.id}`}
                        className="type-body-md font-semibold text-hisabi-primary hover:underline"
                        dir="ltr"
                      >
                        {row.invoiceNumber}
                      </Link>
                    </td>
                    <td className={listTableTdClass()}>
                      {row.orderNumber ? (
                        <span dir="ltr" className="type-body-md font-bold text-hisabi-teal">
                          {formatOrderNumber(row.orderNumber)}
                        </span>
                      ) : null}
                    </td>
                    <td className={listTableTdClass()}>
                      <span
                        dir="ltr"
                        className="type-body-sm text-hisabi-on-surface"
                      >
                        {formatDate(row.invoiceDate)}
                      </span>
                    </td>
                    <td className={listTableTdClass()}>
                      <span className="type-body-md text-hisabi-on-surface">
                        {row.staffName || '—'}
                      </span>
                    </td>
                    <td className={listTableTdClass()}>
                      <span className="type-body-md text-hisabi-on-surface">
                        {row.paymentMethod === 'card'
                          ? t('paymentCard')
                          : t('paymentCash')}
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
                      {(row.creditNotes ?? []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(row.creditNotes ?? []).map((note) => (
                            <Link
                              key={note.id}
                              href={`/invoices/credit-notes/${note.id}`}
                              className="type-label-sm inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 hover:bg-amber-200"
                              title={t('badgeHasCreditNoteTitle')}
                            >
                              <span dir="ltr">{note.noteNumber}</span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="type-body-sm text-hisabi-on-surface-variant">
                          —
                        </span>
                      )}
                    </td>
                    <td className={listTableTdClass()}>
                      {(row.debitNotes ?? []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(row.debitNotes ?? []).map((note) => (
                            <Link
                              key={note.id}
                              href={`/invoices/debit-notes/${note.id}`}
                              className="type-label-sm inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 hover:bg-blue-200"
                              title={t('badgeHasDebitNoteTitle')}
                            >
                              <span dir="ltr">{note.noteNumber}</span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="type-body-sm text-hisabi-on-surface-variant">
                          —
                        </span>
                      )}
                    </td>
                    <td className={listTableTdClass()}>
                      <ZatcaStatusBadge
                        status={row.zatcaStatus}
                        invoiceStatus={row.status}
                        labels={zatcaLabels}
                      />
                    </td>
                    <td className={listTableActionsTdClass()}>
                      <div className={LIST_TABLE_ACTIONS_INNER}>
                        <ActionIconLink
                          href={`/invoices/${row.id}`}
                          label={t('actionView')}
                          className="hover:text-hisabi-primary"
                        >
                          <Eye className="size-5" aria-hidden />
                        </ActionIconLink>
                        {row.status !== 'voided' && row.hasQr ? (
                          <ActionIconButton
                            label={invoiceReceiptActionLabel(t)}
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
                        {row.status !== 'voided' &&
                        canReportInvoiceToZatca(row.zatcaStatus) ? (
                          <ActionIconButton
                            label={t('actionReport')}
                            disabled={reportingId === row.id}
                            className="hover:text-hisabi-teal"
                            onClick={() => reportMutation.mutate(row.id)}
                          >
                            {reportingId === row.id ? (
                              <Loader2
                                className="size-5 animate-spin"
                                aria-hidden
                              />
                            ) : (
                              <Send className="size-5" aria-hidden />
                            )}
                          </ActionIconButton>
                        ) : null}
                        {canEditOrCancelInvoice(row) ? (
                          <>
                            <ActionIconLink
                              href={`/invoices/${row.id}/edit`}
                              label={t('actionEdit')}
                              className="hover:text-hisabi-secondary"
                            >
                              <Pencil className="size-5" aria-hidden />
                            </ActionIconLink>
                            <ActionIconButton
                              label={t('actionCancel')}
                              className="hover:text-hisabi-error"
                              onClick={() =>
                                setCancelTarget({
                                  id: row.id,
                                  invoiceNumber: row.invoiceNumber,
                                })
                              }
                            >
                              <Ban className="size-5" aria-hidden />
                            </ActionIconButton>
                          </>
                        ) : null}
                        {canRepairFailedInvoice(row) ? (
                          <ActionIconLink
                            href={`/invoices/${row.id}/edit`}
                            label={t('actionEdit')}
                            className="hover:text-hisabi-secondary"
                          >
                            <Pencil className="size-5" aria-hidden />
                          </ActionIconLink>
                        ) : null}
                        {canSoftDeleteInvoice(row) ? (
                          <ActionIconButton
                            label={t('actionDelete')}
                            className="hover:text-hisabi-error"
                            onClick={() =>
                              setDeleteTarget({
                                id: row.id,
                                invoiceNumber: row.invoiceNumber,
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
                    zatca: filters.zatca,
                    payment: filters.payment,
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
                    to: start + invoices.length,
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
                  zatca: filters.zatca,
                  payment: filters.payment,
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
                  zatca: filters.zatca,
                  payment: filters.payment,
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
                        payment: filters.payment,
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
              aria-label={t('pageNext')}
              onClick={() =>
                pushFilters({
                  page: Math.min(pagination.totalPages, safePage + 1),
                  search: filters.search,
                  zatca: filters.zatca,
                  payment: filters.payment,
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
              aria-label={t('pageLast')}
              onClick={() =>
                pushFilters({
                  page: pagination.totalPages,
                  search: filters.search,
                  zatca: filters.zatca,
                  payment: filters.payment,
                  limit: pageSize,
                })
              }
            >
              <ChevronsRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {cancelTarget ? (
        <InvoiceCancelConfirmModal
          open={Boolean(cancelTarget)}
          onOpenChange={(next) => {
            if (!next) setCancelTarget(null)
          }}
          invoiceId={cancelTarget.id}
          invoiceNumber={cancelTarget.invoiceNumber}
        />
      ) : null}
      {deleteTarget ? (
        <SoftDeleteConfirmModal
          open={Boolean(deleteTarget)}
          onOpenChange={(next) => {
            if (!next) setDeleteTarget(null)
          }}
          apiPath={`/invoices/${deleteTarget.id}`}
          documentNumber={deleteTarget.invoiceNumber}
          title={t('deleteConfirmTitle')}
          body={t('deleteConfirmBody', { number: deleteTarget.invoiceNumber })}
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

      {receipt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-hisabi-md backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoices-receipt-title"
            className="relative flex max-h-[min(92vh,900px)] w-full max-w-[22rem] flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-hisabi-2"
          >
            <button
              type="button"
              onClick={closeReceipt}
              className="text-hisabi-outline hover:bg-hisabi-surface-container absolute end-2 top-2 z-10 cursor-pointer rounded-lg p-2 transition-colors"
              aria-label={t('close')}
            >
              <X className="size-5" aria-hidden />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto px-hisabi-lg py-hisabi-lg">
              <p
                id="invoices-receipt-title"
                className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-sm text-center"
              >
                {t('reportSuccess')} — {t('receiptPreviewHint')}
              </p>

              <PosThermalReceiptPreview
                invoice={/** @type {any} */ (receipt)}
                logoUrl={logoUrl}
              />
            </div>

            <div className="shrink-0 space-y-hisabi-sm border-t border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest px-hisabi-lg py-hisabi-md">
              {typeof receipt.qrCode === 'string' && receipt.qrCode ? (
                <AuthSubmitButton
                  type="button"
                  pending={modalPrintMutation.isPending}
                  onClick={() => modalPrintMutation.mutate()}
                >
                  {receiptActionLabel(tPos)}
                </AuthSubmitButton>
              ) : (
                <p className="type-body-sm text-hisabi-on-surface-variant text-center">
                  {t('printBlockedNoQr')}
                </p>
              )}
              <AuthSubmitButton
                type="button"
                variant="secondary"
                onClick={closeReceipt}
              >
                {t('close')}
              </AuthSubmitButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
