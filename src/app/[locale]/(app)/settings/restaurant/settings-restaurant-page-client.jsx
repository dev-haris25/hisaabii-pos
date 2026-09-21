'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Coins,
  Copy,
  FileText,
  Keyboard,
  Loader2,
  Mail,
  SlidersHorizontal,
  Tv,
  Warehouse,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { SettingsRestaurantIdentitySection } from '@/components/settings/settings-restaurant-identity-section'
import {
  SettingsField,
  SettingsFormFooter,
  SettingsPageShell,
  SettingsSection,
  fieldClass,
  fieldInvalidClass,
  selectClass,
} from '@/components/settings/settings-page-shell'
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard'
import { AuthApiError, authGet, authPatch } from '@/lib/api/auth-client'
import { customerQueueAbsoluteUrl } from '@/lib/orders/customer-queue-url'
import { formatDocumentNumber } from '@/lib/settings/format-helpers'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const SETTINGS_QUERY_KEY = ['business-settings']

const PREFIX_FIELDS = [
  { key: 'invoicePrefix', previewNum: 1 },
  { key: 'creditNotePrefix', previewNum: 1 },
  { key: 'debitNotePrefix', previewNum: 1 },
  { key: 'salarySlipPrefix', previewNum: 1 },
]

/** @param {Record<string, unknown>} settings */
function formStateFromSettings(settings) {
  return {
    invoicePrefix: settings.invoicePrefix ?? 'INV-',
    creditNotePrefix: settings.creditNotePrefix ?? 'CN-',
    debitNotePrefix: settings.debitNotePrefix ?? 'DN-',
    salarySlipPrefix: settings.salarySlipPrefix ?? 'SS-',
    numberPadding: settings.numberPadding ?? 4,
    dateFormat: settings.dateFormat ?? 'dd/MM/yyyy',
    numberFormat: settings.numberFormat ?? '1,234.56',
    defaultVatPreset: settings.defaultVatPreset ?? 'standard',
    email: settings.email ?? '',
    phone: settings.phone ?? '',
    customerQueueLocale: settings.customerQueueLocale === 'en' ? 'en' : 'ar',
    discountCap:
      settings.discountCap != null && String(settings.discountCap).trim() !== ''
        ? String(settings.discountCap)
        : '',
    posOnScreenKeypad: settings.posOnScreenKeypad === true,
    allowNegativeStock: settings.allowNegativeStock === true,
    allowMainStockIfNoKitchenStock:
      settings.allowMainStockIfNoKitchenStock === true,
    lowStockAlertsEnabled: settings.lowStockAlertsEnabled !== false,
    emailHighWasteReports: settings.emailHighWasteReports === true,
  }
}

/**
 * @param {ReturnType<typeof formStateFromSettings>} form
 * @param {Record<string, unknown> | undefined} settings
 */
function isSettingsFormDirty(form, settings) {
  if (!settings) return false
  const baseline = formStateFromSettings(settings)
  return /** @type {(keyof typeof baseline)[]} */ (Object.keys(baseline)).some(
    (key) => String(form[key] ?? '') !== String(baseline[key] ?? ''),
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SettingsRestaurantPageClient() {
  const t = useTranslations('Settings')
  const ability = useAppAbility()
  const canRead =
    hasFullAccess(ability) || ability.can('read', 'BusinessSettings')
  const canUpdate =
    hasFullAccess(ability) || ability.can('update', 'BusinessSettings')
  const queryClient = useQueryClient()

  /** @type {React.MutableRefObject<null | {
   *   requestSave: () => Promise<string>
   *   isPending: () => boolean
   *   discardChanges: () => void
   * }>} */
  const identityApiRef = useRef(null)
  const [form, setForm] = useState(() => formStateFromSettings({}))
  const [unifiedSaving, setUnifiedSaving] = useState(false)
  const [identityDirty, setIdentityDirty] = useState(false)
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({
    email: '',
    discountCap: '',
  })
  /** @type {React.MutableRefObject<null | { kind: 'href', href: string } | { kind: 'back' }>} */
  const pendingLeaveRef = useRef(null)
  const leaveModalOpenRef = useRef(false)
  leaveModalOpenRef.current = leaveModalOpen

  const { data, isPending, isError, error } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => authGet('/settings'),
    enabled: canRead,
  })

  const settings = data?.settings

  useEffect(() => {
    if (settings) setForm(formStateFromSettings(settings))
  }, [settings])

  const settingsDirty = useMemo(
    () => isSettingsFormDirty(form, settings),
    [form, settings],
  )
  const customerQueueUrl = useMemo(() => {
    if (!settings?.slug) return ''
    const origin =
      String(settings.customerQueueOrigin ?? '').replace(/\/$/, '') ||
      (typeof window !== 'undefined' ? window.location.origin : '')
    return customerQueueAbsoluteUrl(
      origin,
      form.customerQueueLocale,
      String(settings.slug),
    )
  }, [form.customerQueueLocale, settings])
  const isDirty = identityDirty || settingsDirty

  const discardAllUnsaved = useCallback(() => {
    identityApiRef.current?.discardChanges?.()
    if (settings) setForm(formStateFromSettings(settings))
  }, [settings])

  const { proceed: proceedLeave } = useUnsavedChangesGuard({
    isDirty,
    enabled: canRead,
    onBlock: (target) => {
      pendingLeaveRef.current = target
      if (!leaveModalOpenRef.current) setLeaveModalOpen(true)
    },
  })

  const noCompany =
    isError && error instanceof AuthApiError && error.code === 'NO_COMPANY'

  function collectSettingsFieldErrors() {
    /** @type {{ email: string, discountCap: string }} */
    const errors = { email: '', discountCap: '' }
    const email = String(form.email).trim()
    if (email && !EMAIL_RE.test(email)) {
      errors.email = t('invalidCompanyEmail')
    }
    const cap = form.discountCap.trim()
    if (cap) {
      if (!/^\d+(\.\d{1,4})?$/.test(cap)) {
        errors.discountCap = t('invalidDiscountCap')
      } else {
        const n = Number.parseFloat(cap)
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          errors.discountCap = t('invalidDiscountCap')
        }
      }
    }
    return errors
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      return authPatch('/settings', {
        invoicePrefix: form.invoicePrefix.trim() || 'INV-',
        creditNotePrefix: form.creditNotePrefix.trim() || 'CN-',
        debitNotePrefix: form.debitNotePrefix.trim() || 'DN-',
        salarySlipPrefix: form.salarySlipPrefix.trim() || 'SS-',
        numberPadding: Number(form.numberPadding) || 4,
        dateFormat: form.dateFormat,
        numberFormat: form.numberFormat,
        defaultVatPreset: form.defaultVatPreset,
        email: String(form.email).trim() || null,
        phone: String(form.phone).trim() || null,
        customerQueueLocale: form.customerQueueLocale,
        discountCap: form.discountCap.trim(),
        posOnScreenKeypad: form.posOnScreenKeypad === true,
        allowNegativeStock: form.allowNegativeStock === true,
        allowMainStockIfNoKitchenStock:
          form.allowMainStockIfNoKitchenStock === true,
        lowStockAlertsEnabled: form.lowStockAlertsEnabled === true,
        emailHighWasteReports: form.emailHighWasteReports === true,
      })
    },
    onSuccess: (res) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, res)
      if (res.settings) setForm(formStateFromSettings(res.settings))
    },
  })

  /**
   * Identity first, then settings — so tax cancel can still discard everything.
   * @returns {Promise<'ok' | 'invalid' | 'cancelled' | 'tax_cancelled' | 'error' | 'redirected'>}
   */
  async function runUnifiedSave() {
    const settingsErrors = collectSettingsFieldErrors()
    if (settingsErrors.email || settingsErrors.discountCap) {
      setFieldErrors(settingsErrors)
      scrollAfterFieldValidation()
      return 'invalid'
    }
    setFieldErrors({ email: '', discountCap: '' })

    let identityResult = 'skipped'
    if (identityApiRef.current) {
      identityResult = await identityApiRef.current.requestSave()
    }

    if (
      identityResult === 'invalid' ||
      identityResult === 'cancelled' ||
      identityResult === 'tax_cancelled' ||
      identityResult === 'error' ||
      identityResult === 'redirected'
    ) {
      return identityResult
    }

    if (canUpdate && settingsDirty) {
      try {
        await saveMutation.mutateAsync()
      } catch {
        return 'error'
      }
    }

    return 'ok'
  }

  async function handleUnifiedSave() {
    if (unifiedSaving) return
    setUnifiedSaving(true)
    try {
      const result = await runUnifiedSave()
      if (result === 'ok') {
        toast.success(t('saved'))
        return
      }
      if (result === 'error') {
        toast.error(t('saveFailed'))
      }
    } finally {
      setUnifiedSaving(false)
    }
  }

  function handleLeaveDontSave() {
    const target = pendingLeaveRef.current
    discardAllUnsaved()
    setLeaveModalOpen(false)
    pendingLeaveRef.current = null
    if (target) proceedLeave(target)
  }

  async function handleLeaveSave() {
    if (unifiedSaving) return
    const target = pendingLeaveRef.current
    setUnifiedSaving(true)
    // Close leave modal so the tax re-onboard dialog can show next if needed.
    setLeaveModalOpen(false)
    try {
      const result = await runUnifiedSave()
      if (result === 'redirected') {
        pendingLeaveRef.current = null
        return
      }
      if (result === 'tax_cancelled') {
        discardAllUnsaved()
        pendingLeaveRef.current = null
        if (target) proceedLeave(target)
        return
      }
      if (result === 'ok') {
        toast.success(t('saved'))
        pendingLeaveRef.current = null
        if (target) proceedLeave(target)
        return
      }
      if (result === 'error') {
        toast.error(t('saveFailed'))
      }
      // invalid / cancelled (bilingual): stay on page
      pendingLeaveRef.current = null
    } finally {
      setUnifiedSaving(false)
    }
  }

  if (!canRead) {
    return (
      <SettingsPageShell
        title={t('restaurantTitle')}
        subtitle={t('restaurantSubtitle')}
      >
        <p className="type-body-md text-hisabi-on-surface-variant">
          {t('noPermission')}
        </p>
      </SettingsPageShell>
    )
  }

  if (noCompany) {
    return (
      <SettingsPageShell
        title={t('restaurantTitle')}
        subtitle={t('restaurantSubtitle')}
      >
        <p className="type-body-md text-hisabi-on-surface-variant">
          {t('noCompany')}
        </p>
      </SettingsPageShell>
    )
  }

  if (isPending && !settings) {
    return (
      <SettingsPageShell
        title={t('restaurantTitle')}
        subtitle={t('restaurantSubtitle')}
      >
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-hisabi-primary" />
        </div>
      </SettingsPageShell>
    )
  }

  const saving =
    unifiedSaving ||
    saveMutation.isPending ||
    Boolean(identityApiRef.current?.isPending?.())

  return (
    <SettingsPageShell
      title={t('restaurantTitle')}
      subtitle={t('restaurantSubtitle')}
    >
      <HisabiStatusModal
        open={leaveModalOpen}
        onOpenChange={(open) => {
          if (open) {
            setLeaveModalOpen(true)
            return
          }
          setLeaveModalOpen(false)
          // Keep pending target while leave-save runs (modal closes for tax confirm).
          if (!unifiedSaving) pendingLeaveRef.current = null
        }}
        variant="warning"
        title={t('unsavedLeaveTitle')}
        description={t('unsavedLeaveDescription')}
        primaryLabel={t('unsavedLeaveSave')}
        primaryPending={unifiedSaving}
        onPrimary={() => {
          void handleLeaveSave()
        }}
        secondaryLabel={t('unsavedLeaveDontSave')}
        onSecondary={handleLeaveDontSave}
      />

      <SettingsRestaurantIdentitySection
        ref={identityApiRef}
        onDirtyChange={setIdentityDirty}
      />

      <SettingsSection title={t('sectionCompanyContact')} icon={Mail}>
        <p className="type-body-sm text-hisabi-on-surface-variant -mt-hisabi-xs mb-hisabi-sm">
          {t('companyContactHint')}
        </p>
        <fieldset
          disabled={!canUpdate || unifiedSaving}
          className="min-w-0 space-y-hisabi-md border-0 p-0"
        >
          <div className="grid gap-hisabi-lg sm:grid-cols-2">
            <SettingsField
              label={t('fieldCompanyEmail')}
              error={fieldErrors.email}
              errorId="settings-company-email-error"
            >
              <input
                id="settings-company-email"
                className={cn(fieldClass, fieldErrors.email && fieldInvalidClass)}
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => {
                  setForm((f) => ({ ...f, email: e.target.value }))
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: '' }))
                  }
                }}
                placeholder={t('fieldCompanyEmailPlaceholder')}
                autoComplete="off"
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={
                  fieldErrors.email ? 'settings-company-email-error' : undefined
                }
              />
            </SettingsField>
            <SettingsField label={t('fieldCompanyPhone')}>
              <input
                className={fieldClass}
                type="tel"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder={t('fieldCompanyPhonePlaceholder')}
                autoComplete="off"
              />
            </SettingsField>
          </div>
        </fieldset>
      </SettingsSection>

      <SettingsSection title={t('sectionCustomerQueue')} icon={Tv}>
        <p className="type-body-sm text-hisabi-on-surface-variant -mt-hisabi-xs mb-hisabi-sm">
          {t('customerQueueHint')}
        </p>
        <div className="grid gap-hisabi-lg sm:grid-cols-2">
          <fieldset
            disabled={!canUpdate || unifiedSaving}
            className="min-w-0 border-0 p-0"
          >
            <SettingsField label={t('fieldCustomerQueueLocale')}>
              <div className="relative">
                <select
                  className={selectClass}
                  value={form.customerQueueLocale}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      customerQueueLocale: e.target.value === 'en' ? 'en' : 'ar',
                    }))
                  }
                >
                  <option value="ar">{t('languageAr')}</option>
                  <option value="en">{t('languageEn')}</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
                  aria-hidden
                />
              </div>
            </SettingsField>
          </fieldset>
          <SettingsField label={t('fieldCustomerQueueUrl')}>
            <div className="flex gap-hisabi-sm">
              <input
                className={fieldClass}
                dir="ltr"
                readOnly
                value={customerQueueUrl}
              />
              <button
                type="button"
                disabled={!customerQueueUrl}
                className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-hisabi-outline-variant/60 bg-white px-3 text-hisabi-on-surface hover:bg-hisabi-surface-container disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  if (!customerQueueUrl) return
                  void navigator.clipboard.writeText(customerQueueUrl).then(
                    () => toast.success(t('customerQueueCopied')),
                    () => toast.error(t('customerQueueCopyFailed')),
                  )
                }}
                aria-label={t('customerQueueCopy')}
              >
                <Copy className="size-5" aria-hidden />
              </button>
            </div>
          </SettingsField>
        </div>
      </SettingsSection>

      <fieldset
        disabled={!canUpdate || unifiedSaving}
        className="min-w-0 space-y-hisabi-xl border-0 p-0"
      >
        <SettingsSection title={t('sectionDocuments')} icon={FileText}>
          <div className="grid gap-hisabi-lg sm:grid-cols-2">
            {PREFIX_FIELDS.map(({ key, previewNum }) => (
              <SettingsField key={key} label={t(`field_${key}`)}>
                <input
                  className={fieldClass}
                  dir="ltr"
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  placeholder={t(`placeholder_${key}`)}
                />
                <p className="type-body-sm text-hisabi-on-surface-variant mt-1">
                  {t('prefixPreview', {
                    preview: formatDocumentNumber(
                      previewNum,
                      form[key],
                      Number(form.numberPadding) || 4,
                    ),
                  })}
                </p>
              </SettingsField>
            ))}
            <SettingsField label={t('fieldNumberPadding')}>
              <input
                className={fieldClass}
                dir="ltr"
                type="number"
                min={1}
                max={10}
                value={form.numberPadding}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    numberPadding: Number.parseInt(e.target.value, 10) || 4,
                  }))
                }
                placeholder={t('placeholderNumberPadding')}
              />
            </SettingsField>
          </div>
        </SettingsSection>

        <SettingsSection title={t('sectionFinancial')} icon={Coins}>
          <div className="grid gap-hisabi-lg sm:grid-cols-2">
            <SettingsField label={t('fieldCurrency')}>
              <input className={fieldClass} value="SAR" disabled readOnly />
              <p className="type-body-sm text-hisabi-on-surface-variant mt-1">
                {t('currencyZatcaHint')}
              </p>
            </SettingsField>
            <SettingsField
              label={t('fieldDiscountCap')}
              hint={t('fieldDiscountCapHint')}
              error={fieldErrors.discountCap}
              errorId="settings-discount-cap-error"
            >
              <input
                id="settings-discount-cap"
                className={cn(
                  fieldClass,
                  fieldErrors.discountCap && fieldInvalidClass,
                )}
                dir="ltr"
                inputMode="decimal"
                value={form.discountCap}
                onChange={(e) => {
                  setForm((f) => ({ ...f, discountCap: e.target.value }))
                  if (fieldErrors.discountCap) {
                    setFieldErrors((prev) => ({ ...prev, discountCap: '' }))
                  }
                }}
                placeholder={t('fieldDiscountCapPlaceholder')}
                aria-invalid={fieldErrors.discountCap ? true : undefined}
                aria-describedby={
                  fieldErrors.discountCap
                    ? 'settings-discount-cap-error'
                    : undefined
                }
              />
            </SettingsField>
            <SettingsField label={t('fieldDefaultVatPreset')}>
              <div className="relative">
                <select
                  className={selectClass}
                  value={form.defaultVatPreset}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, defaultVatPreset: e.target.value }))
                  }
                >
                  <option value="standard">{t('vatStandard')}</option>
                  <option value="zero">{t('vatZero')}</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
                  aria-hidden
                />
              </div>
            </SettingsField>
          </div>
        </SettingsSection>

        <SettingsSection title={t('sectionPosTill')} icon={Keyboard}>
          <SettingsField
            label={t('fieldPosOnScreenKeypad')}
            hint={t('fieldPosOnScreenKeypadHint')}
          >
            <label className="flex items-center gap-hisabi-md">
              <input
                id="settings-pos-keypad"
                type="checkbox"
                className="size-5 accent-hisabi-primary"
                checked={form.posOnScreenKeypad === true}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    posOnScreenKeypad: e.target.checked,
                  }))
                }
              />
              <span className="type-body-md text-hisabi-on-surface">
                {t('fieldPosOnScreenKeypadEnable')}
              </span>
            </label>
          </SettingsField>
        </SettingsSection>

        <SettingsSection title={t('sectionStock')} icon={Warehouse}>
          <SettingsField
            label={t('fieldAllowNegativeStock')}
            hint={t('fieldAllowNegativeStockHint')}
          >
            <label className="flex items-center gap-hisabi-md">
              <input
                id="settings-allow-negative-stock"
                type="checkbox"
                className="size-5 accent-hisabi-primary"
                checked={form.allowNegativeStock === true}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    allowNegativeStock: e.target.checked,
                  }))
                }
              />
              <span className="type-body-md text-hisabi-on-surface">
                {t('fieldAllowNegativeStockEnable')}
              </span>
            </label>
          </SettingsField>
          <SettingsField
            label={t('fieldAllowMainKitchenStock')}
            hint={t('fieldAllowMainKitchenStockHint')}
          >
            <label className="flex items-center gap-hisabi-md">
              <input
                id="settings-allow-main-kitchen-stock"
                type="checkbox"
                className="size-5 accent-hisabi-primary"
                checked={form.allowMainStockIfNoKitchenStock === true}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    allowMainStockIfNoKitchenStock: e.target.checked,
                  }))
                }
              />
              <span className="type-body-md text-hisabi-on-surface">
                {t('fieldAllowMainKitchenStockEnable')}
              </span>
            </label>
          </SettingsField>
          <SettingsField
            label={t('fieldLowStockAlerts')}
            hint={t('fieldLowStockAlertsHint')}
          >
            <label className="flex items-center gap-hisabi-md">
              <input
                id="settings-low-stock-alerts"
                type="checkbox"
                className="size-5 accent-hisabi-primary"
                checked={form.lowStockAlertsEnabled === true}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    lowStockAlertsEnabled: e.target.checked,
                  }))
                }
              />
              <span className="type-body-md text-hisabi-on-surface">
                {t('fieldLowStockAlertsEnable')}
              </span>
            </label>
          </SettingsField>
          {hasFullAccess(ability) ? (
            <SettingsField
              label={t('fieldEmailHighWaste')}
              hint={t('fieldEmailHighWasteHint')}
            >
              <label className="flex items-center gap-hisabi-md">
                <input
                  id="settings-email-high-waste"
                  type="checkbox"
                  className="size-5 accent-hisabi-primary"
                  checked={form.emailHighWasteReports === true}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      emailHighWasteReports: e.target.checked,
                    }))
                  }
                />
                <span className="type-body-md text-hisabi-on-surface">
                  {t('fieldEmailHighWasteEnable')}
                </span>
              </label>
            </SettingsField>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('sectionFormats')} icon={SlidersHorizontal}>
          <div className="grid gap-hisabi-lg sm:grid-cols-2">
            <SettingsField label={t('fieldDateFormat')}>
              <div className="relative">
                <select
                  className={selectClass}
                  value={form.dateFormat}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dateFormat: e.target.value }))
                  }
                >
                  <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                  <option value="MM/dd/yyyy">MM/dd/yyyy</option>
                  <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
                  aria-hidden
                />
              </div>
            </SettingsField>
            <SettingsField label={t('fieldNumberFormat')}>
              <div className="relative">
                <select
                  className={selectClass}
                  value={form.numberFormat}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, numberFormat: e.target.value }))
                  }
                >
                  <option value="1,234.56">1,234.56</option>
                  <option value="1234.56">1234.56</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
                  aria-hidden
                />
              </div>
            </SettingsField>
          </div>
        </SettingsSection>
      </fieldset>

      {canUpdate ? (
        <SettingsFormFooter>
          <AuthSubmitButton
            type="button"
            pending={saving}
            disabled={saving}
            onClick={() => void handleUnifiedSave()}
          >
            {t('save')}
          </AuthSubmitButton>
        </SettingsFormFooter>
      ) : null}
    </SettingsPageShell>
  )
}
