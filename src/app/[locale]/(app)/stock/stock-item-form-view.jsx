'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Save, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AppLoader } from '@/components/app-loader'
import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useAppAbility } from '@/components/rbac/ability-provider'
import {
  SettingsField,
  SettingsSection,
  fieldClass,
  fieldInvalidClass,
} from '@/components/settings/settings-page-shell'
import { PageBackButton } from '@/components/shared/page-back-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { Link, useRouter } from '@/i18n/navigation'
import { AuthApiError, authGet, authPatch, authPost } from '@/lib/api/auth-client'
import {
  shouldEnableBilingualTranslate,
  useBilingualFieldOrigin,
} from '@/lib/i18n/use-bilingual-field-origin'
import { compatibleUnits, STOCK_UNITS, stockUnitLabel } from '@/lib/stock/units'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const PAIR_KEY = 'stock.item.name'

const emptyForm = {
  nameAr: '',
  nameEn: '',
  unit: /** @type {import('@/lib/stock/units').StockUnit} */ ('kg'),
  quantityOnHand: '0',
  lowStockThreshold: '',
  unitCost: '',
  isBulk: false,
  notes: '',
  active: true,
}

/**
 * @param {{ mode: 'create' | 'edit', itemId?: string }} props
 */
export function StockItemFormView({ mode, itemId }) {
  const t = useTranslations('Stock')
  const tBi = useTranslations('BilingualInvoiceCompany')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const queryClient = useQueryClient()
  const titleId = useId()
  const ability = useAppAbility()
  const canSave =
    mode === 'create'
      ? ability.can('create', 'StockItem')
      : ability.can('update', 'StockItem')

  const bilingualFieldOrigin = useBilingualFieldOrigin()
  const { origin, reportUserInput, markAutoFilled, consumeAutoFillSkip } =
    bilingualFieldOrigin

  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  )
  const [initialUnit, setInitialUnit] = useState(
    /** @type {import('@/lib/stock/units').StockUnit | null} */ (null),
  )

  const itemQuery = useQuery({
    queryKey: ['stock', 'item', itemId],
    enabled: mode === 'edit' && Boolean(itemId),
    queryFn: async () => {
      const d = await authGet(`/stock/items/${itemId}`)
      return d.item
    },
  })

  useEffect(() => {
    if (mode !== 'edit' || !itemQuery.data) return
    const item = itemQuery.data
    setInitialUnit(item.unit)
    setForm({
      nameAr: item.nameAr ?? '',
      nameEn: item.nameEn ?? '',
      unit: item.unit,
      quantityOnHand: item.quantityOnHand ?? '0',
      lowStockThreshold: item.lowStockThreshold ?? '',
      unitCost: item.unitCost ?? '',
      isBulk: item.isBulk === true,
      notes: item.notes ?? '',
      active: item.active !== false,
    })
  }, [mode, itemQuery.data])

  const { loading: loadingNameAr } = useGeminiArSuggestion(
    form.nameEn,
    (ar) => {
      markAutoFilled('ar', PAIR_KEY, ar)
      setForm((f) => ({ ...f, nameAr: ar.slice(0, 120) }))
    },
    {
      enabled: shouldEnableBilingualTranslate(origin, 'en', form.nameAr),
      shouldSkip: (trimmed) => consumeAutoFillSkip(PAIR_KEY, 'en', trimmed),
    },
  )
  const { loading: loadingNameEn } = useGeminiEnSuggestion(
    form.nameAr,
    (en) => {
      markAutoFilled('en', PAIR_KEY, en)
      setForm((f) => ({ ...f, nameEn: en.slice(0, 120) }))
    },
    {
      enabled: shouldEnableBilingualTranslate(origin, 'ar', form.nameEn),
      shouldSkip: (trimmed) => consumeAutoFillSkip(PAIR_KEY, 'ar', trimmed),
    },
  )

  const unitOptions = useMemo(() => {
    if (mode === 'create' || !initialUnit) return STOCK_UNITS
    return compatibleUnits(initialUnit)
  }, [mode, initialUnit])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || null,
        unit: form.unit,
        lowStockThreshold: form.lowStockThreshold.trim() || null,
        unitCost: form.unitCost.trim() || null,
        isBulk: form.isBulk,
        notes: form.notes.trim() || null,
      }
      if (mode === 'edit' && itemId) {
        return authPatch(`/stock/items/${itemId}`, body)
      }
      return authPost('/stock/items', {
        ...body,
        quantityOnHand: form.quantityOnHand.trim() || '0',
      })
    },
    onSuccess: () => {
      toast.success(mode === 'edit' ? t('itemUpdated') : t('itemCreated'))
      queryClient.invalidateQueries({ queryKey: ['stock', 'items'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-count'] })
      if (itemId) {
        queryClient.invalidateQueries({ queryKey: ['stock', 'item', itemId] })
      }
      router.push('/stock')
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  function validate() {
    /** @type {Record<string, string>} */
    const next = {}
    if (!form.nameAr.trim()) next.nameAr = t('errorNameRequired')
    if (mode === 'create') {
      if (
        !form.quantityOnHand.trim() ||
        !/^-?\d+(\.\d+)?$/.test(form.quantityOnHand.trim())
      ) {
        next.quantityOnHand = t('errorQtyInvalid')
      }
    }
    if (
      form.lowStockThreshold.trim() &&
      !/^\d+(\.\d+)?$/.test(form.lowStockThreshold.trim())
    ) {
      next.lowStockThreshold = t('errorQtyInvalid')
    }
    if (form.unitCost.trim() && !/^\d+(\.\d{1,4})?$/.test(form.unitCost.trim())) {
      next.unitCost = t('errorCostInvalid')
    }
    setFieldErrors(next)
    if (Object.keys(next).length > 0) {
      scrollAfterFieldValidation()
      return false
    }
    return true
  }

  function handleClose() {
    router.push('/stock')
  }

  if (mode === 'edit' && itemQuery.isPending) {
    return (
      <div className="flex justify-center py-hisabi-xxl">
        <AppLoader />
      </div>
    )
  }

  if (mode === 'edit' && itemQuery.isError) {
    return (
      <p className="type-body-md text-hisabi-error" role="alert">
        {tErr('generic')}
      </p>
    )
  }

  if (mode === 'edit' && itemQuery.data?.active === false) {
    return (
      <div className="mx-auto max-w-hisabi-container">
        <PageBackButton href="/stock" label={t('backToList')} />
        <p className="type-body-md text-hisabi-on-surface-variant" role="status">
          {t('itemDeletedCannotEdit')}
        </p>
        <Link
          href={`/stock/items/${itemId}`}
          className="type-label-md mt-hisabi-md inline-flex text-hisabi-primary hover:underline"
        >
          {t('view')}
        </Link>
      </div>
    )
  }

  if (!canSave) {
    return (
      <p className="type-body-md text-hisabi-on-surface-variant">
        {t('noPermission')}
      </p>
    )
  }

  return (
    <div className="min-h-screen bg-transparent pb-hisabi-xxl">
      <header className="border-b border-transparent bg-transparent">
        <div className="mx-auto max-w-hisabi-container px-hisabi-md py-hisabi-md sm:px-hisabi-xl">
          <PageBackButton href="/stock" label={t('backToList')} />
          <div className="min-w-0">
            <h1
              id={titleId}
              className="type-headline-xl text-hisabi-on-surface tracking-tight"
            >
              {mode === 'edit' ? t('editTitle') : t('addTitle')}
            </h1>
            <p className="type-body-md mt-0.5 max-w-2xl text-hisabi-on-surface-variant">
              {t('formSubtitle')}
            </p>
          </div>
        </div>
      </header>

      <form
        noValidate
        className="flex flex-col"
        aria-labelledby={titleId}
        onSubmit={(e) => {
          e.preventDefault()
          setFormError('')
          if (!validate()) return
          saveMutation.mutate()
        }}
      >
        <div className="mx-auto w-full max-w-hisabi-container space-y-hisabi-xl px-hisabi-md py-hisabi-xl sm:px-hisabi-xl">
          {formError ? (
            <p className="type-body-md text-hisabi-error" role="alert">
              {formError}
            </p>
          ) : null}

          <SettingsSection title={t('sectionBasics')} icon={Package}>
            <div
              dir="ltr"
              className="grid grid-cols-1 gap-x-hisabi-lg gap-y-hisabi-md min-[480px]:grid-cols-2"
            >
              <SettingsField
                label={
                  <span className="flex items-center gap-2">
                    {t('fieldNameEn')}
                    {loadingNameEn ? (
                      <span aria-label={tBi('translating')}>
                        <AuthButtonSpinner />
                      </span>
                    ) : null}
                  </span>
                }
              >
                <input
                  className={fieldClass}
                  value={form.nameEn}
                  maxLength={120}
                  placeholder={t('fieldNameEnPlaceholder')}
                  dir="ltr"
                  onChange={(e) => {
                    reportUserInput('en', PAIR_KEY)
                    setForm((f) => ({ ...f, nameEn: e.target.value }))
                  }}
                />
              </SettingsField>

              <SettingsField
                label={
                  <span className="flex items-center gap-2">
                    {t('fieldNameAr')}
                    <RequiredMark />
                    {loadingNameAr ? (
                      <span aria-label={tBi('translating')}>
                        <AuthButtonSpinner />
                      </span>
                    ) : null}
                  </span>
                }
                error={fieldErrors.nameAr}
              >
                <input
                  className={cn(
                    fieldClass,
                    fieldErrors.nameAr && fieldInvalidClass,
                  )}
                  value={form.nameAr}
                  maxLength={120}
                  placeholder={t('fieldNameArPlaceholder')}
                  dir="rtl"
                  required
                  data-invalid={fieldErrors.nameAr ? true : undefined}
                  aria-invalid={fieldErrors.nameAr ? true : undefined}
                  onChange={(e) => {
                    reportUserInput('ar', PAIR_KEY)
                    setForm((f) => ({ ...f, nameAr: e.target.value }))
                    setFieldErrors((prev) =>
                      prev.nameAr ? { ...prev, nameAr: '' } : prev,
                    )
                  }}
                />
              </SettingsField>
            </div>

            <div className="grid grid-cols-1 gap-x-hisabi-lg gap-y-hisabi-md min-[480px]:grid-cols-2">
              <SettingsField
                label={
                  <>
                    {t('fieldUnit')}
                    <RequiredMark />
                  </>
                }
                hint={t('unitHint')}
              >
                <select
                  className={fieldClass}
                  value={form.unit}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      unit: /** @type {import('@/lib/stock/units').StockUnit} */ (
                        e.target.value
                      ),
                    }))
                  }
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {stockUnitLabel(u)}
                      {u === 'piece'
                        ? ` — ${t('unitFamilyPiece')}`
                        : u === 'g' || u === 'kg'
                          ? ` — ${t('unitFamilyMass')}`
                          : ` — ${t('unitFamilyVolume')}`}
                    </option>
                  ))}
                </select>
              </SettingsField>

              {mode === 'create' ? (
                <SettingsField
                  label={
                    <>
                      {t('fieldQty')}
                      <RequiredMark />
                    </>
                  }
                  error={fieldErrors.quantityOnHand}
                  hint={
                    fieldErrors.quantityOnHand
                      ? undefined
                      : t('fieldQtyOpeningHint')
                  }
                >
                  <input
                    className={cn(
                      fieldClass,
                      fieldErrors.quantityOnHand && fieldInvalidClass,
                    )}
                    inputMode="decimal"
                    value={form.quantityOnHand}
                    placeholder={t('fieldQtyPlaceholder')}
                    data-invalid={
                      fieldErrors.quantityOnHand ? true : undefined
                    }
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        quantityOnHand: e.target.value,
                      }))
                    }
                  />
                </SettingsField>
              ) : (
                <div className="space-y-hisabi-xs">
                  <span className="type-label-md block text-hisabi-on-surface-variant">
                    {t('fieldQty')}
                  </span>
                  <p className="type-body-md rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-3 tabular-nums text-hisabi-on-surface">
                    {form.quantityOnHand} {stockUnitLabel(form.unit)}
                  </p>
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('fieldQtyEditHint')}{' '}
                    <Link
                      href={`/stock/items/${itemId}`}
                      className="text-hisabi-primary hover:underline"
                    >
                      {t('adjustStock')}
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </SettingsSection>

          <SettingsSection title={t('sectionInventory')} icon={SlidersHorizontal}>
            <div className="grid grid-cols-1 gap-x-hisabi-lg gap-y-hisabi-md min-[480px]:grid-cols-2">
              <SettingsField
                label={t('fieldThreshold')}
                error={fieldErrors.lowStockThreshold}
                hint={
                  fieldErrors.lowStockThreshold
                    ? undefined
                    : t('fieldThresholdHint')
                }
              >
                <input
                  className={cn(
                    fieldClass,
                    fieldErrors.lowStockThreshold && fieldInvalidClass,
                  )}
                  inputMode="decimal"
                  value={form.lowStockThreshold}
                  placeholder={t('fieldThresholdPlaceholder')}
                  data-invalid={
                    fieldErrors.lowStockThreshold ? true : undefined
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      lowStockThreshold: e.target.value,
                    }))
                  }
                />
              </SettingsField>

              <SettingsField
                label={t('fieldUnitCost')}
                error={fieldErrors.unitCost}
              >
                <input
                  className={cn(
                    fieldClass,
                    fieldErrors.unitCost && fieldInvalidClass,
                  )}
                  inputMode="decimal"
                  value={form.unitCost}
                  placeholder={t('fieldUnitCostPlaceholder')}
                  data-invalid={fieldErrors.unitCost ? true : undefined}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, unitCost: e.target.value }))
                  }
                />
              </SettingsField>
            </div>

            <label className="flex cursor-pointer items-start gap-hisabi-md">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-hisabi-primary"
                checked={form.isBulk}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isBulk: e.target.checked }))
                }
              />
              <span className="min-w-0">
                <span className="type-body-md block text-hisabi-on-surface">
                  {t('fieldIsBulk')}
                </span>
                <span className="type-body-sm text-hisabi-on-surface-variant">
                  {t('fieldIsBulkHint')}
                </span>
              </span>
            </label>

            <SettingsField label={t('fieldNotes')}>
              <textarea
                className={cn(fieldClass, 'min-h-24 resize-y')}
                value={form.notes}
                maxLength={500}
                placeholder={t('fieldNotesPlaceholder')}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </SettingsField>
          </SettingsSection>
        </div>

        <div className="mx-auto mt-hisabi-xl flex w-full max-w-hisabi-container flex-col-reverse gap-hisabi-md border-t border-hisabi-outline-variant/20 px-hisabi-md pt-hisabi-xl pb-hisabi-lg sm:px-hisabi-xl min-[500px]:flex-row min-[500px]:justify-end min-[500px]:gap-hisabi-xl min-[500px]:border-t-0 min-[500px]:pb-hisabi-xxl min-[500px]:pt-0">
          <button
            type="button"
            onClick={handleClose}
            className="type-label-md inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border border-hisabi-primary/20 px-hisabi-lg font-semibold text-hisabi-primary transition-all hover:bg-hisabi-surface-container-low active:scale-[0.98] min-[500px]:w-auto min-[500px]:min-w-[10rem]"
          >
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="submit"
            variant="gold"
            pending={saveMutation.isPending}
            className="min-h-0 w-full min-w-0 py-4 min-[500px]:w-auto min-[500px]:min-w-[12rem]"
          >
            <span className="flex items-center justify-center gap-hisabi-sm">
              <Save className="size-5 shrink-0" aria-hidden />
              {saveMutation.isPending
                ? t('saving')
                : mode === 'edit'
                  ? t('save')
                  : t('create')}
            </span>
          </AuthSubmitButton>
        </div>
      </form>
    </div>
  )
}
