'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AppLoader } from '@/components/app-loader'
import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import { ListBulkActionsBar } from '@/components/list-views/list-bulk-actions-bar'
import { ListPageFilterSelect } from '@/components/list-views/list-page-filter-select'
import { ListRowSelectionCheckbox } from '@/components/list-views/list-row-selection-checkbox'
import { ListTablePagination } from '@/components/list-views/list-table-pagination'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { ActionIconButton } from '@/components/row-actions/action-icon-button'
import { AddEmployeePaymentSheet } from '@/components/hr/add-employee-payment-sheet'
import { EditEmployeePaymentSheet } from '@/components/hr/edit-employee-payment-sheet'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { authDelete, authGet, authPatch } from '@/lib/api/auth-client'
import { bulkDeleteRows } from '@/lib/list-views/bulk-delete-rows'
import { buildListQueryUrl } from '@/lib/list-views/build-list-query-url'
import { LIST_PAGE_HEADER_ACTIONS } from '@/lib/list-views/list-page-toolbar-styles'
import { useDebouncedValue } from '@/lib/list-views/use-debounced-value'
import { useListPageFromUrl, useResetListPageOnChange } from '@/lib/list-views/use-list-page-from-url'
import { useListRowSelection } from '@/lib/list-views/use-list-row-selection'
import { useServerPaginatedRows } from '@/lib/list-views/use-server-paginated-rows'
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
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

/** @param {string | null | undefined} v */
function parseAmount(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function EmployeePaymentsListWithoutCompanyProfile() {
  const t = useTranslations('HR')
  return (
    <div className="mx-auto max-w-hisabi-container">
      <NoCompanyProfileBanner className="mb-hisabi-lg" />
      <div className="pointer-events-none select-none opacity-40">
        <div className="mb-hisabi-xl space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('employeePaymentsTitle')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('employeePaymentsSubtitle')}
          </p>
        </div>
      </div>
    </div>
  )
}

function EmployeePaymentsListWithCompanyProfile() {
  const t = useTranslations('HR')
  const tList = useTranslations('ListViews')
  const locale = useLocale()
  const uiLocale = locale === 'ar' ? 'ar-SA' : 'en-US'
  const queryClient = useQueryClient()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const prevActiveProfileRef = useRef(
    /** @type {string | null | undefined} */ (undefined),
  )

  const [addOpen, setAddOpen] = useState(false)
  const [editRow, setEditRow] = useState(
    /** @type {Record<string, string> | null} */ (null),
  )
  const [deleteModal, setDeleteModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(
    /** @type {Record<string, string> | null} */ (null),
  )
  const [deletePending, setDeletePending] = useState(false)
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput)
  const { page, setPage, resetPage } = useListPageFromUrl()
  const pageSize = 10

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['hr-employee-payments', typeFilter, debouncedSearch, page, pageSize, activeBusinessProfileId],
    queryFn: async () =>
      authGet(
        buildListQueryUrl('/hr/employee-payments', {
          paymentType: typeFilter,
          search: debouncedSearch,
          page,
          limit: pageSize,
        }),
      ),
    enabled: Boolean(activeBusinessProfileId),
  })

  const busy = isPending || isFetching
  const rows = useMemo(
    () => /** @type {Array<Record<string, string>>} */ (data?.items ?? []),
    [data?.items],
  )

  useResetListPageOnChange(resetPage, [debouncedSearch, typeFilter])

  useEffect(() => {
    const prev = prevActiveProfileRef.current
    prevActiveProfileRef.current = activeBusinessProfileId
    if (prev === undefined) return
    if (prev === activeBusinessProfileId) return
    resetPage()
    setAddOpen(false)
    setEditRow(null)
    setDeleteModal(false)
    setPendingDelete(null)
    setBulkDeleteModalOpen(false)
  }, [activeBusinessProfileId, resetPage])

  const { total, totalPages, safePage } = useServerPaginatedRows(page, data?.pagination)
  const pageRows = rows

  const {
    selectedIds,
    selectedCount,
    allPageSelected,
    somePageSelected,
    toggleRow,
    toggleAllOnPage,
    clearSelection,
    isSelected,
  } = useListRowSelection(pageRows)

  useEffect(() => {
    clearSelection()
  }, [page, typeFilter, debouncedSearch, clearSelection])

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

  const paymentMethodLabel = (method) => {
    const map = {
      cash: 'paymentMethodCash',
      bank_transfer: 'paymentMethodBankTransfer',
      cheque: 'paymentMethodCheque',
      other: 'paymentMethodOther',
    }
    const key = map[method]
    return key ? t(key) : method
  }

  async function handleAddSuccess(items) {
    const count = items.length
    toast.success(
      count > 1 ? t('employeePaymentsAdded', { count }) : t('employeePaymentAdded'),
    )
    await queryClient.invalidateQueries({ queryKey: ['hr-employee-payments'] })
  }

  async function handleEditSave(id, form) {
    try {
      await authPatch(`/hr/employee-payments/${id}`, {
        paymentDate: form.paymentDate,
        employeeId: form.employeeId,
        paymentType: form.paymentType,
        payPeriod: form.paymentType === 'salary' ? form.payPeriod : null,
        amount: form.amount.trim(),
        paymentMethod: form.paymentMethod,
        remarks: form.remarks.trim(),
      })
      toast.success(t('employeePaymentUpdated'))
      await queryClient.invalidateQueries({ queryKey: ['hr-employee-payments'] })
    } catch (err) {
      toastAuthApiError(t, err)
      throw err
    }
  }

  async function handleDelete() {
    if (!pendingDelete?.id) return
    setDeletePending(true)
    try {
      await authDelete(`/hr/employee-payments/${pendingDelete.id}`)
      toast.success(t('employeePaymentDeleted'))
      await queryClient.invalidateQueries({ queryKey: ['hr-employee-payments'] })
      setDeleteModal(false)
      setPendingDelete(null)
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setDeletePending(false)
    }
  }

  async function handleBulkDelete() {
    setBulkDeletePending(true)
    try {
      const ids = [...selectedIds]
      const { deleted, failed } = await bulkDeleteRows(
        ids,
        (id) => `/hr/employee-payments/${id}`,
      )
      await queryClient.invalidateQueries({ queryKey: ['hr-employee-payments'] })
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
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('employeePaymentsTitle')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('employeePaymentsSubtitle')}
          </p>
        </div>
        <div className={LIST_PAGE_HEADER_ACTIONS}>
          <ListPageFilterSelect
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value)
              resetPage()
            }}
            aria-label={t('colPaymentType')}
          >
            <option value="all">{t('filterAllTypes')}</option>
            <option value="salary">{t('paymentTypeSalary')}</option>
            <option value="advance">{t('paymentTypeAdvance')}</option>
            <option value="bonus">{t('paymentTypeBonus')}</option>
          </ListPageFilterSelect>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
          >
            <Plus className="size-5 shrink-0" aria-hidden />
            {t('addEmployeePayment')}
          </button>
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={`${pageRows.length} / ${total} ${t('records')}`}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchEmployeePayment')}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <ListBulkActionsBar
            selectedCount={selectedCount}
            onDelete={() => setBulkDeleteModalOpen(true)}
            onClear={clearSelection}
            deletePending={bulkDeletePending}
          />
          <table className={cn(LIST_TABLE_BASE, 'min-w-[900px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={LIST_TABLE_TH_CHECKBOX}>
                  <ListRowSelectionCheckbox
                    checked={allPageSelected}
                    indeterminate={somePageSelected && !allPageSelected}
                    onChange={toggleAllOnPage}
                    disabled={busy || pageRows.length === 0}
                    ariaLabel={tList('selectAllOnPage')}
                  />
                </th>
                <th className={listTableThClass(undefined, true)}>
                  {t('colEmployeeName')}
                </th>
                <th className={listTableThClass()}>{t('colAmount')}</th>
                <th className={listTableThClass()}>{t('colPaymentType')}</th>
                <th className={listTableThClass()}>{t('colPaymentMethod')}</th>
                <th className={listTableThClass()}>{t('colPayPeriod')}</th>
                <th className={listTableThClass()}>{t('colPaymentDate')}</th>
                <th className={listTableThClass()}>{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {busy && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-hisabi-lg py-16 text-center">
                    <AppLoader size="lg" />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
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
                        disabled={busy}
                        ariaLabel={tList('selectRow')}
                      />
                    </td>
                    <td className={listTableTdClass('type-body-sm text-hisabi-on-surface font-semibold', true)}>
                      {row.employeeName || '—'}
                    </td>
                    <td className={listTableTdClass('type-body-sm font-mono')} dir="ltr">
                      {formatSarAmount(parseAmount(row.amount), locale)}
                    </td>
                    <td className={listTableTdClass()}>
                      <span
                        className={cn(
                          'type-label-sm inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold',
                          row.paymentType === 'salary'
                            ? 'bg-green-100 text-green-700'
                            : row.paymentType === 'bonus'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-orange-100 text-orange-800',
                        )}
                      >
                        {row.paymentType === 'salary'
                          ? t('paymentTypeSalary')
                          : row.paymentType === 'bonus'
                            ? t('paymentTypeBonus')
                            : t('paymentTypeAdvance')}
                      </span>
                    </td>
                    <td className={listTableTdClass('type-body-sm text-hisabi-on-surface-variant')}>
                      <span>{paymentMethodLabel(row.paymentMethod)}</span>
                    </td>
                    <td className={listTableTdClass('type-body-sm')} dir="ltr">
                      {row.payPeriod || '—'}
                    </td>
                    <td className={listTableTdClass('type-body-sm')}>
                      {formatDate(row.paymentDate)}
                    </td>
                    <td className={listTableActionsTdClass()}>
                      <div className={LIST_TABLE_ACTIONS_INNER}>
                        <ActionIconButton
                          label={t('edit')}
                          onClick={() => setEditRow(row)}
                          className="hover:text-hisabi-secondary"
                        >
                          <Pencil className="size-5" aria-hidden />
                        </ActionIconButton>
                        <ActionIconButton
                          label={t('delete')}
                          onClick={() => {
                            setPendingDelete(row)
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
          recordsLabel={t('records')}
          onPageChange={setPage}
        />
      </div>

      <AddEmployeePaymentSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleAddSuccess}
      />

      <EditEmployeePaymentSheet
        open={Boolean(editRow)}
        onOpenChange={(open) => {
          if (!open) setEditRow(null)
        }}
        payment={editRow}
        onSave={handleEditSave}
      />

      <HisabiStatusModal
        open={deleteModal}
        onOpenChange={setDeleteModal}
        variant="error"
        title={t('deleteTitle')}
        description={t('deleteDescription', {
          name: pendingDelete?.employeeName ?? '',
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

/** @param {{ hasBusinessProfile?: boolean }} props */
export function EmployeePaymentsListView({ hasBusinessProfile }) {
  if (hasBusinessProfile !== true) {
    return <EmployeePaymentsListWithoutCompanyProfile />
  }
  return <EmployeePaymentsListWithCompanyProfile />
}
