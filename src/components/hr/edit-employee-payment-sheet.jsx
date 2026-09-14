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
import { SearchableEntityPicker } from '@/components/invoices/searchable-entity-picker'
import { FieldAutofillSpinner } from '@/components/shared/field-autofill-spinner'
import { authGet } from '@/lib/api/auth-client'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

const selectClass =
  'type-body-md text-hisabi-on-surface w-full appearance-none rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 pe-10 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

/** @param {string | null | undefined} iso */
function isoToDateInput(iso) {
  if (!iso) return new Date().toISOString().slice(0, 10)
  return iso.slice(0, 10)
}

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   payment: Record<string, string> | null
 *   onSave: (id: string, payload: Record<string, string>) => Promise<void>
 * }} props
 */
export function EditEmployeePaymentSheet({ open, onOpenChange, payment, onSave }) {
  const t = useTranslations('HR')
  const tCommon = useTranslations('Common')
  const titleId = useId()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const [form, setForm] = useState(
    /** @type {Record<string, string>} */ ({
      paymentDate: '',
      employeeId: '',
      paymentType: 'salary',
      payPeriod: '',
      amount: '',
      paymentMethod: 'cash',
      remarks: '',
    }),
  )
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}))
  const [saving, setSaving] = useState(false)
  const [balanceText, setBalanceText] = useState('')
  const [balanceLoading, setBalanceLoading] = useState(false)

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

  useEffect(() => {
    if (!open || !payment) return
    const next = {
      paymentDate: isoToDateInput(payment.paymentDate),
      employeeId: payment.employeeId ?? '',
      paymentType: payment.paymentType ?? 'salary',
      payPeriod: payment.payPeriod ?? '',
      amount: payment.amount ?? '',
      paymentMethod: payment.paymentMethod ?? 'cash',
      remarks: payment.remarks ?? '',
    }
    setForm(next)
    setFieldErrors({})
    void loadBalance(next.employeeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when sheet opens for a payment
  }, [open, payment])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'paymentType' && value === 'salary' && !prev.payPeriod) {
        const d = new Date()
        next.payPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

  async function handleSave() {
    if (!payment?.id) return
    if (!validate()) {
      scrollAfterFieldValidation()
      return
    }
    setSaving(true)
    try {
      await onSave(payment.id, {
        paymentDate: form.paymentDate,
        employeeId: form.employeeId,
        paymentType: form.paymentType,
        payPeriod: form.paymentType === 'salary' ? form.payPeriod : null,
        amount: form.amount,
        paymentMethod: form.paymentMethod,
        remarks: form.remarks,
      })
      onOpenChange(false)
    } catch {
      // parent toast
    } finally {
      setSaving(false)
    }
  }

  const paymentMethodOptions = /** @type {const} */ ([
    ['cash', 'paymentMethodCash'],
    ['bank_transfer', 'paymentMethodBankTransfer'],
    ['cheque', 'paymentMethodCheque'],
    ['other', 'paymentMethodOther'],
  ])

  const portalEl = typeof document !== 'undefined' ? document.body : null
  if (!open || !portalEl || !payment) return null

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
              {t('editEmployeePaymentTitle')}
            </h2>
            <p className={CRM_SHEET_HEADER_SUBTITLE_CLASS}>
              {t('editEmployeePaymentSubtitle')}
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
            <div className="flex flex-wrap gap-hisabi-sm">
              {[
                ['salary', 'paymentTypeSalary'],
                ['advance', 'paymentTypeAdvance'],
                ['bonus', 'paymentTypeBonus'],
              ].map(([value, labelKey]) => (
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
            {t('saveChanges')}
          </AuthSubmitButton>
        </div>
      </div>
    </div>,
    portalEl,
  )
}
