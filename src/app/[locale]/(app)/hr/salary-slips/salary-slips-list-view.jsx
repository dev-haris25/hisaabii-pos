'use client'

import { formatSarAmount } from '@/lib/settings/format-helpers'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  Loader2,
  Eye,
  Pencil,
  Plus,
  Printer,
  Send,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import { ListTablePagination } from '@/components/list-views/list-table-pagination'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { ListBulkActionsBar } from '@/components/list-views/list-bulk-actions-bar'
import { ListRowSelectionCheckbox } from '@/components/list-views/list-row-selection-checkbox'
import { ActionIconButton } from '@/components/row-actions/action-icon-button'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { SalarySlipSendSheet } from '@/components/hr/salary-slip-send-sheet'
import { Link, useRouter } from '@/i18n/navigation'
import { openPrintDocument } from '@/lib/print/open-print-document'
import { authDelete, authGet, authPost } from '@/lib/api/auth-client'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import { bulkDeleteRows } from '@/lib/list-views/bulk-delete-rows'
import { buildListQueryUrl } from '@/lib/list-views/build-list-query-url'
import { LIST_PAGE_HEADER_ACTIONS } from '@/lib/list-views/list-page-toolbar-styles'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_ACTIONS_INNER,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  LIST_TABLE_TD_CHECKBOX,
  LIST_TABLE_TH_CHECKBOX,
  listTableTdClass,
  listTableActionsTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/lib/list-views/use-debounced-value'
import { useListPageFromUrl, useResetListPageOnChange } from '@/lib/list-views/use-list-page-from-url'
import { useServerPaginatedRows } from '@/lib/list-views/use-server-paginated-rows'
import { useListRowSelection } from '@/lib/list-views/use-list-row-selection'
import { useAuthStore } from '@/stores/auth-store'

/** @param {string | null | undefined} v */
function parseAmount(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/** @param {string} v */
function csvEscape(v) {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

function SalarySlipsListWithoutCompanyProfile() {
  const t = useTranslations('HR')
  return (
    <div className="mx-auto max-w-hisabi-container">
      <NoCompanyProfileBanner className="mb-hisabi-lg" />
      <div className="pointer-events-none select-none opacity-40">
        <div className="mb-hisabi-xl space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('salarySlipsTitle')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('salarySlipsSubtitle')}
          </p>
        </div>
      </div>
    </div>
  )
}

function SalarySlipsListWithCompanyProfile() {
  const t = useTranslations('HR')
  const tList = useTranslations('ListViews')
  const locale = useLocale()
  const uiLocale = locale === 'ar' ? 'ar-SA' : 'en-US'
  const router = useRouter()
  const queryClient = useQueryClient()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const prevActiveProfileRef = useRef(
    /** @type {string | null | undefined} */ (undefined),
  )

  const [deleteModal, setDeleteModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(
    /** @type {{ id: string, voucherNumber: string } | null} */ (null),
  )
  const [deletePending, setDeletePending] = useState(false)
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)
  const [sendSheetRow, setSendSheetRow] = useState(
    /** @type {Record<string, string> | null} */ (null),
  )
  const [downloadPendingId, setDownloadPendingId] = useState(
    /** @type {string | null} */ (null),
  )
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput.trim())
  const { page, setPage, resetPage } = useListPageFromUrl()
  const pageSize = 10

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['hr-salary-slips', activeBusinessProfileId, debouncedSearch, page, pageSize],
    queryFn: async () =>
      authGet(
        buildListQueryUrl('/hr/salary-slips', {
          search: debouncedSearch,
          page,
          limit: pageSize,
        }),
      ),
    enabled: Boolean(activeBusinessProfileId),
  })

  const { data: profileData } = useQuery({
    queryKey: ['business-profile', activeBusinessProfileId],
    queryFn: async () => authGet('/business-profile'),
    enabled: Boolean(activeBusinessProfileId),
  })

  const companyName =
    profileData?.profile?.companyNameEn?.trim() ||
    profileData?.profile?.companyNameAr?.trim() ||
    ''

  const busy = isPending || isFetching
  const rows = useMemo(
    () => /** @type {Array<Record<string, string>>} */ (data?.items ?? []),
    [data?.items],
  )

  const { total, totalPages, safePage } = useServerPaginatedRows(page, data?.pagination)
  const pageRows = rows


  const {
    selectedCount,
    allPageSelected,
    somePageSelected,
    toggleRow,
    toggleAllOnPage,
    clearSelection,
    isSelected,
    selectedIds,
  } = useListRowSelection(pageRows)

  useEffect(() => {
    clearSelection()
  }, [page, debouncedSearch, clearSelection])

  useResetListPageOnChange(resetPage, [debouncedSearch])

  useEffect(() => {
    const prev = prevActiveProfileRef.current
    prevActiveProfileRef.current = activeBusinessProfileId
    if (prev === undefined) return
    if (prev === activeBusinessProfileId) return
    resetPage()
    setDeleteModal(false)
    setPendingDelete(null)
    setBulkDeleteModal(false)
    clearSelection()
  }, [activeBusinessProfileId, clearSelection])

  const formatAmount = useCallback(
    (n) =>
      new Intl.NumberFormat(uiLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n),
    [uiLocale],
  )

  const formatDate = useCallback(
    (iso) => {
      if (!iso) return '—'
      return new Intl.DateTimeFormat(uiLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(iso))
    },
    [uiLocale],
  )

  const handleExportCsv = useCallback(() => {
    if (rows.length === 0) return
    const header = [
      t('colSlipDate'),
      t('colVoucherNo'),
      t('colReference'),
      t('colEmployeeName'),
      t('colBasicPay'),
      t('colAllowance'),
      t('colDeductions'),
      t('colNetTotal'),
    ]
    const lines = [
      header.map(csvEscape).join(','),
      ...rows.map((row) =>
        [
          csvEscape(formatDate(row.slipDate)),
          csvEscape(row.voucherNumber ?? ''),
          csvEscape(row.referenceNumber ?? ''),
          csvEscape(row.employeeName ?? ''),
          csvEscape(formatAmount(parseAmount(row.basicPay))),
          csvEscape(formatAmount(parseAmount(row.totalEarnings))),
          csvEscape(formatAmount(parseAmount(row.totalDeductions))),
          csvEscape(formatAmount(parseAmount(row.netTotal))),
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hisabi-salary-slips.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [rows, t, formatAmount, formatDate])

  /** @param {Record<string, string>} row */
  function employeeDefaultEmail(row) {
    return String(row.employeeEmailOfficial || row.employeeEmailPersonal || '').trim()
  }

  async function handleDownloadPdf(row) {
    setDownloadPendingId(row.id)
    try {
      const response = await fetch(
        `/api/auth/hr/salary-slips/${row.id}/pdf?locale=${encodeURIComponent(locale)}`,
        { credentials: 'include' },
      )
      if (!response.ok) throw new Error('PDF download failed')
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/pdf')) throw new Error('Not a PDF')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${row.voucherNumber || 'salary-slip'}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setDownloadPendingId(null)
    }
  }

  /** @param {{ id: string }} row */
  function handlePrint(row) {
    openPrintDocument(locale, `/print/salary-slip/${row.id}`)
  }

  async function handleSendSalarySlipEmail(payload) {
    if (!sendSheetRow) return
    try {
      await authPost(`/hr/salary-slips/${sendSheetRow.id}/email`, { ...payload, locale })
    } catch (err) {
      toastAuthApiError(t, err)
      throw err
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setDeletePending(true)
    try {
      await authDelete(`/hr/salary-slips/${pendingDelete.id}`)
      toast.success(t('salarySlipDeleted'))
      await queryClient.invalidateQueries({ queryKey: ['hr-salary-slips'] })
      setDeleteModal(false)
      setPendingDelete(null)
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setDeletePending(false)
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBulkDeletePending(true)
    try {
      const { deleted, failed } = await bulkDeleteRows(ids, (id) => `/hr/salary-slips/${id}`)
      if (deleted.length) {
        await queryClient.invalidateQueries({ queryKey: ['hr-salary-slips'] })
      }
      if (failed.length === 0) {
        toast.success(tList('bulkDeleteSuccess', { count: deleted.length }))
        setBulkDeleteModal(false)
        clearSelection()
      } else if (deleted.length === 0) {
        toastAuthApiError(t, failed[0].error)
      } else {
        toast.warning(tList('bulkDeletePartial', { deleted: deleted.length, failed: failed.length }))
        setBulkDeleteModal(false)
        clearSelection()
      }
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setBulkDeletePending(false)
    }
  }

  return (
    <div className="mx-auto max-w-hisabi-container">
      {isError ? (
        <div
          role="alert"
          className="mb-hisabi-lg flex flex-col gap-hisabi-md rounded-xl border border-red-200 bg-red-50/90 p-hisabi-lg text-red-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="type-body-md">{t('loadError')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="type-label-md shrink-0 rounded-lg bg-white px-hisabi-md py-2 font-semibold text-red-800 shadow-sm hover:bg-red-100"
          >
            {t('retryLoad')}
          </button>
        </div>
      ) : null}

      <div className="mb-hisabi-xl flex flex-col gap-hisabi-lg min-[1251px]:flex-row min-[1251px]:items-end min-[1251px]:justify-between">
        <div className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('salarySlipsTitle')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('salarySlipsSubtitle')}
          </p>
        </div>
        <div className={LIST_PAGE_HEADER_ACTIONS}>
          <Link
            href="/hr/salary-slips/add"
            className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
          >
            <Plus className="size-5 shrink-0" aria-hidden />
            {t('addSalarySlip')}
          </Link>
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            busy
              ? tList('loadingList')
              : tList('showingCount', { shown: pageRows.length, total })
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchSalarySlipsPlaceholder')}
          exportLabel={tList('exportCsv')}
          onExport={handleExportCsv}
          exportDisabled={rows.length === 0 || busy}
        />

        <ListBulkActionsBar
          selectedCount={selectedCount}
          onDelete={() => setBulkDeleteModal(true)}
          onClear={clearSelection}
          deletePending={bulkDeletePending}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[1100px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th className={LIST_TABLE_TH_CHECKBOX}>
                  <ListRowSelectionCheckbox
                    checked={allPageSelected}
                    indeterminate={somePageSelected && !allPageSelected}
                    onChange={toggleAllOnPage}
                    disabled={pageRows.length === 0}
                    ariaLabel={tList('selectAllOnPage')}
                  />
                </th>
                {[
                  'colSlipDate',
                  'colVoucherNo',
                  'colReference',
                  'colEmployeeName',
                  'colBasicPay',
                  'colAllowance',
                  'colDeductions',
                  'colNetTotal',
                  'colActions',
                ].map((key) => (
                  <th
                    key={key}
                    className={listTableThClass(undefined, key === 'colSlipDate')}
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {busy && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-hisabi-lg py-16 text-center">
                    <Loader2 className="mx-auto size-8 animate-spin text-hisabi-primary" aria-hidden />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className={LIST_TABLE_ROW}>
                    <td className={LIST_TABLE_TD_CHECKBOX}>
                      <ListRowSelectionCheckbox
                        checked={isSelected(row.id)}
                        onChange={() => toggleRow(row.id)}
                        ariaLabel={tList('selectRow')}
                      />
                    </td>
                    <td className={listTableTdClass('type-body-sm', true)}>
                      {formatDate(row.slipDate)}
                    </td>
                    <td className={listTableTdClass('type-body-sm font-mono')} dir="ltr">
                      {row.voucherNumber}
                    </td>
                    <td className={listTableTdClass('type-body-sm text-hisabi-on-surface-variant')}>
                      {row.referenceNumber || '—'}
                    </td>
                    <td className={listTableTdClass('type-body-sm text-hisabi-on-surface font-semibold')}>
                      {row.employeeName || '—'}
                    </td>
                    <td className={listTableTdClass('type-body-sm font-mono')} dir="ltr">
                      {formatSarAmount(parseAmount(row.basicPay), locale)}
                    </td>
                    <td className={listTableTdClass('type-body-sm font-mono')} dir="ltr">
                      {formatSarAmount(parseAmount(row.totalEarnings), locale)}
                    </td>
                    <td className={listTableTdClass('type-body-sm font-mono')} dir="ltr">
                      {formatSarAmount(parseAmount(row.totalDeductions), locale)}
                    </td>
                    <td className={listTableTdClass('type-body-sm font-mono font-semibold')} dir="ltr">
                      {formatSarAmount(parseAmount(row.netTotal), locale)}
                    </td>
                    <td className={listTableActionsTdClass()}>
                      <div className={LIST_TABLE_ACTIONS_INNER}>
                        <ActionIconButton
                          label={t('view')}
                          onClick={() => router.push(`/hr/salary-slips/${row.id}`)}
                          className="hover:text-hisabi-primary"
                        >
                          <Eye className="size-5" aria-hidden />
                        </ActionIconButton>
                        <ActionIconButton
                          label={t('actionSendEmail')}
                          onClick={() => setSendSheetRow(row)}
                          className="hover:text-hisabi-primary"
                        >
                          <Send className="size-5" aria-hidden />
                        </ActionIconButton>
                        <ActionIconButton
                          label={t('actionPrint')}
                          onClick={() => handlePrint(row)}
                          className="hover:text-hisabi-primary"
                        >
                          <Printer className="size-5" aria-hidden />
                        </ActionIconButton>
                        <ActionIconButton
                          label={t('downloadPdf')}
                          disabled={downloadPendingId === row.id}
                          onClick={() => void handleDownloadPdf(row)}
                          className="hover:text-hisabi-secondary disabled:opacity-50"
                        >
                          {downloadPendingId === row.id ? (
                            <Loader2 className="size-5 animate-spin" aria-hidden />
                          ) : (
                            <Download className="size-5" aria-hidden />
                          )}
                        </ActionIconButton>
                        <ActionIconButton
                          label={t('edit')}
                          onClick={() =>
                            router.push(`/hr/salary-slips/${row.id}/edit`)
                          }
                          className="hover:text-hisabi-secondary"
                        >
                          <Pencil className="size-5" aria-hidden />
                        </ActionIconButton>
                        <ActionIconButton
                          label={t('delete')}
                          onClick={() => {
                            setPendingDelete({
                              id: row.id,
                              voucherNumber: row.voucherNumber,
                            })
                            setDeleteModal(true)
                          }}
                          className="hover:text-hisabi-error"
                        >
                          <Trash2 className="size-5" aria-hidden />
                        </ActionIconButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ListTablePagination
          total={total}
          safePage={safePage}
          totalPages={totalPages}
          recordsLabel={tList('records')}
          onPageChange={setPage}
        />
      </div>

      <SalarySlipSendSheet
        open={Boolean(sendSheetRow)}
        onOpenChange={(open) => {
          if (!open) setSendSheetRow(null)
        }}
        voucherNumber={String(sendSheetRow?.voucherNumber ?? '')}
        employeeName={String(sendSheetRow?.employeeName ?? '')}
        netPay={formatSarAmount(parseAmount(sendSheetRow?.netTotal ?? '0'), locale)}
        companyName={companyName}
        defaultToEmail={sendSheetRow ? employeeDefaultEmail(sendSheetRow) : ''}
        defaultSubject={
          sendSheetRow
            ? t('sendSalarySlipSheetDefaultSubject', {
                employee: String(sendSheetRow.employeeName ?? ''),
                voucher: String(sendSheetRow.voucherNumber ?? ''),
              })
            : ''
        }
        defaultMessage={t('sendSalarySlipSheetDefaultMessage')}
        onSend={handleSendSalarySlipEmail}
      />

      <HisabiStatusModal
        open={deleteModal}
        onOpenChange={setDeleteModal}
        variant="error"
        title={t('deleteTitle')}
        description={t('deleteDescription', {
          name: pendingDelete?.voucherNumber ?? '',
        })}
        primaryLabel={t('deleteConfirm')}
        onPrimary={handleDelete}
        primaryPending={deletePending}
        secondaryLabel={t('deleteCancel')}
        onSecondary={() => {
          setDeleteModal(false)
          setPendingDelete(null)
        }}
      />

      <HisabiStatusModal
        open={bulkDeleteModal}
        onOpenChange={setBulkDeleteModal}
        variant="error"
        title={tList('bulkDeleteConfirmTitle')}
        description={tList('bulkDeleteConfirmDescription', { count: selectedCount })}
        primaryLabel={tList('bulkDeleteConfirmDelete')}
        onPrimary={handleBulkDelete}
        primaryPending={bulkDeletePending}
        secondaryLabel={tList('bulkDeleteConfirmCancel')}
        onSecondary={() => setBulkDeleteModal(false)}
      />
    </div>
  )
}

/** @param {{ hasBusinessProfile?: boolean }} props */
export function SalarySlipsListView({ hasBusinessProfile }) {
  if (hasBusinessProfile !== true) {
    return <SalarySlipsListWithoutCompanyProfile />
  }
  return <SalarySlipsListWithCompanyProfile />
}
