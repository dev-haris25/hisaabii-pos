'use client'

import { formatSarAmount } from '@/lib/settings/format-helpers'

/* eslint-disable @next/next/no-img-element -- authenticated logo URLs */

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'

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
import { PreparedByDisplay } from '@/components/finance/prepared-by-display'

/**
 * @typedef {{
 *   voucherNumber: string
 *   slipDate: string
 *   payPeriod: string
 *   referenceNumber: string | null
 *   description: string | null
 *   employer: {
 *     displayName: string
 *     logoUrl: string | null
 *     logoInitials: string
 *     address: string
 *     crNumber: string | null
 *     vatNumber: string | null
 *   }
 *   employee: {
 *     name: string
 *     idNumber: string | null
 *     joiningDate: string | null
 *     bankAccountName: string | null
 *     bankAccountNumber: string | null
 *     bankName: string | null
 *     bankIban: string | null
 *   }
 *   basicPay: number
 *   earnings: Array<{ id: string, categoryName: string, description: string, unit: string, unitRate: number, total: number }>
 *   deductions: Array<{ id: string, categoryName: string, description: string, unit: string, unitRate: number, total: number }>
 *   totalEarnings: number
 *   totalDeductions: number
 *   netPay: number
 *   preparedByUrl?: string | null
 *   preparedByName?: string | null
 * }} SalarySlipDocumentModel
 */

/**
 * @param {{ displayName: string, logoUrl: string | null }} props
 */
function EmployerBrand({ displayName, logoUrl }) {
  const [logoBroken, setLogoBroken] = useState(false)
  const src = logoUrl && !logoBroken ? logoUrl : null

  return (
    <div className="flex items-center gap-hisabi-md">
      {src ? (
        <img
          src={src}
          alt=""
          className="h-16 w-auto max-w-[14rem] shrink-0 object-contain"
          onError={() => setLogoBroken(true)}
        />
      ) : (
        <div className="min-w-0">
          <p className="type-headline-md text-hisabi-primary font-bold leading-tight">{displayName}</p>
        </div>
      )}
    </div>
  )
}

/**
 * @param {{ label: string, value: string, dir?: 'ltr' | 'rtl' }} props
 */
function MetaItem({ label, value, dir }) {
  return (
    <div className="min-w-0">
      <p className="type-label-sm text-hisabi-on-surface-variant mb-0.5 font-semibold uppercase tracking-wide">
        {label}
      </p>
      <p className="type-body-sm text-hisabi-on-surface font-semibold" dir={dir}>
        {value}
      </p>
    </div>
  )
}

/**
 * @param {{
 *   title: string
 *   rows: SalarySlipDocumentModel['earnings']
 *   totalLabel: string
 *   total: number
 *   formatMoney: (n: number) => string
 *   emptyLabel: string
 *   accentClass: string
 * }} props
 */
function PayslipLineTable({ title, rows, totalLabel, total, formatMoney, emptyLabel, accentClass, colItem, colQty, colRate, colAmount }) {
  return (
    <div className="min-w-0 flex-1">
      <div
        className={cn(
          'type-label-sm mb-hisabi-sm px-hisabi-md py-2 font-bold uppercase tracking-widest text-white',
          accentClass,
        )}
      >
        {title}
      </div>
      <div className={LIST_TABLE_SCROLL_WRAP}>
        <table className={cn(LIST_TABLE_BASE, 'min-w-[480px]')}>
          <thead>
            <tr className={LIST_TABLE_HEAD_ROW}>
              <th scope="col" className={listTableThClass('px-hisabi-md py-2.5 font-semibold normal-case', true)}>
                {colItem}
              </th>
              <th scope="col" className={listTableThClass('w-16 px-2 py-2.5 text-end font-semibold normal-case')}>
                {colQty}
              </th>
              <th scope="col" className={listTableThClass('w-24 px-2 py-2.5 text-end font-semibold normal-case')}>
                {colRate}
              </th>
              <th scope="col" className={listTableThClass('w-28 px-hisabi-md py-2.5 text-end font-semibold normal-case')}>
                {colAmount}
              </th>
            </tr>
          </thead>
          <tbody className={LIST_TABLE_BODY}>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="type-body-sm text-hisabi-on-surface-variant px-hisabi-md py-6 text-center"
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={LIST_TABLE_ROW}>
                  <td className={listTableTdClass('type-body-sm text-hisabi-on-surface px-hisabi-md py-2.5', true)}>
                    <span className="font-semibold">{row.categoryName || row.description || '—'}</span>
                    {row.categoryName && row.description ? (
                      <span className="text-hisabi-on-surface-variant mt-0.5 block text-xs">
                        {row.description}
                      </span>
                    ) : null}
                  </td>
                  <td className={listTableTdClass('type-body-sm px-2 py-2.5 text-end font-mono')} dir="ltr">
                    {row.unit}
                  </td>
                  <td className={listTableTdClass('type-body-sm px-2 py-2.5 text-end font-mono')} dir="ltr">
                    {formatMoney(row.unitRate)}
                  </td>
                  <td
                    className={listTableTdClass('type-body-sm px-hisabi-md py-2.5 text-end font-mono font-semibold')}
                    dir="ltr"
                  >
                    {formatMoney(row.total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <td
                colSpan={3}
                className={listTableTdClass('type-label-sm text-hisabi-on-surface px-hisabi-md py-3 text-end font-bold uppercase', true)}
              >
                {totalLabel}
              </td>
              <td className={listTableTdClass('type-body-md px-hisabi-md py-3 text-end font-mono font-bold')} dir="ltr">
                {formatMoney(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/**
 * @param {{ model: SalarySlipDocumentModel, className?: string, printMode?: boolean }} props
 */
export function SalarySlipDocumentView({ model, className, printMode = false }) {
  const t = useTranslations('HR')
  const locale = useLocale()
  const uiLocale = locale === 'ar' ? 'ar-SA' : 'en-US'

  const formatMoney = useCallback((n) => formatSarAmount(n, locale), [])

  const formatShortDate = useCallback(
    (iso) => {
      if (!iso) return '—'
      const ymd = String(iso).slice(0, 10)
      const d = new Date(`${ymd}T12:00:00`)
      if (Number.isNaN(d.getTime())) return '—'
      return new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium' }).format(d)
    },
    [uiLocale],
  )

  const formatPayPeriod = useCallback(
    (yyyyMm) => {
      const raw = String(yyyyMm ?? '').trim()
      if (!raw) return '—'
      const [y, m] = raw.split('-').map(Number)
      if (!y || !m) return raw
      return new Intl.DateTimeFormat(uiLocale, { month: 'long', year: 'numeric' }).format(
        new Date(y, m - 1, 1),
      )
    },
    [uiLocale],
  )

  return (
    <div
      className={cn(
        'overflow-hidden bg-white text-slate-800',
        printMode ? 'rounded-none border-0 shadow-none' : 'rounded-xl border border-slate-200 shadow-lg',
        className,
      )}
    >
      <div className="border-b-4 border-hisabi-primary bg-slate-50 px-hisabi-xl py-hisabi-lg">
        <div className="flex flex-wrap items-start justify-between gap-hisabi-lg">
          <EmployerBrand
            displayName={model.employer.displayName}
            logoUrl={model.employer.logoUrl}
          />
          <div className="text-end">
            <div className="type-label-sm mb-1 inline-block rounded bg-hisabi-primary px-3 py-1 font-bold uppercase tracking-widest text-white">
              {t('salarySlipDocumentLabel')}
            </div>
            <p className="type-headline-lg font-bold text-hisabi-primary" dir="ltr">
              {model.voucherNumber}
            </p>
            {model.referenceNumber ? (
              <p className="type-body-sm text-hisabi-on-surface-variant" dir="ltr">
                {t('payslipRefLabel')}: {model.referenceNumber}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-hisabi-md border-b border-slate-200 bg-white px-hisabi-xl py-hisabi-md sm:grid-cols-4">
        <MetaItem label={t('payslipPayPeriod')} value={formatPayPeriod(model.payPeriod)} />
        <MetaItem label={t('payslipPaymentDate')} value={formatShortDate(model.slipDate)} />
        <MetaItem label={t('payslipEmployeeName')} value={model.employee.name} />
        {model.employee.idNumber ? (
          <MetaItem label={t('payslipEmployeeId')} value={model.employee.idNumber} dir="ltr" />
        ) : null}
        {model.employee.joiningDate ? (
          <MetaItem label={t('fieldJoiningDate')} value={formatShortDate(model.employee.joiningDate)} />
        ) : null}
      </div>

      <div className="flex flex-col gap-hisabi-lg px-hisabi-xl py-hisabi-lg lg:flex-row">
        <PayslipLineTable
          title={t('earningsSection')}
          rows={model.earnings}
          totalLabel={t('totalEarningsLabel')}
          total={model.totalEarnings}
          formatMoney={formatMoney}
          emptyLabel={t('emptyLines')}
          accentClass="bg-emerald-600"
          colItem={t('payslipColItem')}
          colQty={t('payslipColQty')}
          colRate={t('payslipColRate')}
          colAmount={t('payslipColAmount')}
        />
        <PayslipLineTable
          title={t('deductionsSection')}
          rows={model.deductions}
          totalLabel={t('totalDeductionsLabel')}
          total={model.totalDeductions}
          formatMoney={formatMoney}
          emptyLabel={t('emptyLines')}
          accentClass="bg-rose-600"
          colItem={t('payslipColItem')}
          colQty={t('payslipColQty')}
          colRate={t('payslipColRate')}
          colAmount={t('payslipColAmount')}
        />
      </div>

      <div className="mx-hisabi-xl mb-hisabi-lg overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="bg-slate-50 px-hisabi-lg py-hisabi-md text-center">
            <p className="type-label-sm text-hisabi-on-surface-variant font-semibold uppercase">
              {t('fieldBasicPay')}
            </p>
            <p className="type-headline-md mt-1 font-mono font-bold text-hisabi-primary" dir="ltr">
              {formatMoney(model.basicPay)}
            </p>
          </div>
          <div className="bg-slate-50 px-hisabi-lg py-hisabi-md text-center">
            <p className="type-label-sm text-hisabi-on-surface-variant font-semibold uppercase">
              {t('totalEarningsLabel')}
            </p>
            <p className="type-headline-md mt-1 font-mono font-bold text-emerald-700" dir="ltr">
              {formatMoney(model.totalEarnings)}
            </p>
          </div>
          <div className="bg-slate-50 px-hisabi-lg py-hisabi-md text-center">
            <p className="type-label-sm text-hisabi-on-surface-variant font-semibold uppercase">
              {t('totalDeductionsLabel')}
            </p>
            <p className="type-headline-md mt-1 font-mono font-bold text-rose-700" dir="ltr">
              {formatMoney(model.totalDeductions)}
            </p>
          </div>
        </div>
        <div className="bg-hisabi-primary px-hisabi-xl py-hisabi-lg text-center">
          <p className="type-label-sm font-semibold uppercase tracking-widest text-white/80">
            {t('netTotalLabel')}
          </p>
          <p className="type-headline-xl mt-1 font-mono font-black text-white" dir="ltr">
            {formatMoney(model.netPay)}
          </p>
        </div>
      </div>

      {(model.employee.bankName ||
        model.employee.bankAccountNumber ||
        model.employee.bankIban) && (
        <div className="border-t border-slate-200 bg-slate-50 px-hisabi-xl py-hisabi-md">
          <p className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-sm font-bold uppercase tracking-wide">
            {t('sectionBankDetails')}
          </p>
          <div className="type-body-sm grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {model.employee.bankName ? (
              <p>
                <span className="text-hisabi-on-surface-variant">{t('fieldBankName')}: </span>
                <span className="font-semibold">{model.employee.bankName}</span>
              </p>
            ) : null}
            {model.employee.bankAccountName ? (
              <p>
                <span className="text-hisabi-on-surface-variant">{t('fieldBankAccountName')}: </span>
                <span className="font-semibold">{model.employee.bankAccountName}</span>
              </p>
            ) : null}
            {model.employee.bankAccountNumber ? (
              <p dir="ltr">
                <span className="text-hisabi-on-surface-variant">{t('fieldBankAccountNumber')}: </span>
                <span className="font-semibold">{model.employee.bankAccountNumber}</span>
              </p>
            ) : null}
            {model.employee.bankIban ? (
              <p dir="ltr">
                <span className="text-hisabi-on-surface-variant">{t('fieldBankIban')}: </span>
                <span className="font-semibold">{model.employee.bankIban}</span>
              </p>
            ) : null}
          </div>
        </div>
      )}

      <div className="border-t border-slate-200 px-hisabi-xl py-hisabi-md">
        <p className="type-body-sm text-hisabi-on-surface-variant text-center">{model.employer.address}</p>
        {model.employer.crNumber || model.employer.vatNumber ? (
          <p className="type-body-sm text-hisabi-on-surface-variant mt-1 text-center" dir="ltr">
            {[
              model.employer.crNumber ? `CR: ${model.employer.crNumber}` : null,
              model.employer.vatNumber ? `VAT: ${model.employer.vatNumber}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        {model.description ? (
          <p className="type-body-sm text-hisabi-on-surface-variant mt-hisabi-md text-center italic">
            {model.description}
          </p>
        ) : null}
        <div className="mt-hisabi-xl grid grid-cols-2 gap-hisabi-xl pt-hisabi-lg">
          <div className="border-t border-slate-300 pt-2 text-center">
            <div className="mb-2 flex h-14 items-center justify-center">
              <PreparedByDisplay
                imageUrl={model.preparedByUrl}
                name={model.preparedByName}
                className="max-h-12 max-w-full object-contain"
              />
            </div>
            <p className="type-label-sm text-hisabi-on-surface-variant">{t('payslipPreparedBy')}</p>
          </div>
          <div className="border-t border-slate-300 pt-2 text-center">
            <div className="mb-2 h-14" aria-hidden />
            <p className="type-label-sm text-hisabi-on-surface-variant">{t('payslipReceivedBy')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
