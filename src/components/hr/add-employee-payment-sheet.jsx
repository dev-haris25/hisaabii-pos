'use client'

import { useQuery } from '@tanstack/react-query'
import { ChevronDown, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
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
import { SalaryOverflowModal } from '@/components/hr/salary-overflow-modal'
import { SearchableEntityPicker } from '@/components/invoices/searchable-entity-picker'
import { FieldAutofillSpinner } from '@/components/shared/field-autofill-spinner'
import { authGet, authPost } from '@/lib/api/auth-client'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

const selectClass =
  'type-body-md text-hisabi-on-surface w-full appearance-none rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 pe-10 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function currentPayPeriod() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** @returns {Record<string, string>} */
function emptyForm() {
  return {
    paymentDate: todayIso(),
    employeeId: '',
    paymentType: 'salary',
    payPeriod: currentPayPeriod(),
    amount: '',
    paymentMethod: 'cash',
    remarks: '',
  }
}

/**
 * @param {Record<string, string>} form
 */
function buildPayload(form, overflowResolution) {
  return {
    paymentDate: form.paymentDate,
    employeeId: form.employeeId,
    paymentType: form.paymentType,
    payPeriod: form.paymentType === 'salary' ? form.payPeriod : null,
    amount: form.amount.trim(),
    paymentMethod: form.paymentMethod,
    remarks: form.remarks.trim(),
    ...(overflowResolution ? { overflowResolution } : {}),
  }
}

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   onSuccess: (items: unknown[]) => void
 * }} props
 */
export function AddEmployeePaymentSheet({ open, onOpenChange, onSuccess }) {
  const t = useTranslations('HR')
  const tCommon = useTranslations('Common')
  const titleId = useId()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const [form, setForm] = useState(emptyForm)
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}))
  const [saving, setSaving] = useState(false)
  const [balanceText, setBalanceText] = useState('')
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [overflowBreakdown, setOverflowBreakdown] = useState(
    /** @type {Record<string, string> | null} */ (null),
  )
  const [overflowPendingChoice, setOverflowPendingChoice] = useState(
    /** @type {'advance' | 'bonus' | 'force_salary' | null} */ (null),
  )

  const { data: employeesRes, isLoading: employeesLoading } = useQuery({
    queryKey: ['hr-employees', activeBusinessProfileId],
    queryFn: async () => authGet('/hr/employees?status=active'),
    enabled: open && Boolean(activeBusinessProfileId),
    staleTime: 60_000,
  })

  const employeeItems = useMemo(
    () =>
      (employeesRes?.items ?? []).map((e) => ({
        id: e.id,
        label: e.name,
        sublabel: e.emailOfficial ?? e.mobileOfficial ?? '',
      })),
    [employeesRes?.items],
  )

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setForm(emptyForm())
    setFieldErrors({})
    setBalanceText('')
    setOverflowOpen(false)
    setOverflowBreakdown(null)
    setOverflowPendingChoice(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape' && !overflowOpen) onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange, overflowOpen])

  async function loadBalance(employeeId) {
    if (!employeeId) {
      setBalanceText('')
      return
    }
    setBalanceLoading(true)
    try {
      const res = await authGet(`/hr/employees/${employeeId}`)
      const net = res.balance?.netBalance ?? '0'
      const advance = res.balance?.outstandingAdvance ?? '0'
      setBalanceText(
        t('employeeBalanceHint', { netBalance: net, outstandingAdvance: advance }),
      )
    } catch {
      setBalanceText('')
    } finally {
      setBalanceLoading(false)
    }
  }

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'paymentType' && value === 'salary' && !prev.payPeriod) {
        next.payPeriod = currentPayPeriod()
      }
      return next
    })
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
    if (key === 'employeeId') {
      void loadBalance(value)
    }
  }

  function validate() {
    /** @type {Record<string, string>} */
    const next = {}
    if (!form.paymentDate.trim()) next.paymentDate = t('validationRequired')
    if (!form.employeeId.trim()) next.employeeId = t('validationRequired')
    if (!form.amount.trim()) next.amount = t('validationRequired')
    if (form.paymentType === 'salary' && !form.payPeriod.trim()) {
      next.payPeriod = t('validationRequired')
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function submitPayment(overflowResolution) {
    const res = await authPost('/hr/employee-payments', buildPayload(form, overflowResolution))

    if (res.requiresOverflowResolution && res.breakdown) {
      setOverflowBreakdown(res.breakdown)
      setOverflowOpen(true)
      return
    }

    const items = Array.isArray(res.items) ? res.items : []
    onSuccess(items)
    setOverflowOpen(false)
    setOverflowBreakdown(null)
    onOpenChange(false)
  }

  async function handleSave() {
    if (!validate()) {
      scrollAfterFieldValidation()
      return
    }
    setSaving(true)
    try {
      await submitPayment(null)
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setSaving(false)
    }
  }

  async function handleOverflowChoice(resolution) {
    setOverflowPendingChoice(resolution)
    try {
      await submitPayment(resolution)
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setOverflowPendingChoice(null)
    }
  }

  const paymentMethodOptions = /** @type {const} */ ([
    ['cash', 'paymentMethodCash'],
    ['bank_transfer', 'paymentMethodBankTransfer'],
    ['cheque', 'paymentMethodCheque'],
    ['other', 'paymentMethodOther'],
  ])

  const paymentTypeOptions = /** @type {const} */ ([
    ['salary', 'paymentTypeSalary'],
    ['advance', 'paymentTypeAdvance'],
    ['bonus', 'paymentTypeBonus'],
  ])

  const portalEl = typeof document !== 'undefined' ? document.body : null
  if (!open || !portalEl) return null

  return createPortal(
    <>
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
                {t('addEmployeePaymentTitle')}
              </h2>
              <p className={CRM_SHEET_HEADER_SUBTITLE_CLASS}>
                {t('addEmployeePaymentSubtitle')}
              </p>
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
                {t('fieldPaymentDate')}
                <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>*</span>
              </label>
              <input
                type="date"
                value={form.paymentDate}
                onChange={(e) => updateField('paymentDate', e.target.value)}
                className={cn(fieldClass, fieldErrors.paymentDate && 'border-hisabi-error')}
              />
            </div>

            <div className="space-y-hisabi-xs">
              <label className="type-label-md text-hisabi-on-surface flex items-center gap-hisabi-xs">
                <span>
                  {t('fieldPaidTo')}
                  <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>*</span>
                </span>
                <FieldAutofillSpinner loading={balanceLoading} label={tCommon('loadingDetails')} />
              </label>
              <SearchableEntityPicker
                items={employeeItems}
                loading={employeesLoading}
                value={form.employeeId}
                onChange={(id) => updateField('employeeId', id)}
                emptyLabel={t('selectEmployee')}
                searchPlaceholder={t('searchEmployeesPlaceholder')}
                triggerClassName={cn(fieldClass, fieldErrors.employeeId && 'border-hisabi-error')}
              />
              {balanceText ? (
                <p className="type-body-sm text-hisabi-on-surface-variant">{balanceText}</p>
              ) : null}
            </div>

            <div className="space-y-hisabi-xs">
              <label className="type-label-md text-hisabi-on-surface block">
                {t('fieldPaymentType')}
              </label>
              <div className="flex gap-hisabi-sm">
                {paymentTypeOptions.map(([value, labelKey]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateField('paymentType', value)}
                    className={cn(
                      'type-label-md flex-1 rounded-lg border px-hisabi-md py-2.5 font-semibold transition-colors',
                      form.paymentType === value
                        ? 'border-hisabi-primary bg-hisabi-primary-fixed text-hisabi-primary'
                        : 'border-hisabi-outline-variant bg-white text-hisabi-on-surface-variant hover:bg-slate-50',
                    )}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {form.paymentType === 'salary' ? (
              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface block">
                  {t('fieldPayPeriod')}
                  <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>*</span>
                </label>
                <input
                  type="month"
                  value={form.payPeriod}
                  onChange={(e) => updateField('payPeriod', e.target.value)}
                  className={cn(fieldClass, fieldErrors.payPeriod && 'border-hisabi-error')}
                  dir="ltr"
                />
              </div>
            ) : null}

            <div className="space-y-hisabi-xs">
              <label className="type-label-md text-hisabi-on-surface block">
                {t('fieldAmount')}
                <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>*</span>
              </label>
              <input
                value={form.amount}
                onChange={(e) => updateField('amount', e.target.value)}
                className={cn(fieldClass, fieldErrors.amount && 'border-hisabi-error')}
                dir="ltr"
                placeholder={t('placeholderAmount')}
              />
            </div>

            <div className="space-y-hisabi-xs">
              <label className="type-label-md text-hisabi-on-surface block">
                {t('fieldPaymentMethod')}
              </label>
              <div className="relative">
                <select
                  value={form.paymentMethod}
                  onChange={(e) => updateField('paymentMethod', e.target.value)}
                  className={selectClass}
                >
                  {paymentMethodOptions.map(([value, labelKey]) => (
                    <option key={value} value={value}>
                      {t(labelKey)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
                  aria-hidden
                />
              </div>
            </div>

            <div className="space-y-hisabi-xs">
              <label className="type-label-md text-hisabi-on-surface block">
                {t('fieldRemarks')}
              </label>
              <textarea
                rows={3}
                value={form.remarks}
                onChange={(e) => updateField('remarks', e.target.value)}
                className={cn(fieldClass, 'resize-none')}
                placeholder={t('placeholderPaymentRemarks')}
              />
            </div>
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
              {t('save')}
            </AuthSubmitButton>
          </div>
        </div>
      </div>

      <SalaryOverflowModal
        open={overflowOpen}
        onOpenChange={setOverflowOpen}
        breakdown={overflowBreakdown}
        onChoose={handleOverflowChoice}
        pendingChoice={overflowPendingChoice}
      />
    </>,
    portalEl,
  )
}
