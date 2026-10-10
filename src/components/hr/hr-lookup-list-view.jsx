'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

import { AppLoader } from '@/components/app-loader'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import { ListBulkActionsBar } from '@/components/list-views/list-bulk-actions-bar'
import { ListRowSelectionCheckbox } from '@/components/list-views/list-row-selection-checkbox'
import { ListTablePagination } from '@/components/list-views/list-table-pagination'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { ActionIconButton } from '@/components/row-actions/action-icon-button'
import {
  CRM_SHEET_BACKDROP_CLASS,
  CRM_SHEET_BODY_CLASS,
  CRM_SHEET_CLOSE_BTN_CLASS,
  CRM_SHEET_FOOTER_CANCEL_CLASS,
  CRM_SHEET_FOOTER_CLASS,
  CRM_SHEET_FOOTER_SAVE_CLASS,
  CRM_SHEET_HEADER_CLASS,
  CRM_SHEET_HEADER_SUBTITLE_CLASS,
  CRM_SHEET_HEADER_TITLE_CLASS,
  CRM_SHEET_PANEL_CLASS,
} from '@/components/crm/crm-sheet-classes'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { authDelete, authGet, authPatch, authPost } from '@/lib/api/auth-client'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
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
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

const selectClass =
  'type-body-md text-hisabi-on-surface w-full appearance-none rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 pe-10 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

/** @typedef {'payslipCategory'} HrLookupKind */

/** @param {string | null | undefined} v */
function parseAmount(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/** @param {string | undefined} type */
function payslipTypeBadgeClass(type) {
  return type === 'earning' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
}

/**
 * @param {HrLookupKind} kind
 */
function lookupConfig(kind) {
  const configs = {
    payslipCategory: {
      apiPath: '/hr/payslip-categories',
      queryKey: 'hr-payslip-categories',
      titleKey: 'payslipCategoriesTitle',
      subtitleKey: 'payslipCategoriesSubtitle',
      addKey: 'addPayslipCategory',
      editKey: 'editPayslipCategory',
      addSheetTitleKey: 'addPayslipCategorySheetTitle',
      addSheetSubtitleKey: 'addPayslipCategorySheetSubtitle',
      editSheetTitleKey: 'editPayslipCategorySheetTitle',
      nameField: 'name',
      nameLabelKey: 'colName',
      hasDescription: false,
      hasType: true,
      hasDefaultAmount: true,
      getLabel: (row) => row.name ?? '',
    },
  }
  return configs[kind]
}

/** @returns {Record<string, string>} */
function emptyForm(kind) {
  if (kind === 'payslipCategory') return { name: '', type: 'earning', defaultAmount: '0' }
  return { name: '' }
}

/**
 * @param {HrLookupKind} kind
 * @param {Record<string, string>} row
 */
function rowToForm(kind, row) {
  if (kind === 'payslipCategory') {
    return {
      name: row.name ?? '',
      type: row.type ?? 'earning',
      defaultAmount: row.defaultAmount ?? '0',
    }
  }
  return { name: row.name ?? '' }
}

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   mode: 'add' | 'edit'
 *   kind: HrLookupKind
 *   initialForm?: Record<string, string>
 *   lockIdentityFields?: boolean
 *   onSave: (form: Record<string, string>) => Promise<void>
 * }} props
 */
function LookupSheet({
  open,
  onOpenChange,
  mode,
  kind,
  initialForm,
  lockIdentityFields = false,
  onSave,
}) {
  const t = useTranslations('HR')
  const cfg = lookupConfig(kind)
  const titleId = `lookup-sheet-${kind}-${mode}`
  const [form, setForm] = useState(() => initialForm ?? emptyForm(kind))
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setForm(initialForm ?? emptyForm(kind))
    setFieldErrors({})
  }, [open, initialForm, kind])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
  }

  function validate() {
    /** @type {Record<string, string>} */
    const next = {}
    const primary = cfg.nameField
    if (!String(form[primary] ?? '').trim()) next[primary] = t('validationRequired')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSave() {
    if (!validate()) {
      scrollAfterFieldValidation()
      return
    }
    setSaving(true)
    try {
      await onSave(form)
      onOpenChange(false)
    } catch {
      // parent toast
    } finally {
      setSaving(false)
    }
  }

  const portalEl = typeof document !== 'undefined' ? document.body : null
  if (!open || !portalEl) return null

  const sheetTitle =
    mode === 'add' ? t(cfg.addSheetTitleKey) : t(cfg.editSheetTitleKey)
  const sheetSubtitle =
    mode === 'add' ? t(cfg.addSheetSubtitleKey) : t('editSheetSubtitle')

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label={t('closeSheet')}
        className={CRM_SHEET_BACKDROP_CLASS}
        onClick={() => onOpenChange(false)}
      />
      <div
        className={CRM_SHEET_PANEL_CLASS}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={CRM_SHEET_HEADER_CLASS}>
          <div className="min-w-0 flex-1 text-start">
            <h2 id={titleId} className={CRM_SHEET_HEADER_TITLE_CLASS}>
              {sheetTitle}
            </h2>
            <p className={CRM_SHEET_HEADER_SUBTITLE_CLASS}>{sheetSubtitle}</p>
          </div>
          <button
            type="button"
            className={CRM_SHEET_CLOSE_BTN_CLASS}
            onClick={() => onOpenChange(false)}
            aria-label={t('closeSheet')}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className={cn(CRM_SHEET_BODY_CLASS, 'space-y-hisabi-lg')}>
          <div className="space-y-hisabi-xs">
            <label className="type-label-md text-hisabi-on-surface block">
              {t(cfg.nameLabelKey)}
              <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>
                *
              </span>
            </label>
            <input
              value={form[cfg.nameField] ?? ''}
              onChange={(e) => updateField(cfg.nameField, e.target.value)}
              className={cn(fieldClass, fieldErrors[cfg.nameField] && 'border-hisabi-error')}
              placeholder={t('lookupNamePlaceholder')}
              disabled={lockIdentityFields}
              readOnly={lockIdentityFields}
            />
            {fieldErrors[cfg.nameField] ? (
              <p className="type-body-sm text-hisabi-error">{fieldErrors[cfg.nameField]}</p>
            ) : null}
          </div>

          {cfg.hasDescription ? (
            <div className="space-y-hisabi-xs">
              <label className="type-label-md text-hisabi-on-surface block">
                {t('colDescription')}
              </label>
              <textarea
                rows={3}
                value={form.description ?? ''}
                onChange={(e) => updateField('description', e.target.value)}
                className={cn(fieldClass, 'resize-none')}
                placeholder={t('placeholderLookupDescription')}
              />
            </div>
          ) : null}

          {cfg.hasType ? (
            <div className="space-y-hisabi-xs">
              <label className="type-label-md text-hisabi-on-surface block">{t('colType')}</label>
              <div className="relative">
                <select
                  value={form.type ?? 'earning'}
                  onChange={(e) => updateField('type', e.target.value)}
                  className={selectClass}
                  disabled={lockIdentityFields}
                >
                  <option value="earning">{t('payslipCategoryEarning')}</option>
                  <option value="deduction">{t('payslipCategoryDeduction')}</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
                  aria-hidden
                />
              </div>
            </div>
          ) : null}

          {cfg.hasDefaultAmount ? (
            <div className="space-y-hisabi-xs">
              <label className="type-label-md text-hisabi-on-surface block">
                {t('colDefaultAmount')}
              </label>
              <input
                value={form.defaultAmount ?? '0'}
                onChange={(e) => updateField('defaultAmount', e.target.value)}
                className={fieldClass}
                dir="ltr"
                placeholder={t('placeholderAmount')}
              />
            </div>
          ) : null}
        </div>

        <div className={CRM_SHEET_FOOTER_CLASS}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={CRM_SHEET_FOOTER_CANCEL_CLASS}
          >
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="button"
            pending={saving}
            onClick={handleSave}
            className={CRM_SHEET_FOOTER_SAVE_CLASS}
          >
            {mode === 'edit' ? t('saveChanges') : t('save')}
          </AuthSubmitButton>
        </div>
      </div>
    </div>,
    portalEl,
  )
}

function HrLookupListWithoutCompanyProfile({ kind }) {
  const t = useTranslations('HR')
  const cfg = lookupConfig(kind)
  return (
    <div className="mx-auto max-w-hisabi-container">
      <NoCompanyProfileBanner className="mb-hisabi-lg" />
      <div className="pointer-events-none select-none opacity-40">
        <div className="mb-hisabi-xl space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t(cfg.titleKey)}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t(cfg.subtitleKey)}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * @param {{ kind: HrLookupKind }} props
 */
function HrLookupListWithCompanyProfile({ kind }) {
  const t = useTranslations('HR')
  const tList = useTranslations('ListViews')
  const locale = useLocale()
  const uiLocale = locale === 'ar' ? 'ar-SA' : 'en-US'
  const cfg = lookupConfig(kind)
  const queryClient = useQueryClient()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const prevActiveProfileRef = useRef(
    /** @type {string | null | undefined} */ (undefined),
  )

  const [addOpen, setAddOpen] = useState(false)
  const [editRow, setEditRow] = useState(/** @type {Record<string, string> | null} */ (null))
  const [deleteModal, setDeleteModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(
    /** @type {Record<string, string> | null} */ (null),
  )
  const [deletePending, setDeletePending] = useState(false)
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput)
  const { page, setPage, resetPage } = useListPageFromUrl()
  const pageSize = 10

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: [cfg.queryKey, debouncedSearch, page, pageSize, activeBusinessProfileId],
    queryFn: async () =>
      authGet(
        buildListQueryUrl(cfg.apiPath, {
          search: debouncedSearch,
          page,
          limit: pageSize,
        }),
      ),
    enabled: Boolean(activeBusinessProfileId),
  })

  const busy = isPending || isFetching
  const rows = useMemo(
    () => /** @type {Record<string, string>[]} */ (data?.items ?? []),
    [data?.items],
  )

  useResetListPageOnChange(resetPage, [debouncedSearch])

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
    setBulkDeleteModal(false)
  }, [activeBusinessProfileId, resetPage])

  const { total, totalPages, safePage } = useServerPaginatedRows(page, data?.pagination)
  const pageRows = rows
  const selectableRows = useMemo(
    () => pageRows.filter((row) => row.isSystem !== true),
    [pageRows],
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
  }, [debouncedSearch, page, activeBusinessProfileId, clearSelection])

  const formatAmount = useCallback(
    (n) =>
      new Intl.NumberFormat(uiLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n),
    [uiLocale],
  )

  async function handleAddSave(form) {
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        defaultAmount: form.defaultAmount.trim() || '0',
      }
      await authPost(cfg.apiPath, payload)
      toast.success(t('lookupAdded'))
      await queryClient.invalidateQueries({ queryKey: [cfg.queryKey] })
    } catch (err) {
      toastAuthApiError(t, err)
      throw err
    }
  }

  async function handleEditSave(id, form) {
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        defaultAmount: form.defaultAmount.trim() || '0',
      }
      await authPatch(`${cfg.apiPath}/${id}`, payload)
      toast.success(t('lookupUpdated'))
      await queryClient.invalidateQueries({ queryKey: [cfg.queryKey] })
    } catch (err) {
      toastAuthApiError(t, err)
      throw err
    }
  }

  async function handleDelete() {
    if (!pendingDelete?.id) return
    setDeletePending(true)
    try {
      await authDelete(`${cfg.apiPath}/${pendingDelete.id}`)
      toast.success(t('lookupDeleted'))
      await queryClient.invalidateQueries({ queryKey: [cfg.queryKey] })
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
    if (ids.length === 0) return
    setBulkDeletePending(true)
    try {
      const { deleted, failed } = await bulkDeleteRows(
        ids,
        (id) => `${cfg.apiPath}/${id}`,
      )
      await queryClient.invalidateQueries({ queryKey: [cfg.queryKey] })
      clearSelection()
      setBulkDeleteModal(false)
      if (failed.length === 0) {
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

  const colCount =
    3 +
    (cfg.hasDescription ? 1 : 0) +
    (cfg.hasType ? 1 : 0) +
    (cfg.hasDefaultAmount ? 1 : 0)

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
          <h1 className="type-headline-xl text-hisabi-on-surface">{t(cfg.titleKey)}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t(cfg.subtitleKey)}
          </p>
        </div>
        <div className={LIST_PAGE_HEADER_ACTIONS}>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
          >
            <Plus className="size-5 shrink-0" aria-hidden />
            {t(cfg.addKey)}
          </button>
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={`${pageRows.length} / ${total} ${t('records')}`}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchPlaceholder')}
        />

        <ListBulkActionsBar
          selectedCount={selectedCount}
          onDelete={() => setBulkDeleteModal(true)}
          onClear={clearSelection}
          deletePending={bulkDeletePending}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th className={LIST_TABLE_TH_CHECKBOX}>
                  <ListRowSelectionCheckbox
                    checked={allPageSelected}
                    indeterminate={somePageSelected && !allPageSelected}
                    onChange={toggleAllOnPage}
                    disabled={pageRows.length === 0 || busy}
                    ariaLabel={tList('selectAllOnPage')}
                  />
                </th>
                <th className={listTableThClass(undefined, true)}>
                  {t(cfg.nameLabelKey)}
                </th>
                {cfg.hasDescription ? (
                  <th className={listTableThClass()}>{t('colDescription')}</th>
                ) : null}
                {cfg.hasType ? (
                  <th className={listTableThClass()}>{t('colType')}</th>
                ) : null}
                {cfg.hasDefaultAmount ? (
                  <th className={listTableThClass()}>{t('colDefaultAmount')}</th>
                ) : null}
                <th className={listTableThClass()}>{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {busy && rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-hisabi-lg py-16 text-center">
                    <AppLoader size="lg" />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
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
                        disabled={row.isSystem === true}
                      />
                    </td>
                    <td className={listTableTdClass('type-body-sm text-hisabi-on-surface font-semibold', true)}>
                      {cfg.getLabel(row)}
                      {row.isSystem === true ? (
                        <span className="type-label-sm ms-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                          {t('systemCategoryBadge')}
                        </span>
                      ) : null}
                    </td>
                    {cfg.hasDescription ? (
                      <td className={listTableTdClass('type-body-sm text-hisabi-on-surface-variant')}>
                        {row.description || '—'}
                      </td>
                    ) : null}
                    {cfg.hasType ? (
                      <td className={listTableTdClass()}>
                        <span
                          className={cn(
                            'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                            payslipTypeBadgeClass(row.type),
                          )}
                        >
                          {row.type === 'earning'
                            ? t('payslipCategoryEarning')
                            : t('payslipCategoryDeduction')}
                        </span>
                      </td>
                    ) : null}
                    {cfg.hasDefaultAmount ? (
                      <td
                        className={listTableTdClass('type-body-sm text-hisabi-on-surface font-mono')}
                        dir="ltr"
                      >
                        {formatAmount(parseAmount(row.defaultAmount))}
                      </td>
                    ) : null}
                    <td className={listTableActionsTdClass()}>
                      <div className={LIST_TABLE_ACTIONS_INNER}>
                        <ActionIconButton
                          label={t('edit')}
                          onClick={() => setEditRow(row)}
                          className="hover:text-hisabi-secondary"
                        >
                          <Pencil className="size-5" aria-hidden />
                        </ActionIconButton>
                        {row.isSystem === true ? null : (
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
                        )}
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

      <LookupSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="add"
        kind={kind}
        onSave={handleAddSave}
      />

      <LookupSheet
        open={Boolean(editRow)}
        onOpenChange={(open) => {
          if (!open) setEditRow(null)
        }}
        mode="edit"
        kind={kind}
        initialForm={editRow ? rowToForm(kind, editRow) : undefined}
        lockIdentityFields={editRow?.isSystem === true}
        onSave={async (form) => {
          if (!editRow?.id) return
          await handleEditSave(editRow.id, form)
        }}
      />

      <HisabiStatusModal
        open={deleteModal}
        onOpenChange={setDeleteModal}
        variant="error"
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: pendingDelete ? cfg.getLabel(pendingDelete) : '' })}
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
        open={bulkDeleteModal && selectedCount > 0}
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

/**
 * @param {{ kind: HrLookupKind, hasBusinessProfile?: boolean }} props
 */
export function HrLookupListView({ kind, hasBusinessProfile }) {
  if (hasBusinessProfile !== true) {
    return <HrLookupListWithoutCompanyProfile kind={kind} />
  }
  return <HrLookupListWithCompanyProfile kind={kind} />
}
