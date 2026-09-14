'use client'

import { formatSarAmount } from '@/lib/settings/format-helpers'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, Download, Loader2, Plus, Save, Send, Trash2, Wallet } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import { LookupWithInlineCreate } from '@/components/hr/lookup-with-inline-create'
import { SalarySlipSendSheet } from '@/components/hr/salary-slip-send-sheet'
import { SearchableEntityPicker } from '@/components/invoices/searchable-entity-picker'
import { FieldAutofillSpinner } from '@/components/shared/field-autofill-spinner'
import { useRouter } from '@/i18n/navigation'
import { authGet, authPatch, authPost } from '@/lib/api/auth-client'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import { computeLineTotal, computeSalarySlipTotals } from '@/lib/hr/salary-slips/compute-salary-slip-totals'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { useAuthStore } from '@/stores/auth-store'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

const selectClass =
  'type-body-md text-hisabi-on-surface w-full appearance-none rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 pe-10 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

const readOnlyClass =
  'type-body-md text-hisabi-on-surface w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-low px-hisabi-md py-3'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** @param {string | null | undefined} iso */
function isoToDateInput(iso) {
  if (!iso) return todayIso()
  return iso.slice(0, 10)
}

/**
 * @param {'earning' | 'deduction'} categoryType
 * @param {number} sortOrder
 */
function emptyLine(categoryType, sortOrder = 0) {
  return {
    payslipCategoryId: '',
    categoryType,
    description: '',
    unit: '1',
    unitRate: '0',
    sortOrder,
  }
}

/** @param {Record<string, unknown>} slip */
function slipToForm(slip) {
  const lines = slip.lines ?? []
  return {
    slipDate: isoToDateInput(String(slip.slipDate ?? '')),
    employeeId: String(slip.employeeId ?? ''),
    referenceNumber: String(slip.referenceNumber ?? ''),
    description: String(slip.description ?? ''),
    basicPay: String(slip.basicPay ?? '0'),
    lines: lines.length
      ? lines.map((l, idx) => ({
          payslipCategoryId: String(l.payslipCategoryId ?? ''),
          categoryType: l.categoryType,
          description: String(l.description ?? ''),
          unit: String(l.unit ?? '1'),
          unitRate: String(l.unitRate ?? '0'),
          sortOrder: l.sortOrder ?? idx,
        }))
      : [emptyLine('earning', 0), emptyLine('deduction', 0)],
  }
}

/**
 * @param {{
 *   title: string
 *   categoryType: 'earning' | 'deduction'
 *   lines: Array<Record<string, unknown>>
 *   categoryOptions: Array<{ id: string, label: string, type: string, defaultAmount: string }>
 *   onLinesChange: (lines: Array<Record<string, unknown>>) => void
 *   onCategoryCreated: (opt: { id: string, label: string, type: string, defaultAmount: string }) => void
 * }} props
 */
function LineItemsTable({
  title,
  categoryType,
  lines,
  categoryOptions,
  onLinesChange,
  onCategoryCreated,
}) {
  const t = useTranslations('HR')
  const filteredOptions = categoryOptions.filter((c) => c.type === categoryType)
  const typeLines = lines.filter((l) => l.categoryType === categoryType)

  function updateLine(index, patch) {
    const all = [...lines]
    const typeIndices = all
      .map((l, i) => (l.categoryType === categoryType ? i : -1))
      .filter((i) => i >= 0)
    const globalIdx = typeIndices[index]
    if (globalIdx === undefined) return
    all[globalIdx] = { ...all[globalIdx], ...patch }
    onLinesChange(all)
  }

  function addLine() {
    onLinesChange([
      ...lines,
      emptyLine(categoryType, lines.length),
    ])
  }

  function removeLine(index) {
    const all = [...lines]
    const typeIndices = all
      .map((l, i) => (l.categoryType === categoryType ? i : -1))
      .filter((i) => i >= 0)
    const globalIdx = typeIndices[index]
    if (globalIdx === undefined) return
    all.splice(globalIdx, 1)
    onLinesChange(all.length ? all : [emptyLine('earning', 0), emptyLine('deduction', 0)])
  }

  return (
    <section className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-hisabi-outline-variant/20 bg-slate-50/50 px-hisabi-lg py-hisabi-md">
        <h3 className="type-headline-sm font-bold text-hisabi-primary">{title}</h3>
        <button
          type="button"
          onClick={addLine}
          className="type-label-sm text-hisabi-primary inline-flex items-center gap-1 font-semibold hover:underline"
        >
          <Plus className="size-4" aria-hidden />
          {t('addLine')}
        </button>
      </div>
      <div className={LIST_TABLE_SCROLL_WRAP}>
        <table className={cn(LIST_TABLE_BASE, 'min-w-[720px]')}>
          <thead>
            <tr className={LIST_TABLE_HEAD_ROW}>
              <th className={listTableThClass(undefined, true)}>{t('colCategory')}</th>
              <th className={listTableThClass()}>{t('colDescription')}</th>
              <th className={listTableThClass()}>{t('colUnit')}</th>
              <th className={listTableThClass()}>{t('colUnitRate')}</th>
              <th className={listTableThClass()}>{t('colLineTotal')}</th>
              <th className={listTableThClass()}>{t('colActions')}</th>
            </tr>
          </thead>
          <tbody className={LIST_TABLE_BODY}>
            {typeLines.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="type-body-sm text-hisabi-on-surface-variant px-hisabi-md py-6 text-center"
                >
                  {t('emptyLines')}
                </td>
              </tr>
            ) : (
              typeLines.map((line, idx) => (
                <tr key={`${categoryType}-${idx}`} className={LIST_TABLE_ROW}>
                  <td className={listTableTdClass(undefined, true)}>
                    <LookupWithInlineCreate
                      kind="payslipCategory"
                      value={String(line.payslipCategoryId ?? '')}
                      onChange={(id) => {
                        const cat = filteredOptions.find((c) => c.id === id)
                        updateLine(idx, {
                          payslipCategoryId: id,
                          unitRate: cat?.defaultAmount ?? line.unitRate,
                        })
                      }}
                      options={filteredOptions.map((c) => ({
                        id: c.id,
                        label: c.label,
                      }))}
                      onOptionCreated={(opt) => {
                        onCategoryCreated({
                          id: opt.id,
                          label: opt.label,
                          type: categoryType,
                          defaultAmount: '0',
                        })
                        updateLine(idx, { payslipCategoryId: opt.id })
                      }}
                      selectClass={selectClass}
                    />
                  </td>
                  <td className={listTableTdClass()}>
                    <input
                      value={String(line.description ?? '')}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
                      className={fieldClass}
                      placeholder={t('placeholderLineDescription')}
                    />
                  </td>
                  <td className={listTableTdClass()}>
                    <input
                      value={String(line.unit ?? '1')}
                      onChange={(e) => updateLine(idx, { unit: e.target.value })}
                      className={fieldClass}
                      dir="ltr"
                      placeholder={t('placeholderUnit')}
                    />
                  </td>
                  <td className={listTableTdClass()}>
                    <input
                      value={String(line.unitRate ?? '0')}
                      onChange={(e) => updateLine(idx, { unitRate: e.target.value })}
                      className={fieldClass}
                      dir="ltr"
                      placeholder={t('placeholderUnitRate')}
                    />
                  </td>
                  <td className={listTableTdClass()}>
                    <div className={readOnlyClass} dir="ltr">
                      {computeLineTotal(line)}
                    </div>
                  </td>
                  <td className={listTableTdClass()}>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:text-hisabi-error"
                      aria-label={t('delete')}
                    >
                      <Trash2 className="size-5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * @param {{
 *   mode: 'add' | 'edit'
 *   salarySlip?: Record<string, unknown> | null
 *   salarySlipId?: string | null
 *   hasBusinessProfile?: boolean
 * }} props
 */
export function SalarySlipFormPage({ mode, salarySlip, salarySlipId, hasBusinessProfile }) {
  const t = useTranslations('HR')
  const tCommon = useTranslations('Common')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const titleId = useId()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )

  const [form, setForm] = useState(() =>
    mode === 'edit' && salarySlip ? slipToForm(salarySlip) : {
      slipDate: todayIso(),
      employeeId: '',
      referenceNumber: '',
      description: '',
      basicPay: '0',
      lines: [emptyLine('earning', 0), emptyLine('deduction', 0)],
    },
  )
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}))
  const [submitting, setSubmitting] = useState(false)
  const [sendSheetOpen, setSendSheetOpen] = useState(false)
  const [downloadPdfPending, setDownloadPdfPending] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState(
    /** @type {Array<{ id: string, label: string, type: string, defaultAmount: string }>} */ ([]),
  )
  const [outstandingAdvance, setOutstandingAdvance] = useState(/** @type {string | null} */ (null))
  const [autofillLoading, setAutofillLoading] = useState(false)

  useQuery({
    queryKey: ['hr-payslip-categories', activeBusinessProfileId],
    queryFn: async () => {
      const res = await authGet('/hr/payslip-categories')
      setCategoryOptions(
        (res.items ?? []).map((c) => ({
          id: c.id,
          label: c.name,
          type: c.type,
          defaultAmount: c.defaultAmount ?? '0',
        })),
      )
      return res
    },
    enabled: hasBusinessProfile === true && Boolean(activeBusinessProfileId),
  })

  const { data: employeesRes, isLoading: employeesLoading } = useQuery({
    queryKey: ['hr-employees', activeBusinessProfileId],
    queryFn: async () => authGet('/hr/employees?status=active'),
    enabled: hasBusinessProfile === true && Boolean(activeBusinessProfileId),
  })

  const { data: profileData } = useQuery({
    queryKey: ['business-profile', activeBusinessProfileId],
    queryFn: async () => authGet('/business-profile'),
    enabled: hasBusinessProfile === true && Boolean(activeBusinessProfileId),
  })

  const companyName =
    profileData?.profile?.companyNameEn?.trim() ||
    profileData?.profile?.companyNameAr?.trim() ||
    ''

  const employeeItems = useMemo(
    () =>
      (employeesRes?.items ?? []).map((e) => ({
        id: e.id,
        label: e.name,
        sublabel: e.emailOfficial ?? e.mobileOfficial ?? '',
        salary: e.salary,
      })),
    [employeesRes?.items],
  )

  const totals = useMemo(
    () => computeSalarySlipTotals(form.lines),
    [form.lines],
  )

  const loadEmployeeBalance = useCallback(async (employeeId) => {
    if (!employeeId) {
      setOutstandingAdvance(null)
      return
    }
    setAutofillLoading(true)
    try {
      const res = await authGet(`/hr/employees/${employeeId}`)
      const advance = res.balance?.outstandingAdvance
      const n = Number.parseFloat(String(advance ?? '0'))
      setOutstandingAdvance(n > 0 ? String(advance) : null)
    } catch {
      setOutstandingAdvance(null)
    } finally {
      setAutofillLoading(false)
    }
  }, [])

  async function handleEmployeeChange(employeeId) {
    setForm((prev) => ({ ...prev, employeeId }))
    setFieldErrors((prev) => ({ ...prev, employeeId: '' }))
    const emp = employeeItems.find((e) => e.id === employeeId)
    if (emp?.salary) {
      setForm((prev) => ({ ...prev, employeeId, basicPay: String(emp.salary) }))
    }
    await loadEmployeeBalance(employeeId)
  }

  function validate() {
    /** @type {Record<string, string>} */
    const next = {}
    if (!form.slipDate.trim()) next.slipDate = t('validationRequired')
    if (!form.employeeId.trim()) next.employeeId = t('validationRequired')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) {
      scrollAfterFieldValidation()
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        slipDate: form.slipDate,
        employeeId: form.employeeId,
        referenceNumber: form.referenceNumber.trim(),
        description: form.description.trim(),
        basicPay: form.basicPay.trim() || '0',
        lines: form.lines.map((line, idx) => ({
          payslipCategoryId: line.payslipCategoryId || null,
          categoryType: line.categoryType,
          description: line.description ?? '',
          unit: line.unit ?? '1',
          unitRate: line.unitRate ?? '0',
          sortOrder: line.sortOrder ?? idx,
        })),
      }
      if (mode === 'add') {
        await authPost('/hr/salary-slips', payload)
        toast.success(t('salarySlipAdded'))
      } else if (salarySlipId) {
        await authPatch(`/hr/salary-slips/${salarySlipId}`, payload)
        toast.success(t('salarySlipUpdated'))
      }
      await queryClient.invalidateQueries({ queryKey: ['hr-salary-slips'] })
      router.push('/hr/salary-slips')
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDownloadPdf() {
    if (!salarySlipId) return
    setDownloadPdfPending(true)
    try {
      const response = await fetch(
        `/api/auth/hr/salary-slips/${salarySlipId}/pdf?locale=${encodeURIComponent(locale)}`,
        { credentials: 'include' },
      )
      if (!response.ok) throw new Error('PDF download failed')
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/pdf')) throw new Error('Not a PDF')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${String(salarySlip?.voucherNumber ?? 'salary-slip')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setDownloadPdfPending(false)
    }
  }

  async function handleSendSalarySlipEmail(payload) {
    if (!salarySlipId) return
    try {
      await authPost(`/hr/salary-slips/${salarySlipId}/email`, { ...payload, locale })
    } catch (err) {
      toastAuthApiError(t, err)
      throw err
    }
  }

  const shell = (
    <div className="min-h-screen bg-transparent pb-hisabi-xxl">
      <header className="border-b border-transparent bg-transparent">
        <div className="mx-auto flex min-h-20 max-w-hisabi-container flex-wrap items-center gap-hisabi-md px-hisabi-md py-hisabi-md sm:px-hisabi-xl">
          <button
            type="button"
            onClick={() => router.push('/hr/salary-slips')}
            className="text-hisabi-primary hover:bg-hisabi-surface-container-low flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
            aria-label={t('backToSalarySlips')}
          >
            <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h1 id={titleId} className="type-headline-xl text-hisabi-on-surface tracking-tight">
              {mode === 'edit' ? t('editSalarySlipTitle') : t('addSalarySlipTitle')}
            </h1>
            <p className="type-body-md text-hisabi-on-surface-variant mt-0.5 max-w-2xl">
              {mode === 'edit' ? t('editSalarySlipSubtitle') : t('addSalarySlipSubtitle')}
            </p>
          </div>
          {mode === 'edit' && salarySlipId ? (
            <div className="flex shrink-0 flex-wrap items-center gap-hisabi-sm">
              <button
                type="button"
                onClick={() => setSendSheetOpen(true)}
                className="type-label-md border-hisabi-outline-variant text-hisabi-on-surface inline-flex min-h-[44px] items-center justify-center gap-hisabi-xs rounded-xl border px-hisabi-md py-2 font-semibold hover:bg-hisabi-surface-container-low"
              >
                <Send className="size-4 shrink-0" aria-hidden />
                {t('actionSendEmail')}
              </button>
              <button
                type="button"
                disabled={downloadPdfPending}
                onClick={() => void handleDownloadPdf()}
                className="type-label-md border-hisabi-outline-variant text-hisabi-on-surface inline-flex min-h-[44px] items-center justify-center gap-hisabi-xs rounded-xl border px-hisabi-md py-2 font-semibold hover:bg-hisabi-surface-container-low disabled:opacity-50"
              >
                {downloadPdfPending ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4 shrink-0" aria-hidden />
                )}
                {t('downloadPdf')}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="relative mx-auto w-full max-w-hisabi-container space-y-hisabi-xl px-hisabi-md py-hisabi-xl sm:px-hisabi-lg lg:px-hisabi-xl">
          <section className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-sm">
            <div className="flex items-center gap-hisabi-md border-b border-hisabi-outline-variant/20 px-hisabi-xl py-hisabi-lg">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hisabi-secondary-fixed text-hisabi-primary shadow-hisabi-1">
                <Wallet className="size-5" aria-hidden />
              </span>
              <h3 className="type-headline-md font-bold text-hisabi-primary">
                {t('salarySlipHeaderSection')}
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-hisabi-md p-hisabi-xl sm:grid-cols-2">
              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldSlipDate')}
                  <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>*</span>
                </label>
                <input
                  type="date"
                  value={form.slipDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, slipDate: e.target.value }))
                  }
                  className={cn(fieldClass, fieldErrors.slipDate && 'border-hisabi-error')}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldReferenceNumber')}
                </label>
                <input
                  value={form.referenceNumber}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, referenceNumber: e.target.value }))
                  }
                  className={fieldClass}
                  placeholder={t('placeholderReferenceNumber')}
                />
              </div>

              <div className="space-y-hisabi-xs sm:col-span-2">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldEmployee')}
                  <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>*</span>
                </label>
                <SearchableEntityPicker
                  items={employeeItems}
                  loading={employeesLoading}
                  value={form.employeeId}
                  onChange={(id) => void handleEmployeeChange(id)}
                  emptyLabel={t('selectEmployee')}
                  searchPlaceholder={t('searchEmployeesPlaceholder')}
                  triggerClassName={cn(selectClass, fieldErrors.employeeId && 'border-hisabi-error')}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant flex items-center gap-hisabi-xs">
                  <span>{t('fieldBasicPay')}</span>
                  <FieldAutofillSpinner loading={autofillLoading} label={tCommon('loadingDetails')} />
                </label>
                <div className={readOnlyClass} dir="ltr">
                  {form.basicPay}
                </div>
              </div>

              <div className="space-y-hisabi-xs sm:col-span-2">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldSlipDescription')}
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className={cn(fieldClass, 'resize-none')}
                  placeholder={t('placeholderSlipDescription')}
                />
              </div>
            </div>
          </section>

          <LineItemsTable
            title={t('earningsSection')}
            categoryType="earning"
            lines={form.lines}
            categoryOptions={categoryOptions}
            onLinesChange={(lines) => setForm((prev) => ({ ...prev, lines }))}
            onCategoryCreated={(opt) => setCategoryOptions((prev) => [...prev, opt])}
          />

          {outstandingAdvance ? (
            <div
              role="status"
              className="rounded-xl border border-orange-200 bg-orange-50/90 px-hisabi-lg py-hisabi-md text-orange-900"
            >
              <p className="type-body-sm">
                {t('advanceBanner', { amount: outstandingAdvance })}
              </p>
            </div>
          ) : null}

          <LineItemsTable
            title={t('deductionsSection')}
            categoryType="deduction"
            lines={form.lines}
            categoryOptions={categoryOptions}
            onLinesChange={(lines) => setForm((prev) => ({ ...prev, lines }))}
            onCategoryCreated={(opt) => setCategoryOptions((prev) => [...prev, opt])}
          />

          <div className="grid grid-cols-1 gap-hisabi-lg sm:grid-cols-3">
            {[
              ['totalEarningsLabel', totals.totalEarnings],
              ['totalDeductionsLabel', totals.totalDeductions],
              ['netTotalLabel', totals.netTotal],
            ].map(([labelKey, value]) => (
              <div
                key={labelKey}
                className="rounded-xl border border-hisabi-outline-variant/30 bg-white p-hisabi-lg shadow-sm"
              >
                <p className="type-label-sm mb-2 font-bold uppercase tracking-wider text-hisabi-outline">
                  {t(labelKey)}
                </p>
                <p className="type-headline-md font-mono text-hisabi-primary" dir="ltr">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-hisabi-xl flex w-full max-w-hisabi-container flex-col-reverse gap-hisabi-md border-t border-hisabi-outline-variant/20 px-hisabi-md pt-hisabi-xl pb-hisabi-lg sm:px-hisabi-xl min-[500px]:flex-row min-[500px]:justify-end min-[500px]:gap-hisabi-xl min-[500px]:border-t-0 min-[500px]:pb-hisabi-xxl min-[500px]:pt-0">
          <button
            type="button"
            onClick={() => router.push('/hr/salary-slips')}
            className="type-label-md text-hisabi-primary hover:bg-hisabi-surface-container-low inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border border-hisabi-primary/20 px-hisabi-lg font-semibold transition-all active:scale-[0.98] min-[500px]:w-auto min-[500px]:min-w-[10rem]"
          >
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="submit"
            variant="gold"
            pending={submitting}
            className="min-h-0 w-full min-w-0 py-4 min-[500px]:w-auto min-[500px]:min-w-[12rem]"
          >
            <span className="flex items-center justify-center gap-hisabi-sm">
              <Save className="size-5 shrink-0" aria-hidden />
              {mode === 'edit' ? t('saveChanges') : t('saveSalarySlip')}
            </span>
          </AuthSubmitButton>
        </div>
      </form>
    </div>
  )

  if (hasBusinessProfile !== true) {
    return (
      <div className="mx-auto max-w-hisabi-container">
        <NoCompanyProfileBanner className="mb-hisabi-lg" />
        <div className="pointer-events-none select-none opacity-40">{shell}</div>
      </div>
    )
  }

  return (
    <>
      {shell}
      {mode === 'edit' && salarySlipId && salarySlip ? (
        <SalarySlipSendSheet
          open={sendSheetOpen}
          onOpenChange={setSendSheetOpen}
          voucherNumber={String(salarySlip.voucherNumber ?? '')}
          employeeName={String(salarySlip.employeeName ?? '')}
          netPay={formatSarAmount(totals.netTotal, locale)}
          companyName={companyName}
          defaultToEmail={String(
            salarySlip.employeeEmailOfficial || salarySlip.employeeEmailPersonal || '',
          ).trim()}
          defaultSubject={t('sendSalarySlipSheetDefaultSubject', {
            employee: String(salarySlip.employeeName ?? ''),
            voucher: String(salarySlip.voucherNumber ?? ''),
          })}
          defaultMessage={t('sendSalarySlipSheetDefaultMessage')}
          onSend={handleSendSalarySlipEmail}
        />
      ) : null}
    </>
  )
}
