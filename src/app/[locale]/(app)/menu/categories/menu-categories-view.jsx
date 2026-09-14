'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, Power } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { MenuCategoryDeactivateDialog } from './menu-category-deactivate-dialog'
import { MenuCategoryEditModal } from './menu-category-edit-modal'
import { AppLoader } from '@/components/app-loader'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { ListBulkActionsBar } from '@/components/list-views/list-bulk-actions-bar'
import { ListRowSelectionCheckbox } from '@/components/list-views/list-row-selection-checkbox'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { ActionIconButton } from '@/components/row-actions/action-icon-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { AuthApiError, authDelete, authGet, authPatch, authPost } from '@/lib/api/auth-client'
import {
  shouldEnableBilingualTranslate,
  useBilingualFieldOrigin,
} from '@/lib/i18n/use-bilingual-field-origin'
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
import { useListRowSelection } from '@/lib/list-views/use-list-row-selection'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-hisabi-sm outline-none transition-shadow focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10'

const PAIR_KEY = 'menu.category.name'

export function MenuCategoriesView() {
  const t = useTranslations('Menu')
  const tList = useTranslations('ListViews')
  const tBi = useTranslations('BilingualInvoiceCompany')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const ability = useAppAbility()
  const canCreateCategory = ability.can('create', 'MenuCategory')
  const canUpdateCategory = ability.can('update', 'MenuCategory')
  const canDeleteCategory = ability.can('delete', 'MenuCategory')
  const showCategoryActions = canUpdateCategory || canDeleteCategory
  const bilingualFieldOrigin = useBilingualFieldOrigin()
  const { origin, reportUserInput, markAutoFilled, consumeAutoFillSkip, resetOrigin } =
    bilingualFieldOrigin

  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [formError, setFormError] = useState('')
  const [editCategory, setEditCategory] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [deactivateTarget, setDeactivateTarget] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)

  const { loading: loadingNameAr } = useGeminiArSuggestion(
    nameEn,
    (ar) => {
      markAutoFilled('ar', PAIR_KEY, ar)
      setNameAr(ar.slice(0, 80))
    },
    {
      enabled: shouldEnableBilingualTranslate(origin, 'en', nameAr),
      shouldSkip: (trimmed) => consumeAutoFillSkip(PAIR_KEY, 'en', trimmed),
    },
  )
  const { loading: loadingNameEn } = useGeminiEnSuggestion(
    nameAr,
    (en) => {
      markAutoFilled('en', PAIR_KEY, en)
      setNameEn(en.slice(0, 80))
    },
    {
      enabled: shouldEnableBilingualTranslate(origin, 'ar', nameEn),
      shouldSkip: (trimmed) => consumeAutoFillSkip(PAIR_KEY, 'ar', trimmed),
    },
  )

  const { data, isPending } = useQuery({
    queryKey: ['menu', 'categories', 'all'],
    queryFn: async () => {
      const d = await authGet('/menu/categories?active=all')
      return d.categories ?? []
    },
  })

  const createMutation = useMutation({
    mutationFn: () =>
      authPost('/menu/categories', {
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t('categoryAdded'))
      setNameAr('')
      setNameEn('')
      setFormError('')
      resetOrigin()
      queryClient.invalidateQueries({ queryKey: ['menu', 'categories'] })
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  const activateMutation = useMutation({
    mutationFn: (/** @type {{ id: string }} */ row) =>
      authPatch(`/menu/categories/${row.id}`, { active: true }),
    onSuccess: () => {
      toast.success(t('categoryUpdated'))
      queryClient.invalidateQueries({ queryKey: ['menu', 'categories'] })
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: async (
      /** @type {{ id: string, deactivateItems: boolean }} */ payload,
    ) => {
      const qs = payload.deactivateItems ? '?deactivateItems=true' : ''
      return authDelete(`/menu/categories/${payload.id}${qs}`)
    },
    onSuccess: (data) => {
      toast.success(
        data?.deactivatedItems
          ? t('categoryDeactivatedWithItems')
          : t('categoryDeactivated'),
      )
      setDeactivateTarget(null)
      queryClient.invalidateQueries({ queryKey: ['menu', 'categories'] })
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const categories = data ?? []
  const selectableRows = useMemo(
    () => categories.filter((cat) => cat.active === true),
    [categories],
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

  const canAdd = Boolean(nameAr.trim()) && !createMutation.isPending
  const actionsBusy =
    activateMutation.isPending || deactivateMutation.isPending

  function handleAdd() {
    setFormError('')
    if (!nameAr.trim()) {
      setFormError(t('validationNameAr'))
      return
    }
    createMutation.mutate()
  }

  function categoryLabel(cat) {
    return locale === 'ar' ? cat.nameAr : cat.nameEn?.trim() || cat.nameAr
  }

  async function handleBulkDelete() {
    setBulkDeletePending(true)
    try {
      const { deleted, failed } = await bulkDeleteRows(
        [...selectedIds],
        (id) => `/menu/categories/${id}`,
      )
      await queryClient.invalidateQueries({ queryKey: ['menu', 'categories'] })
      await queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
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
    } finally {
      setBulkDeletePending(false)
    }
  }

  return (
    <div className="mx-auto max-w-hisabi-container">
      <div className="mb-hisabi-xl space-y-1">
        <h1 className="type-headline-xl text-hisabi-on-surface">
          {t('categoriesTitle')}
        </h1>
        <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
          {t('categoriesSubtitle')}
        </p>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        {canCreateCategory ? (
          <div className="space-y-hisabi-md border-b border-hisabi-outline-variant/20 bg-slate-50/50 p-hisabi-md">
            {formError ? (
              <p className="type-body-sm text-hisabi-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div
              dir="ltr"
              className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            >
              <div className="min-w-0 space-y-hisabi-xs text-start">
                <label
                  className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                  htmlFor="cat-page-en"
                >
                  {t('categoryNameEn')}
                  {loadingNameEn ? (
                    <Loader2
                      className="text-hisabi-teal size-4 shrink-0 animate-spin"
                      aria-label={tBi('translating')}
                    />
                  ) : null}
                </label>
                <input
                  id="cat-page-en"
                  value={nameEn}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, 80)
                    reportUserInput('en', PAIR_KEY, {
                      otherFieldEmpty: !nameAr.trim(),
                    })
                    setNameEn(next)
                  }}
                  placeholder={t('categoryNameEnPlaceholder')}
                  className={fieldClass}
                  dir="ltr"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (canAdd) handleAdd()
                    }
                  }}
                />
              </div>
              <div className="min-w-0 space-y-hisabi-xs text-start">
                <label
                  className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                  htmlFor="cat-page-ar"
                >
                  {t('categoryNameAr')}
                  <RequiredMark />
                  {loadingNameAr ? (
                    <Loader2
                      className="text-hisabi-teal size-4 shrink-0 animate-spin"
                      aria-label={tBi('translating')}
                    />
                  ) : null}
                </label>
                <input
                  id="cat-page-ar"
                  value={nameAr}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, 80)
                    reportUserInput('ar', PAIR_KEY, {
                      otherFieldEmpty: !nameEn.trim(),
                    })
                    setNameAr(next)
                  }}
                  placeholder={t('categoryNameArPlaceholder')}
                  className={fieldClass}
                  dir="rtl"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (canAdd) handleAdd()
                    }
                  }}
                />
              </div>
              <AuthSubmitButton
                type="button"
                variant="gold"
                pending={createMutation.isPending}
                disabled={!canAdd}
                className="min-h-[44px] w-full shrink-0 rounded-xl px-hisabi-lg py-2.5 sm:w-auto"
                onClick={handleAdd}
              >
                <Plus className="size-5 shrink-0" aria-hidden />
                {t('addCategory')}
              </AuthSubmitButton>
            </div>
          </div>
        ) : null}

        {canDeleteCategory ? (
          <ListBulkActionsBar
            selectedCount={selectedCount}
            onDelete={() => setBulkDeleteModalOpen(true)}
            onClear={clearSelection}
            deletePending={bulkDeletePending}
          />
        ) : null}

        <div className={LIST_TABLE_SCROLL_WRAP}>
          {isPending ? (
            <div className="flex justify-center py-hisabi-xxl">
              <AppLoader />
            </div>
          ) : (
            <table className={cn(LIST_TABLE_BASE, 'min-w-[520px]')}>
              <thead>
                <tr className={LIST_TABLE_HEAD_ROW}>
                  {canDeleteCategory ? (
                    <th scope="col" className={LIST_TABLE_TH_CHECKBOX}>
                      <ListRowSelectionCheckbox
                        checked={allPageSelected}
                        indeterminate={somePageSelected && !allPageSelected}
                        onChange={toggleAllOnPage}
                        ariaLabel={tList('selectAllOnPage')}
                        disabled={isPending || selectableRows.length === 0}
                      />
                    </th>
                  ) : null}
                  <th scope="col" className={listTableThClass(undefined, true)}>
                    {t('colName')}
                  </th>
                  <th scope="col" className={listTableThClass()}>
                    {t('colStatus')}
                  </th>
                  <th scope="col" className={listTableThClass()}>
                    {t('colItems')}
                  </th>
                  {showCategoryActions ? (
                    <th scope="col" className={listTableThClass()}>
                      {t('colActions')}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className={LIST_TABLE_BODY}>
                {categories.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        3 +
                        (canDeleteCategory ? 1 : 0) +
                        (showCategoryActions ? 1 : 0)
                      }
                      className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                    >
                      {t('noCategories')}
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => {
                    const label = categoryLabel(cat)
                    const rowSelectable = cat.active === true
                    return (
                      <tr key={cat.id} className={LIST_TABLE_ROW}>
                        {canDeleteCategory ? (
                          <td className={LIST_TABLE_TD_CHECKBOX}>
                            <ListRowSelectionCheckbox
                              checked={isSelected(cat.id)}
                              onChange={() => toggleRow(cat.id)}
                              ariaLabel={tList('selectRow')}
                              disabled={actionsBusy || !rowSelectable}
                            />
                          </td>
                        ) : null}
                        <td
                          className={listTableTdClass(
                            'type-body-sm text-hisabi-on-surface font-medium',
                            true,
                          )}
                        >
                          <span
                            className={cn(
                              !cat.active && 'text-hisabi-outline line-through',
                            )}
                          >
                            {label}
                          </span>
                        </td>
                        <td className={listTableTdClass()}>
                          <span
                            className={cn(
                              'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                              cat.active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-600',
                            )}
                          >
                            {cat.active
                              ? t('statusActive')
                              : t('statusInactive')}
                          </span>
                        </td>
                        <td
                          className={listTableTdClass(
                            'type-body-sm text-hisabi-on-surface',
                          )}
                        >
                          {typeof cat.itemCount === 'number' ? cat.itemCount : '—'}
                        </td>
                        {showCategoryActions ? (
                          <td className={listTableActionsTdClass()}>
                            <div className={LIST_TABLE_ACTIONS_INNER}>
                              {canUpdateCategory ? (
                                <ActionIconButton
                                  label={t('edit')}
                                  onClick={() => setEditCategory(cat)}
                                  className="hover:text-hisabi-secondary"
                                >
                                  <Pencil className="size-5" aria-hidden />
                                </ActionIconButton>
                              ) : null}
                              {canUpdateCategory ? (
                                <ActionIconButton
                                  label={
                                    cat.active ? t('deactivate') : t('activate')
                                  }
                                  disabled={actionsBusy}
                                  onClick={() => {
                                    if (cat.active) {
                                      setDeactivateTarget(cat)
                                      return
                                    }
                                    activateMutation.mutate(cat)
                                  }}
                                  className={
                                    cat.active
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
          )}
        </div>
      </div>

      <MenuCategoryEditModal
        open={Boolean(editCategory)}
        onOpenChange={(next) => {
          if (!next) setEditCategory(null)
        }}
        category={
          editCategory
            ? {
                id: String(editCategory.id),
                nameAr: String(editCategory.nameAr ?? ''),
                nameEn:
                  typeof editCategory.nameEn === 'string'
                    ? editCategory.nameEn
                    : null,
              }
            : null
        }
      />

      <MenuCategoryDeactivateDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(next) => {
          if (!next) setDeactivateTarget(null)
        }}
        categoryName={
          deactivateTarget ? categoryLabel(deactivateTarget) : ''
        }
        activeItemCount={
          typeof deactivateTarget?.activeItemCount === 'number'
            ? deactivateTarget.activeItemCount
            : 0
        }
        pending={deactivateMutation.isPending}
        onDeactivateCategoryOnly={() => {
          if (!deactivateTarget) return
          deactivateMutation.mutate({
            id: String(deactivateTarget.id),
            deactivateItems: false,
          })
        }}
        onDeactivateWithItems={() => {
          if (!deactivateTarget) return
          deactivateMutation.mutate({
            id: String(deactivateTarget.id),
            deactivateItems: true,
          })
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
