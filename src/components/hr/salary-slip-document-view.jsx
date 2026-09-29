'use client'

import { formatSarAmount } from '@/lib/settings/format-helpers'

/* eslint-disable @next/next/no-img-element -- authenticated logo URLs */

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'

import { cn } from '@/lib/utils'

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
 *     nationality: string | null
 *     passportNumber: string | null
 *     email: string | null
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

  if (src) {
    return (
      <img
        src={src}
        alt={displayName}
        className="mx-auto h-24 w-auto max-w-[16rem] object-contain"
        onError={() => setLogoBroken(true)}
      />
    )
  }

  return (
    <p className="type-headline-lg text-center font-bold text-hisabi-primary">{displayName}</p>
  )
}

/**
 * @param {{ label: string, value: string, dir?: 'ltr' | 'rtl' }} props
 */
function FactLine({ label, value, dir }) {
  return (
    <p className="type-body-md text-hisabi-on-surface">
      <span>{label}</span>
      <span> : </span>
      <span dir={dir}>{value}</span>
    </p>
  )
}

/**
 * @param {{ model: SalarySlipDocumentModel, className?: string, printMode?: boolean }} props
 */
export function SalarySlipDocumentView({ model, className, printMode = false }) {
  const t = useTranslations('HR')
  const locale = useLocale()
  const uiLocale = locale === 'ar' ? 'ar-SA' : 'en-US'

  const formatMoney = useCallback((n) => formatSarAmount(n, locale), [locale])

  const formatLetterDate = useCallback(
    (iso) => {
      if (!iso) return '—'
      const ymd = String(iso).slice(0, 10)
      const d = new Date(`${ymd}T12:00:00`)
      if (Number.isNaN(d.getTime())) return '—'
      return new Intl.DateTimeFormat(uiLocale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d)
    },
    [uiLocale],
  )

  const reference = model.referenceNumber || model.voucherNumber
  const companyName = model.employer.displayName
  const currency = t('payslipCurrency')

  /** @type {Array<{ key: string, label: string, amount: number, emphasize?: boolean }>} */
  const breakdownRows = [
    ...model.earnings.map((row) => ({
      key: `e-${row.id}`,
      label: row.categoryName || row.description || t('earningsSection'),
      amount: row.total,
    })),
    ...model.deductions.map((row) => ({
      key: `d-${row.id}`,
      label: row.categoryName || row.description || t('deductionsSection'),
      amount: -Math.abs(row.total),
    })),
    {
      key: 'net',
      label: t('netTotalLabel'),
      amount: model.netPay,
      emphasize: true,
    },
  ]

  return (
    <div
      className={cn(
        'bg-white text-slate-900',
        printMode ? 'rounded-none border-0 shadow-none' : 'rounded-xl border border-slate-200 shadow-lg',
        className,
      )}
    >
      <div className="px-hisabi-xl py-hisabi-xl sm:px-12 sm:py-14">
        <div className="mb-hisabi-xxl">
          <EmployerBrand
            displayName={model.employer.displayName}
            logoUrl={model.employer.logoUrl}
          />
        </div>

        <div className="type-body-md mb-hisabi-xl space-y-1">
          <p>
            {t('payslipLetterReference')} : {reference}
          </p>
          <p>
            {t('payslipLetterDate')} : {formatLetterDate(model.slipDate)}
          </p>
        </div>

        <h1 className="type-headline-md mb-hisabi-xl text-center font-bold underline underline-offset-4">
          {t('payslipLetterTitle')}
        </h1>

        <div className="mb-hisabi-lg space-y-1">
          <FactLine label={t('payslipLetterEmpName')} value={model.employee.name} />
          {model.employee.nationality ? (
            <FactLine label={t('fieldNationality')} value={model.employee.nationality} />
          ) : null}
          {model.employee.idNumber ? (
            <FactLine label={t('payslipEmployeeId')} value={model.employee.idNumber} dir="ltr" />
          ) : null}
          {model.employee.joiningDate ? (
            <FactLine
              label={t('fieldJoiningDate')}
              value={formatLetterDate(model.employee.joiningDate)}
            />
          ) : null}
          {model.employee.passportNumber ? (
            <FactLine
              label={t('fieldPassportNumber')}
              value={model.employee.passportNumber}
              dir="ltr"
            />
          ) : null}
          {model.employee.email ? (
            <FactLine label={t('fieldEmailOfficial')} value={model.employee.email} dir="ltr" />
          ) : null}
        </div>

        <table className="mb-hisabi-xl w-full border-collapse border border-black text-start">
          <thead>
            <tr className="bg-neutral-200">
              <th
                scope="col"
                className="type-label-md border border-black px-hisabi-md py-2 font-bold"
              >
                {t('payslipLetterBreakdown')}
              </th>
              <th
                scope="col"
                className="type-label-md w-40 border border-black px-hisabi-md py-2 text-end font-bold"
              >
                {t('payslipLetterAmount', { currency })}
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdownRows.map((row) => (
              <tr key={row.key} className={row.emphasize ? 'bg-neutral-50' : undefined}>
                <td
                  className={cn(
                    'type-body-md border border-black px-hisabi-md py-2',
                    row.emphasize && 'font-bold',
                  )}
                >
                  {row.label}
                </td>
                <td
                  className={cn(
                    'type-body-md border border-black px-hisabi-md py-2 text-end font-mono',
                    row.emphasize && 'font-bold',
                  )}
                  dir="ltr"
                >
                  {formatMoney(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="type-body-md mb-hisabi-lg space-y-hisabi-md leading-relaxed">
          <p>{t('payslipLetterIssued', { company: companyName })}</p>
          <p>
            {model.description?.trim()
              ? model.description.trim()
              : t('payslipLetterPurpose')}
          </p>
          <p>{t('payslipLetterRegards')}</p>
        </div>

        <div className="mb-hisabi-xl mt-hisabi-xxl grid grid-cols-2 gap-hisabi-xl">
          <div className="text-center">
            <div className="mb-2 h-16" aria-hidden />
            <div className="border-t border-black pt-2">
              <p className="type-label-sm text-hisabi-on-surface">{t('payslipPreparedBy')}</p>
            </div>
          </div>
          <div className="text-center">
            <div className="mb-2 h-16" aria-hidden />
            <div className="border-t border-black pt-2">
              <p className="type-label-sm text-hisabi-on-surface">{t('payslipReceivedBy')}</p>
            </div>
          </div>
        </div>

        {(model.employer.address && model.employer.address !== '—') ||
        model.employer.crNumber ||
        model.employer.vatNumber ? (
          <p className="type-body-sm text-hisabi-on-surface-variant mt-hisabi-xxl">
            {[
              model.employer.address !== '—' ? model.employer.address : null,
              model.employer.crNumber ? `CR ${model.employer.crNumber}` : null,
              model.employer.vatNumber ? `VAT ${model.employer.vatNumber}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>
    </div>
  )
}
