'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Eye,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import { ListBulkActionsBar } from '@/components/list-views/list-bulk-actions-bar'
import { ListPageFilterSelect } from '@/components/list-views/list-page-filter-select'
import { ListRowSelectionCheckbox } from '@/components/list-views/list-row-selection-checkbox'
import { ListTablePagination } from '@/components/list-views/list-table-pagination'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { ActionIconButton } from '@/components/row-actions/action-icon-button'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { PromoteEmployeeSheet } from '@/components/hr/promote-employee-sheet'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { Link, useRouter } from '@/i18n/navigation'
import { authDelete, authGet } from '@/lib/api/auth-client'
import { bulkDeleteRows } from '@/lib/list-views/bulk-delete-rows'
import { buildListQueryUrl } from '@/lib/list-views/build-list-query-url'
import { LIST_PAGE_HEADER_ACTIONS } from '@/lib/list-views/list-page-toolbar-styles'
import { useDebouncedValue } from '@/lib/list-views/use-debounced-value'
import { useListPageFromUrl, useResetListPageOnChange } from '@/lib/list-views/use-list-page-from-url'
import { useListStatsQuery } from '@/lib/list-views/use-list-stats-query'
import { useListRowSelection } from '@/lib/list-views/use-list-row-selection'
import { useServerPaginatedRows } from '@/lib/list-views/use-server-paginated-rows'
import { roleNameMessageKey } from '@/lib/hr/employees/role-name-message-key'
import { formatSarAmount } from '@/lib/settings/format-helpers'
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
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

/** @param {string | undefined} status */
function statusBadgeClass(status) {
  return status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
}

/** @param {unknown} row */
/** @param {unknown} row */
function formatEmployeeRoles(row, t) {
  const names = Array.isArray(row?.roleNames)
    ? row.roleNames.map((n) => String(n ?? '').trim()).filter(Boolean)
    : []
  if (names.length === 0) return '—'
  return names
    .map((n) => {
      const key = roleNameMessageKey(n)
      return key ? t(key) : n
    })
    .join(', ')
}

function EmployeesListWithoutCompanyProfile() {
  const t = useTranslations('HR')
  return (
    <div className="mx-auto max-w-hisabi-container">
      <NoCompanyProfileBanner className="mb-hisabi-lg" />
      <div className="pointer-events-none select-none opacity-40">
        <div className="mb-hisabi-xl space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('employeesTitle')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('employeesSubtitle')}
          </p>
        </div>
      </div>
    </div>
  )
}

function EmployeesListWithCompanyProfile() {
  const t = useTranslations('HR')
  const tList = useTranslations('ListViews')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const ability = useAppAbility()
  const canCreateEmployee = ability.can('create', 'Employee')
  const canUpdateEmployee = ability.can('update', 'Employee')
  const canDeleteEmployee = ability.can('delete', 'Employee')
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const prevActiveProfileRef = useRef(
    /** @type {string | null | undefined} */ (undefined),
  )

  const [deleteModal, setDeleteModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(
    /** @type {{ id: string, name: string } | null} */ (null),
  )
  const [deletePending, setDeletePending] = useState(false)
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [pendingPromote, setPendingPromote] = useState(
    /** @type {{ id: string, name: string } | null} */ (null),
  )
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput)
  const [statusFilter, setStatusFilter] = useState('all')
  const { page, setPage, resetPage } = useListPageFromUrl()
  const pageSize = 10

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['hr-employees', statusFilter, debouncedSearch, page, pageSize, activeBusinessProfileId],
    queryFn: async () =>
      authGet(
        buildListQueryUrl('/hr/employees', {
          status: statusFilter,
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

  useResetListPageOnChange(resetPage, [debouncedSearch, statusFilter])

  useEffect(() => {
    const prev = prevActiveProfileRef.current
    prevActiveProfileRef.current = activeBusinessProfileId
    if (prev === undefined) return
    if (prev === activeBusinessProfileId) return
    resetPage()
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
  }, [debouncedSearch, statusFilter, page, activeBusinessProfileId, clearSelection])

  const { data: statsData } = useListStatsQuery({
    queryKey: ['hr-employees', 'stats', activeBusinessProfileId],
    path: '/hr/employees',
    fetcher: authGet,
    enabled: Boolean(activeBusinessProfileId),
  })

  const stats = statsData ?? { total: 0, activeCount: 0 }

  async function handleDelete() {
    if (!pendingDelete) return
    setDeletePending(true)
    try {
      await authDelete(`/hr/employees/${pendingDelete.id}`)
      toast.success(t('employeeDeleted'))
      await queryClient.invalidateQueries({ queryKey: ['hr-employees'] })
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
        (id) => `/hr/employees/${id}`,
      )
      await queryClient.invalidateQueries({ queryKey: ['hr-employees'] })
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
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('employeesTitle')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('employeesSubtitle')}
          </p>
        </div>
        <div className={LIST_PAGE_HEADER_ACTIONS}>
          <ListPageFilterSelect
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              resetPage()
            }}
            aria-label={t('colStatus')}
          >
            <option value="all">{t('filterAllStatuses')}</option>
            <option value="active">{t('statusActive')}</option>
            <option value="inactive">{t('statusInactive')}</option>
          </ListPageFilterSelect>
          {canCreateEmployee ? (
            <Link
              href="/hr/employees/add"
              className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
            >
              <Plus className="size-5 shrink-0" aria-hidden />
              {t('addEmployee')}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mb-hisabi-xl grid grid-cols-1 gap-hisabi-lg sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white p-hisabi-lg shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-hisabi-md flex items-start justify-between">
            <div className="rounded-lg bg-hisabi-surface-container-low p-2 text-hisabi-on-surface-variant">
              <Users className="size-5" aria-hidden />
            </div>
            <span className="type-label-sm font-bold uppercase tracking-wider text-hisabi-outline">
              {t('statTotal')}
            </span>
          </div>
          <p className="type-headline-md mb-1 text-hisabi-primary">{stats.total}</p>
          <p className="type-body-sm text-hisabi-on-surface-variant">{t('statTotalEmployees')}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white p-hisabi-lg shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-hisabi-md flex items-start justify-between">
            <div className="rounded-lg bg-hisabi-surface-container-low p-2 text-hisabi-on-surface-variant">
              <Users className="size-5" aria-hidden />
            </div>
            <span className="type-label-sm font-bold uppercase tracking-wider text-hisabi-outline">
              {t('statActive')}
            </span>
          </div>
          <p className="type-headline-md mb-1 text-hisabi-primary">{stats.activeCount}</p>
          <p className="type-body-sm text-hisabi-on-surface-variant">{t('statusActive')}</p>
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={`${pageRows.length} / ${total} ${t('records')}`}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchEmployeesPlaceholder')}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          {canDeleteEmployee ? (
            <ListBulkActionsBar
              selectedCount={selectedCount}
              onDelete={() => setBulkDeleteModalOpen(true)}
              onClear={clearSelection}
              deletePending={bulkDeletePending}
            />
          ) : null}
          <table className={cn(LIST_TABLE_BASE, 'min-w-[960px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                {canDeleteEmployee ? (
                  <th scope="col" className={LIST_TABLE_TH_CHECKBOX}>
                    <ListRowSelectionCheckbox
                      checked={allPageSelected}
                      indeterminate={somePageSelected && !allPageSelected}
                      onChange={toggleAllOnPage}
                      disabled={busy || pageRows.length === 0}
                      ariaLabel={tList('selectAllOnPage')}
                    />
                  </th>
                ) : null}
                <th className={listTableThClass(undefined, true)}>
                  {t('colEmployeeName')}
                </th>
                <th className={listTableThClass()}>{t('colRole')}</th>
                <th className={listTableThClass()}>{t('colSalary')}</th>
                <th className={listTableThClass()}>{t('colStatus')}</th>
                <th className={listTableThClass()}>{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {busy && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + (canDeleteEmployee ? 1 : 0)}
                    className="px-hisabi-lg py-16 text-center"
                  >
                    <Loader2 className="mx-auto size-8 animate-spin text-hisabi-primary" aria-hidden />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + (canDeleteEmployee ? 1 : 0)}
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className={LIST_TABLE_ROW}>
                    {canDeleteEmployee ? (
                      <td className={LIST_TABLE_TD_CHECKBOX}>
                        <ListRowSelectionCheckbox
                          checked={isSelected(row.id)}
                          onChange={() => toggleRow(row.id)}
                          ariaLabel={tList('selectRow')}
                        />
                      </td>
                    ) : null}
                    <td className={listTableTdClass('type-body-sm text-hisabi-on-surface font-semibold', true)}>
                      {row.name}
                    </td>
                    <td className={listTableTdClass('type-body-sm text-hisabi-on-surface')}>
                      {formatEmployeeRoles(row, t)}
                    </td>
                    <td className={listTableTdClass('type-body-sm text-hisabi-on-surface font-mono')} dir="ltr">
                      {formatSarAmount(row.salary, locale)}
                    </td>
                    <td className={listTableTdClass()}>
                      <span
                        className={cn(
                          'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                          statusBadgeClass(row.status),
                        )}
                      >
                        {row.status === 'active' ? t('statusActive') : t('statusInactive')}
                      </span>
                    </td>
                    <td className={listTableActionsTdClass()}>
                      <div className={LIST_TABLE_ACTIONS_INNER}>
                        {canUpdateEmployee ? (
                          <ActionIconButton
                            label={t('promoteEmployee')}
                            onClick={() => {
                              setPendingPromote({ id: row.id, name: row.name })
                              setPromoteOpen(true)
                            }}
                            className="hover:text-hisabi-primary"
                          >
                            <TrendingUp className="size-5" aria-hidden />
                          </ActionIconButton>
                        ) : null}
                        <ActionIconButton
                          label={t('view')}
                          onClick={() => router.push(`/hr/employees/${row.id}`)}
                          className="hover:text-hisabi-primary"
                        >
                          <Eye className="size-5" aria-hidden />
                        </ActionIconButton>
                        {canUpdateEmployee ? (
                          <ActionIconButton
                            label={t('edit')}
                            onClick={() => router.push(`/hr/employees/${row.id}/edit`)}
                            className="hover:text-hisabi-secondary"
                          >
                            <Pencil className="size-5" aria-hidden />
                          </ActionIconButton>
                        ) : null}
                        {canDeleteEmployee ? (
                          <ActionIconButton
                            label={t('delete')}
                            onClick={() => {
                              setPendingDelete({ id: row.id, name: row.name })
                              setDeleteModal(true)
                            }}
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

        <ListTablePagination
          total={total}
          safePage={safePage}
          totalPages={totalPages}
          recordsLabel={t('records')}
          onPageChange={setPage}
        />
      </div>

      <HisabiStatusModal
        open={deleteModal}
        onOpenChange={setDeleteModal}
        variant="error"
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: pendingDelete?.name ?? '' })}
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

      {pendingPromote ? (
        <PromoteEmployeeSheet
          open={promoteOpen}
          onOpenChange={(open) => {
            setPromoteOpen(open)
            if (!open) setPendingPromote(null)
          }}
          employeeId={pendingPromote.id}
          employeeName={pendingPromote.name}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['hr-employees'] })
          }}
        />
      ) : null}
    </div>
  )
}

/** @param {{ hasBusinessProfile?: boolean }} props */
export function EmployeesListView({ hasBusinessProfile }) {
  if (hasBusinessProfile !== true) {
    return <EmployeesListWithoutCompanyProfile />
  }
  return <EmployeesListWithCompanyProfile />
}
