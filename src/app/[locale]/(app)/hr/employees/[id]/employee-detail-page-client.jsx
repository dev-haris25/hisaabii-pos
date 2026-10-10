'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  ChevronLeft,
  CreditCard,
  Landmark,
  Mail,
  Pencil,
  Phone,
  Plane,
  Receipt,
  TrendingUp,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { AppLoader } from '@/components/app-loader'
import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import {
  DetailTablePagination,
  paginateItems,
} from '@/components/hr/detail-table-pagination'
import { PromoteEmployeeSheet } from '@/components/hr/promote-employee-sheet'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { Link } from '@/i18n/navigation'
import { authGet } from '@/lib/api/auth-client'
import { formatSarAmount } from '@/lib/settings/format-helpers'
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
import { useAuthStore } from '@/stores/auth-store'

/** @param {string | null | undefined} yyyyMm @param {string} locale */
function formatPayPeriod(yyyyMm, locale) {
  const raw = String(yyyyMm ?? '').trim()
  if (!raw) return '—'
  const [y, m] = raw.split('-').map(Number)
  if (!y || !m) return raw
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  )
}

/**
 * @param {{ oldValue?: string | null, newValue?: string | null, locale?: string, amount?: boolean }} props
 */
function PromotionChangeCell({ oldValue, newValue, locale, amount = false }) {
  const oldDisplay = oldValue?.trim() || '—'
  const newDisplay = newValue?.trim() || '—'
  const format = (v) => (amount && v !== '—' && locale ? formatAmount(v, locale) : v)

  if (oldDisplay === newDisplay) {
    return (
      <span className="font-mono" dir="ltr">
        {format(newDisplay)}
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5 font-mono" dir="ltr">
      <span className="text-hisabi-on-surface-variant">{format(oldDisplay)}</span>
      <span className="text-hisabi-on-surface-variant" aria-hidden>
        →
      </span>
      <span className="font-semibold text-hisabi-primary">{format(newDisplay)}</span>
    </span>
  )
}

/** @param {string | null | undefined} iso */
function formatDate(iso, locale) {
  if (!iso) return '—'
  const uiLocale = locale === 'ar' ? 'ar-SA' : 'en-US'
  return new Intl.DateTimeFormat(uiLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

/** @param {string | number | null | undefined} v @param {string} [locale] */
function formatAmount(v, locale) {
  return formatSarAmount(v, locale)
}

/** @param {string} raw */
function initialsFromName(raw) {
  const s = String(raw ?? '').trim()
  if (!s || s === '—') return '?'
  const w = s.split(/\s+/).filter(Boolean)
  if (w.length >= 2 && w[0][0] && w[1][0]) {
    return (w[0][0] + w[1][0]).toUpperCase()
  }
  return s.slice(0, 2).toUpperCase()
}

/**
 * @param {{
 *   label: string
 *   value: string
 *   className?: string
 *   valueDir?: 'ltr' | 'rtl'
 * }} props
 */
function DetailField({ label, value, className, valueDir }) {
  return (
    <div className={cn('space-y-1', className)}>
      <p className="type-label-md text-hisabi-on-surface-variant">{label}</p>
      <p className="type-body-md text-hisabi-on-surface break-words" dir={valueDir}>
        {value || '—'}
      </p>
    </div>
  )
}

const sectionHeaderClass =
  'flex items-center gap-hisabi-md border-b border-hisabi-outline-variant/20 px-hisabi-xl py-hisabi-lg text-start sm:px-hisabi-xxl'

const sectionBodyClass =
  'px-hisabi-xl pb-hisabi-xl pt-hisabi-md sm:px-hisabi-xxl sm:pb-hisabi-xxl sm:pt-hisabi-lg'

/**
 * @param {{
 *   title: string
 *   icon: import('lucide-react').LucideIcon
 *   children: import('react').ReactNode
 * }} props
 */
function DetailSection({ title, icon: Icon, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-sm">
      <div className={sectionHeaderClass}>
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hisabi-secondary-fixed text-hisabi-primary shadow-hisabi-1"
          aria-hidden
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <h2 className="type-headline-md font-bold text-hisabi-primary">{title}</h2>
      </div>
      <div
        className={cn(
          sectionBodyClass,
          'grid grid-cols-1 gap-hisabi-lg sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {children}
      </div>
    </section>
  )
}

/**
 * @param {{
 *   label: string
 *   value: string
 *   icon: import('lucide-react').LucideIcon
 *   iconClassName: string
 * }} props
 */
function BalanceStatCard({ label, value, icon: Icon, iconClassName }) {
  return (
    <div className="border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest flex items-center gap-hisabi-md rounded-xl border p-hisabi-lg shadow-sm transition-shadow hover:shadow-md">
      <div
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full',
          iconClassName,
        )}
      >
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="type-label-sm text-hisabi-on-surface-variant font-medium">{label}</p>
        <p className="type-headline-md text-hisabi-primary font-bold font-mono" dir="ltr">
          {value}
        </p>
      </div>
    </div>
  )
}

/** @param {string | null | undefined} codeOrName @param {Array<{ code: string, name: string }>} countries */
function resolveNationalityLabel(codeOrName, countries) {
  const raw = String(codeOrName ?? '').trim()
  if (!raw) return '—'
  const row = countries.find((c) => c.code === raw.toUpperCase())
  return row?.name?.trim() || raw
}

/**
 * @param {{ employeeId: string, hasBusinessProfile?: boolean }} props
 */
export function EmployeeDetailPageClient({ employeeId, hasBusinessProfile }) {
  const t = useTranslations('HR')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const ability = useAppAbility()
  const canUpdateEmployee = ability.can('update', 'Employee')
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [salarySlipsPage, setSalarySlipsPage] = useState(1)
  const [paymentsPage, setPaymentsPage] = useState(1)
  const [promotionsPage, setPromotionsPage] = useState(1)
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )

  const { data, isPending, isError } = useQuery({
    queryKey: ['hr-employee', employeeId],
    queryFn: async () => authGet(`/hr/employees/${employeeId}`),
    enabled: hasBusinessProfile === true && Boolean(employeeId) && Boolean(activeBusinessProfileId),
  })

  const { data: countries = [] } = useQuery({
    queryKey: ['countries', 'world-v1'],
    queryFn: async () => {
      const res = await authGet('/countries')
      return /** @type {Array<{ code: string, name: string }>} */ (res.countries ?? [])
    },
    enabled: hasBusinessProfile === true,
    staleTime: 86_400_000,
  })

  useEffect(() => {
    setSalarySlipsPage(1)
    setPaymentsPage(1)
    setPromotionsPage(1)
  }, [employeeId])

  if (hasBusinessProfile !== true) {
    return (
      <div className="mx-auto max-w-hisabi-container px-hisabi-md py-hisabi-xl">
        <NoCompanyProfileBanner />
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="text-hisabi-on-surface-variant mx-auto flex min-h-[50vh] max-w-hisabi-container items-center justify-center px-hisabi-md py-hisabi-xxl">
        <AppLoader size="lg" />
        <span className="sr-only">{t('loadError')}</span>
      </div>
    )
  }

  if (isError || !data?.item) {
    return (
      <div className="mx-auto max-w-hisabi-container px-hisabi-md py-hisabi-xl">
        <p className="type-body-md text-hisabi-error">{t('loadError')}</p>
        <Link href="/hr/employees" className="type-label-md text-hisabi-primary mt-hisabi-md inline-block">
          {t('backToEmployees')}
        </Link>
      </div>
    )
  }

  const emp = data.item
  const balance = data.balance ?? {}
  const salarySlips = data.salarySlips ?? []
  const payments = data.payments ?? []
  const promotions = data.promotions ?? []

  const salarySlipsPagination = paginateItems(salarySlips, salarySlipsPage)
  const paymentsPagination = paginateItems(payments, paymentsPage)
  const promotionsPagination = paginateItems(promotions, promotionsPage)

  const genderLabel = {
    male: t('genderMale'),
    female: t('genderFemale'),
    unspecified: t('genderUnspecified'),
  }[emp.gender] ?? emp.gender

  const maritalLabel = {
    single: t('maritalSingle'),
    married: t('maritalMarried'),
    other: t('maritalOther'),
    unspecified: t('maritalUnspecified'),
  }[emp.maritalStatus] ?? emp.maritalStatus

  const photoSrc =
    typeof emp.photoUrl === 'string' && emp.photoUrl.length > 0 ? emp.photoUrl : null

  const balanceStats = [
    {
      label: t('balanceTotalEarned'),
      value: formatAmount(balance.totalEarned, locale),
      icon: TrendingUp,
      iconClassName: 'bg-hisabi-primary-container/25 text-hisabi-primary',
    },
    {
      label: t('balanceTotalPaid'),
      value: formatAmount(balance.totalSalaryPaid, locale),
      icon: Banknote,
      iconClassName: 'bg-hisabi-gold-muted/50 text-hisabi-secondary',
    },
    {
      label: t('balanceOutstandingAdvance'),
      value: formatAmount(balance.outstandingAdvance, locale),
      icon: Wallet,
      iconClassName: 'bg-hisabi-error/15 text-hisabi-error',
    },
    {
      label: t('balanceNetBalance'),
      value: formatAmount(balance.netBalance, locale),
      icon: CreditCard,
      iconClassName: 'bg-hisabi-primary-fixed/40 text-hisabi-primary',
    },
  ]

  return (
    <div className="bg-hisabi-background min-h-[calc(100vh-4rem)] pb-hisabi-xxl">
      <div className="sticky top-0 z-10 bg-transparent">
        <div className="mx-auto flex max-w-hisabi-container items-center justify-between gap-hisabi-md px-hisabi-md py-hisabi-sm sm:px-hisabi-xl">
          <div className="flex min-w-0 items-center gap-hisabi-md">
            <Link
              href="/hr/employees"
              className="text-hisabi-primary hover:bg-hisabi-surface-container-low flex size-10 shrink-0 items-center justify-center rounded-full transition-colors"
              aria-label={t('backToEmployees')}
            >
              <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
            </Link>
            <span className="type-headline-md text-hisabi-primary truncate font-bold">
              {emp.name}
            </span>
          </div>
          {canUpdateEmployee ? (
            <button
              type="button"
              onClick={() => setPromoteOpen(true)}
              className="type-label-md bg-hisabi-primary text-hisabi-on-primary hover:bg-hisabi-primary/90 inline-flex shrink-0 cursor-pointer items-center gap-hisabi-xs rounded-xl px-hisabi-lg py-2.5 font-semibold transition-colors"
            >
              <TrendingUp className="size-4" aria-hidden />
              {t('promoteEmployee')}
            </button>
          ) : null}
        </div>
      </div>

      {canUpdateEmployee ? (
        <PromoteEmployeeSheet
          open={promoteOpen}
          onOpenChange={setPromoteOpen}
          employeeId={employeeId}
          employeeName={emp.name}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['hr-employee', employeeId] })
          }}
        />
      ) : null}

      <div className="mx-auto max-w-hisabi-container space-y-hisabi-lg px-hisabi-md py-hisabi-xl sm:px-hisabi-xl">
        <div className="grid grid-cols-1 gap-hisabi-lg md:grid-cols-2 xl:grid-cols-4">
          {balanceStats.map((stat) => (
            <BalanceStatCard key={stat.label} {...stat} />
          ))}
        </div>

        <div className="border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest flex flex-col items-start justify-between gap-hisabi-lg rounded-xl border p-hisabi-lg shadow-sm md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-hisabi-lg">
            <div className="bg-hisabi-primary-container text-hisabi-on-primary-container relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full ring-4 ring-hisabi-surface-container-low">
              {photoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated employee asset URL
                <img src={photoSrc} alt="" className="size-full object-cover" />
              ) : (
                <span className="type-headline-lg font-bold">{initialsFromName(emp.name)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-hisabi-sm">
              <div className="flex flex-wrap items-center gap-hisabi-sm">
                <h1 className="type-headline-lg text-hisabi-primary break-words">{emp.name}</h1>
                <span
                  className={cn(
                    'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                    emp.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {emp.status === 'active' ? t('statusActive') : t('statusInactive')}
                </span>
              </div>
              <div className="text-hisabi-on-surface-variant type-body-sm flex flex-wrap items-center gap-x-hisabi-md gap-y-1">
                {emp.mobileOfficial ? (
                  <span className="inline-flex items-center gap-hisabi-xs" dir="ltr">
                    <Phone className="size-4 shrink-0" aria-hidden />
                    {emp.mobileOfficial}
                  </span>
                ) : null}
                {emp.emailOfficial ? (
                  <span className="inline-flex items-center gap-hisabi-xs" dir="ltr">
                    <Mail className="size-4 shrink-0" aria-hidden />
                    {emp.emailOfficial}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {canUpdateEmployee ? (
            <Link
              href={`/hr/employees/${employeeId}/edit`}
              className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
            >
              <Pencil className="size-4 shrink-0" aria-hidden />
              {t('edit')}
            </Link>
          ) : null}
        </div>

        <div className="space-y-hisabi-lg">
          <DetailSection title={t('sectionEmployeeDetails')} icon={Users}>
            <DetailField label={t('fieldMobileOfficial')} value={emp.mobileOfficial} valueDir="ltr" />
            <DetailField label={t('fieldEmailOfficial')} value={emp.emailOfficial} valueDir="ltr" />
            <DetailField
              label={t('fieldJoiningDate')}
              value={formatDate(emp.joiningDate, locale)}
            />
            <DetailField
              label={t('fieldSalary')}
              value={formatAmount(emp.salary, locale)}
              valueDir="ltr"
            />
            <DetailField label={t('fieldHigherEducation')} value={emp.higherEducation} />
            <DetailField label={t('fieldExperience')} value={emp.experience} />
            <DetailField label={t('fieldReportingTo')} value={emp.reportingToName} />
          </DetailSection>

          <DetailSection title={t('sectionPersonalDetails')} icon={User}>
            <DetailField
              label={t('fieldNationality')}
              value={resolveNationalityLabel(emp.nationality, countries)}
            />
            <DetailField
              label={t('fieldDateOfBirth')}
              value={formatDate(emp.dateOfBirth, locale)}
            />
            <DetailField label={t('fieldMobilePersonal')} value={emp.mobilePersonal} valueDir="ltr" />
            <DetailField label={t('fieldEmailPersonal')} value={emp.emailPersonal} valueDir="ltr" />
            <DetailField
              label={t('fieldEmergencyContactName')}
              value={emp.emergencyContactName}
            />
            <DetailField
              label={t('fieldEmergencyContactNumber')}
              value={emp.emergencyContactNumber}
              valueDir="ltr"
            />
            <DetailField label={t('fieldAddress')} value={emp.address} className="sm:col-span-2" />
            <DetailField label={t('fieldShortAddress')} value={emp.shortAddress} className="sm:col-span-2" />
            <DetailField label={t('fieldBloodGroup')} value={emp.bloodGroup} />
            <DetailField label={t('fieldGender')} value={genderLabel} />
            <DetailField label={t('fieldMaritalStatus')} value={maritalLabel} />
            <DetailField label={t('fieldIdType')} value={emp.idTypeName} />
            <DetailField label={t('fieldIdNumber')} value={emp.idNumber} valueDir="ltr" />
            <DetailField
              label={t('fieldIdExpiry')}
              value={formatDate(emp.idExpiry, locale)}
            />
          </DetailSection>

          <DetailSection title={t('sectionBankDetails')} icon={Landmark}>
            <DetailField label={t('fieldBankAccountName')} value={emp.bankAccountName} />
            <DetailField
              label={t('fieldBankAccountNumber')}
              value={emp.bankAccountNumber}
              valueDir="ltr"
            />
            <DetailField label={t('fieldBankName')} value={emp.bankName} />
            <DetailField label={t('fieldBankIban')} value={emp.bankIban} valueDir="ltr" />
            <DetailField label={t('fieldBankBranch')} value={emp.bankBranch} />
          </DetailSection>

          <DetailSection title={t('sectionVisaPassport')} icon={Plane}>
            <DetailField label={t('fieldPassportNumber')} value={emp.passportNumber} valueDir="ltr" />
            <DetailField
              label={t('fieldPassportExpiry')}
              value={formatDate(emp.passportExpiry, locale)}
            />
            <DetailField label={t('fieldVisaNumber')} value={emp.visaNumber} valueDir="ltr" />
            <DetailField
              label={t('fieldVisaIssueDate')}
              value={formatDate(emp.visaIssueDate, locale)}
            />
            <DetailField
              label={t('fieldVisaEntryDate')}
              value={formatDate(emp.visaEntryDate, locale)}
            />
            <DetailField
              label={t('fieldVisaExpiry')}
              value={formatDate(emp.visaExpiry, locale)}
            />
            <DetailField label={t('fieldRemark')} value={emp.remark} className="sm:col-span-2" />
          </DetailSection>

          <section className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-sm">
            <div className={sectionHeaderClass}>
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hisabi-secondary-fixed text-hisabi-primary shadow-hisabi-1"
                aria-hidden
              >
                <Receipt className="size-5" aria-hidden />
              </span>
              <h2 className="type-headline-md font-bold text-hisabi-primary">
                {t('salarySlipsSection')}
              </h2>
            </div>
            <div className={cn(sectionBodyClass, LIST_TABLE_SCROLL_WRAP, 'pt-0 sm:pt-0')}>
              <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
                <thead>
                  <tr className={LIST_TABLE_HEAD_ROW}>
                    <th scope="col" className={listTableThClass(undefined, true)}>
                      {t('colSlipDate')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colVoucherNo')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colNetTotal')}
                    </th>
                  </tr>
                </thead>
                <tbody className={LIST_TABLE_BODY}>
                  {salarySlips.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-8 text-center"
                      >
                        {t('empty')}
                      </td>
                    </tr>
                  ) : (
                    salarySlipsPagination.pageRows.map((slip) => (
                      <tr key={slip.id} className={LIST_TABLE_ROW}>
                        <td className={listTableTdClass('type-body-sm', true)}>
                          {formatDate(slip.slipDate, locale)}
                        </td>
                        <td className={listTableTdClass('type-body-sm font-mono')} dir="ltr">
                          <Link
                            href={`/hr/salary-slips/${slip.id}`}
                            className="text-hisabi-primary hover:underline"
                          >
                            {slip.voucherNumber}
                          </Link>
                        </td>
                        <td className={listTableTdClass('type-body-sm font-mono')} dir="ltr">
                          {formatAmount(slip.netTotal, locale)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <DetailTablePagination
              totalItems={salarySlipsPagination.totalItems}
              page={salarySlipsPage}
              totalPages={salarySlipsPagination.totalPages}
              onPageChange={setSalarySlipsPage}
            />
          </section>

          <section className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-sm">
            <div className={sectionHeaderClass}>
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hisabi-secondary-fixed text-hisabi-primary shadow-hisabi-1"
                aria-hidden
              >
                <CreditCard className="size-5" aria-hidden />
              </span>
              <h2 className="type-headline-md font-bold text-hisabi-primary">
                {t('paymentsSection')}
              </h2>
            </div>
            <div className={cn(sectionBodyClass, LIST_TABLE_SCROLL_WRAP, 'pt-0 sm:pt-0')}>
              <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
                <thead>
                  <tr className={LIST_TABLE_HEAD_ROW}>
                    <th scope="col" className={listTableThClass(undefined, true)}>
                      {t('colPaymentDate')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colPaymentType')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colAmount')}
                    </th>
                  </tr>
                </thead>
                <tbody className={LIST_TABLE_BODY}>
                  {payments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-8 text-center"
                      >
                        {t('empty')}
                      </td>
                    </tr>
                  ) : (
                    paymentsPagination.pageRows.map((payment) => (
                      <tr key={payment.id} className={LIST_TABLE_ROW}>
                        <td className={listTableTdClass('type-body-sm', true)}>
                          {formatDate(payment.paymentDate, locale)}
                        </td>
                        <td className={listTableTdClass()}>
                          <span
                            className={cn(
                              'type-label-sm inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold',
                              payment.paymentType === 'salary'
                                ? 'bg-green-100 text-green-700'
                                : payment.paymentType === 'bonus'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-orange-100 text-orange-800',
                            )}
                          >
                            {payment.paymentType === 'salary'
                              ? t('paymentTypeSalary')
                              : payment.paymentType === 'bonus'
                                ? t('paymentTypeBonus')
                                : t('paymentTypeAdvance')}
                          </span>
                        </td>
                        <td className={listTableTdClass('type-body-sm font-mono')} dir="ltr">
                          {formatAmount(payment.amount, locale)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <DetailTablePagination
              totalItems={paymentsPagination.totalItems}
              page={paymentsPage}
              totalPages={paymentsPagination.totalPages}
              onPageChange={setPaymentsPage}
            />
          </section>

          <section className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-sm">
            <div className={sectionHeaderClass}>
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hisabi-primary-container/30 text-hisabi-primary shadow-hisabi-1"
                aria-hidden
              >
                <TrendingUp className="size-5" aria-hidden />
              </span>
              <h2 className="type-headline-md font-bold text-hisabi-primary">
                {t('promotionsSection')}
              </h2>
            </div>
            <div className={cn(sectionBodyClass, LIST_TABLE_SCROLL_WRAP, 'pt-0 sm:pt-0')}>
              <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
                <thead>
                  <tr className={LIST_TABLE_HEAD_ROW}>
                    <th scope="col" className={listTableThClass(undefined, true)}>
                      {t('colEffectiveFrom')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colSalary')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colPromotionNotes')}
                    </th>
                  </tr>
                </thead>
                <tbody className={LIST_TABLE_BODY}>
                  {promotions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-8 text-center"
                      >
                        {t('emptyPromotions')}
                      </td>
                    </tr>
                  ) : (
                    promotionsPagination.pageRows.map((promotion) => (
                      <tr key={promotion.id} className={LIST_TABLE_ROW}>
                        <td className={listTableTdClass('type-body-sm', true)}>
                          {formatPayPeriod(promotion.effectiveFrom, locale)}
                        </td>
                        <td className={listTableTdClass('type-body-sm')}>
                          <PromotionChangeCell
                            oldValue={promotion.oldSalary}
                            newValue={promotion.newSalary}
                            locale={locale}
                            amount
                          />
                        </td>
                        <td className={listTableTdClass('type-body-sm text-hisabi-on-surface-variant max-w-[200px]')}>
                          {promotion.notes?.trim() || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <DetailTablePagination
              totalItems={promotionsPagination.totalItems}
              page={promotionsPage}
              totalPages={promotionsPagination.totalPages}
              onPageChange={setPromotionsPage}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
