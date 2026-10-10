'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { EditRestaurantSheet } from './edit-restaurant-sheet'
import { ViewRestaurantSheet } from './view-restaurant-sheet'
import { AppLoader } from '@/components/app-loader'
import { HisabiSpinner } from '@/components/hisabi-spinner'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { ZatcaOnboardingModal } from '@/components/app-shell/zatca-onboarding-modal'
import { ListBulkActionsBar } from '@/components/list-views/list-bulk-actions-bar'
import { ListRowSelectionCheckbox } from '@/components/list-views/list-row-selection-checkbox'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { ActionIconButton } from '@/components/row-actions/action-icon-button'
import {
  AuthApiError,
  authDelete,
  authGet,
  authPatch,
} from '@/lib/api/auth-client'
import { companyDisplayNameForLocale } from '@/lib/business-profile/company-display-name'
import { bulkDeleteRows } from '@/lib/list-views/bulk-delete-rows'
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
import { useDebouncedValue } from '@/lib/list-views/use-debounced-value'
import { useListRowSelection } from '@/lib/list-views/use-list-row-selection'
import { Link, useRouter } from '@/i18n/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

/** @param {string} name */
function initialsFromName(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || '?'
}

const rowOutlineCtaClassName =
  'type-label-sm text-hisabi-teal hover:bg-hisabi-teal-container/15 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hisabi-teal-container/40 px-hisabi-sm py-1.5 font-semibold whitespace-nowrap transition-colors'

/**
 * Hisabi Companies list styling — restaurants for this ADMIN account.
 */
export function RestaurantsListView() {
  const t = useTranslations('Restaurants')
  const tList = useTranslations('ListViews')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)

  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)

  const [viewOpen, setViewOpen] = useState(false)
  const [viewProfileId, setViewProfileId] = useState(
    /** @type {string | null} */ (null),
  )
  const [viewIsActive, setViewIsActive] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editProfileId, setEditProfileId] = useState(
    /** @type {string | null} */ (null),
  )

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [restaurantPendingDelete, setRestaurantPendingDelete] = useState(
    /** @type {{ id: string, companyNameAr: string, companyNameEn?: string | null } | null} */ (
      null
    ),
  )
  const [deletePending, setDeletePending] = useState(false)
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)

  const [zatcaModalOpen, setZatcaModalOpen] = useState(false)
  const [zatcaProfileId, setZatcaProfileId] = useState(
    /** @type {string | null} */ (null),
  )

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['auth', 'business-profiles'],
    queryFn: () => authGet('/business-profiles'),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const listBusy = isPending || isFetching
  const allRows = Array.isArray(data?.profiles) ? data.profiles : []

  const rows = useMemo(() => {
    if (!debouncedSearch) return allRows
    const q = debouncedSearch.toLowerCase()
    return allRows.filter((p) => {
      const name = companyDisplayNameForLocale(p, locale).toLowerCase()
      const ar = String(p.companyNameAr ?? '').toLowerCase()
      const en = String(p.companyNameEn ?? '').toLowerCase()
      const vat = String(p.vatNumber ?? '').toLowerCase()
      const cr = String(p.crNumber ?? '').toLowerCase()
      return (
        name.includes(q) ||
        ar.includes(q) ||
        en.includes(q) ||
        vat.includes(q) ||
        cr.includes(q)
      )
    })
  }, [allRows, debouncedSearch, locale])

  const {
    selectedIds,
    selectedCount,
    allPageSelected,
    somePageSelected,
    toggleRow,
    toggleAllOnPage,
    clearSelection,
    isSelected,
  } = useListRowSelection(rows)

  useEffect(() => {
    clearSelection()
  }, [debouncedSearch, clearSelection])

  const activateMutation = useMutation({
    mutationFn: (/** @type {string} */ businessProfileId) =>
      authPatch('/business-profiles/active', { businessProfileId }),
    onSuccess: (res) => {
      const u = res?.user
      if (u) {
        queryClient.setQueryData(['auth', 'me'], { user: u })
        setUser(u)
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'business-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'business-profile'] })
      queryClient.invalidateQueries({ queryKey: ['menu'] })
      queryClient.invalidateQueries({ queryKey: ['pos'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success(t('toastRestaurantActivated'))
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  function openZatcaForRow(/** @type {{ id: string }} */ row) {
    setZatcaProfileId(row.id)
    setZatcaModalOpen(true)
  }

  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) =>
      authDelete(`/business-profiles/${id}`),
    onSuccess: async (res, removedId) => {
      toast.success(t('toastDeleted'))
      const u = res?.user
      if (u) {
        queryClient.setQueryData(['auth', 'me'], { user: u })
        setUser(u)
      }
      await queryClient.invalidateQueries({
        queryKey: ['auth', 'business-profiles'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['auth', 'business-profile'],
      })
      setDeleteModalOpen(false)
      setRestaurantPendingDelete(null)
      if (viewProfileId === removedId) {
        setViewOpen(false)
        setViewProfileId(null)
      }
      if (editProfileId === removedId) {
        setEditOpen(false)
        setEditProfileId(null)
      }
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  async function handleConfirmDelete() {
    if (!restaurantPendingDelete) return
    setDeletePending(true)
    try {
      await deleteMutation.mutateAsync(restaurantPendingDelete.id)
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
        (id) => `/business-profiles/${id}`,
      )
      await queryClient.invalidateQueries({
        queryKey: ['auth', 'business-profiles'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['auth', 'business-profile'],
      })
      const me = await authGet('/me')
      if (me?.user) {
        queryClient.setQueryData(['auth', 'me'], { user: me.user })
        setUser(me.user)
      }
      setBulkDeleteModalOpen(false)
      clearSelection()
      for (const id of deleted) {
        if (viewProfileId === id) {
          setViewOpen(false)
          setViewProfileId(null)
        }
        if (editProfileId === id) {
          setEditOpen(false)
          setEditProfileId(null)
        }
      }
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

  const pendingDeleteName = restaurantPendingDelete
    ? companyDisplayNameForLocale(restaurantPendingDelete, locale) ||
      t('unnamed')
    : ''

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
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('title')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('subtitle')}
          </p>
        </div>
        <Link
          href="/restaurants/create"
          className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
        >
          <Plus className="size-5 shrink-0" aria-hidden />
          {t('addRestaurant')}
        </Link>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('loadingList')
              : t('showingCount', {
                  shown: rows.length,
                  total: allRows.length,
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
          <table className={cn(LIST_TABLE_BASE, 'min-w-[960px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={LIST_TABLE_TH_CHECKBOX}>
                  <ListRowSelectionCheckbox
                    checked={allPageSelected}
                    indeterminate={somePageSelected && !allPageSelected}
                    onChange={toggleAllOnPage}
                    ariaLabel={tList('selectAllOnPage')}
                    disabled={listBusy || rows.length === 0}
                  />
                </th>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colRestaurant')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colVat')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colCr')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colActive')}
                </th>
                <th scope="col" className={listTableThClass('min-w-[220px]')}>
                  {t('colZatca')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colActions')}
                </th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {listBusy ? (
                <tr>
                  <td colSpan={7} className="px-hisabi-lg py-16 text-center">
                    <AppLoader size="lg" label={t('loadingList')} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {debouncedSearch ? t('noSearchResults') : t('empty')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const rowLabel = companyDisplayNameForLocale(row, locale)
                  return (
                    <tr key={row.id} className={LIST_TABLE_ROW}>
                      <td className={LIST_TABLE_TD_CHECKBOX}>
                        <ListRowSelectionCheckbox
                          checked={isSelected(row.id)}
                          onChange={() => toggleRow(row.id)}
                          ariaLabel={tList('selectRow')}
                        />
                      </td>
                      <td className={listTableTdClass(undefined, true)}>
                        <div className="flex items-center gap-hisabi-md">
                          <div className="bg-hisabi-surface-container-high text-hisabi-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                            {initialsFromName(rowLabel)}
                          </div>
                          <span
                            className="type-body-md font-bold text-hisabi-on-surface"
                            dir={locale === 'ar' ? 'rtl' : 'ltr'}
                          >
                            {rowLabel || t('unnamed')}
                          </span>
                        </div>
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface',
                        )}
                      >
                        <span dir="ltr" className="inline-block">
                          {row.vatNumber || '—'}
                        </span>
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface',
                        )}
                      >
                        <span dir="ltr" className="inline-block">
                          {row.crNumber || '—'}
                        </span>
                      </td>
                      <td className={listTableTdClass('max-w-[14rem] align-middle')}>
                        {row.isActive ? (
                          <span className="type-label-sm inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                            {t('badgeActive')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={
                              listBusy ||
                              (activateMutation.isPending &&
                                activateMutation.variables === row.id)
                            }
                            onClick={() => activateMutation.mutate(row.id)}
                            className={cn(
                              rowOutlineCtaClassName,
                              'gap-hisabi-sm disabled:cursor-not-allowed disabled:opacity-50',
                            )}
                          >
                            {activateMutation.isPending &&
                            activateMutation.variables === row.id ? (
                              <HisabiSpinner size="inline" />
                            ) : null}
                            {t('makeActive')}
                          </button>
                        )}
                      </td>
                      <td className={listTableTdClass('min-w-[220px] align-middle')}>
                        <div className="flex max-w-none flex-nowrap items-center justify-start gap-hisabi-md">
                          {row.zatcaCompleted ? (
                            <span className="type-label-sm inline-flex shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-green-800">
                              {t('zatcaStatusCompleted')}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openZatcaForRow(row)}
                              className={rowOutlineCtaClassName}
                            >
                              {t('completeZatcaSetup')}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={listTableActionsTdClass()}>
                        <div className={LIST_TABLE_ACTIONS_INNER}>
                          <ActionIconButton
                            label={t('actionView')}
                            onClick={() => {
                              setViewProfileId(row.id)
                              setViewIsActive(row.isActive)
                              setViewOpen(true)
                            }}
                            className="hover:text-hisabi-primary"
                          >
                            <Eye className="size-5" />
                          </ActionIconButton>
                          <ActionIconButton
                            label={t('actionEdit')}
                            onClick={() => {
                              setEditProfileId(row.id)
                              setEditOpen(true)
                            }}
                            className="hover:text-hisabi-secondary"
                          >
                            <Pencil className="size-5" />
                          </ActionIconButton>
                          <ActionIconButton
                            label={t('actionDelete')}
                            onClick={() => {
                              setRestaurantPendingDelete(row)
                              setDeleteModalOpen(true)
                            }}
                            className="hover:text-hisabi-error"
                          >
                            <Trash2 className="size-5" />
                          </ActionIconButton>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ViewRestaurantSheet
        open={viewOpen}
        profileId={viewProfileId}
        isActive={viewIsActive}
        onOpenChange={(open) => {
          setViewOpen(open)
          if (!open) {
            window.setTimeout(() => setViewProfileId(null), 380)
          }
        }}
        onRequestEdit={() => {
          if (!viewProfileId) return
          setEditProfileId(viewProfileId)
          setEditOpen(true)
          setViewOpen(false)
        }}
      />

      <EditRestaurantSheet
        open={editOpen}
        profileId={editProfileId}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) {
            window.setTimeout(() => setEditProfileId(null), 380)
          }
        }}
        onSaved={() => {
          toast.success(t('toastUpdated'))
          queryClient.invalidateQueries({
            queryKey: ['auth', 'business-profiles'],
          })
          router.refresh()
        }}
      />

      <HisabiStatusModal
        open={deleteModalOpen && !!restaurantPendingDelete}
        onOpenChange={(open) => {
          setDeleteModalOpen(open)
          if (!open) setRestaurantPendingDelete(null)
        }}
        variant="error"
        title={t('deleteConfirmTitle')}
        description={
          restaurantPendingDelete
            ? t('deleteConfirmDescription', { name: pendingDeleteName })
            : undefined
        }
        primaryLabel={t('deleteConfirmDelete')}
        primaryPending={deletePending}
        onPrimary={() => {
          void handleConfirmDelete()
        }}
        secondaryLabel={t('deleteConfirmCancel')}
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

      <ZatcaOnboardingModal
        open={zatcaModalOpen}
        onOpenChange={(open) => {
          setZatcaModalOpen(open)
          if (!open) setZatcaProfileId(null)
        }}
        businessProfileId={zatcaProfileId}
      />
    </div>
  )
}
