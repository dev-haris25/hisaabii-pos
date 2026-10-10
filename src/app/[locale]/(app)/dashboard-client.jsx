'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  Clock,
  CreditCard,
  FileMinus2,
  FilePlus2,
  FileWarning,
  FileText,
  Monitor,
  Percent,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { OwnerRestaurantScopeSelect } from '@/components/analytics/owner-restaurant-scope-select'
import { AppLoader } from '@/components/app-loader'
import { Link } from '@/i18n/navigation'
import { authGet } from '@/lib/api/auth-client'
import { withAnalyticsScopeQuery } from '@/lib/auth/analytics-scope-query'
import { useAnalyticsRestaurantScopeStore } from '@/stores/analytics-restaurant-scope-store'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { formatLocalizedNumber, formatSarAmount } from '@/lib/settings/format-helpers'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

/** Chart palette aligned to Hisabi design tokens (fill/stroke props, not inline CSS). */
const CHART = {
  primary: '#00342b',
  teal: '#94d3c1',
  gold: '#d4af37',
  amber: '#92400e',
  outline: '#bfc9c4',
  mix: ['#00342b', '#94d3c1', '#d4af37', '#004d40', '#735c00', '#afefdd', '#e9c349'],
}

/**
 * @param {{
 *   label: string
 *   value: string
 *   hint?: string | null
 *   hintPositive?: boolean | null
 *   icon: import('react').ComponentType<{ className?: string }>
 *   iconClassName?: string
 * }} props
 */
function StatCard({ label, value, hint, hintPositive, icon: Icon, iconClassName }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-hisabi-outline-variant/30 bg-white p-hisabi-lg shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-hisabi-md flex items-start justify-between gap-hisabi-sm">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-xl',
            iconClassName ?? 'bg-hisabi-primary-container/15 text-hisabi-primary',
          )}
          aria-hidden
        >
          <Icon className="size-6" />
        </span>
        {hint ? (
          <span
            className={cn(
              'type-label-sm inline-flex items-center gap-0.5 rounded-full px-2 py-1 font-semibold',
              hintPositive === true && 'bg-green-50 text-green-700',
              hintPositive === false && 'bg-red-50 text-red-700',
              hintPositive == null && 'bg-hisabi-surface-container text-hisabi-on-surface-variant',
            )}
          >
            {hintPositive === true ? <ArrowUpRight className="size-3" /> : null}
            {hintPositive === false ? <ArrowDownRight className="size-3" /> : null}
            {hint}
          </span>
        ) : null}
      </div>
      <p className="type-headline-md text-hisabi-on-surface mb-1 font-bold" dir="ltr">
        {value}
      </p>
      <p className="type-body-sm text-hisabi-on-surface-variant font-medium">{label}</p>
    </div>
  )
}

/**
 * @param {{ title: string, subtitle?: string, children: import('react').ReactNode, className?: string, action?: import('react').ReactNode }} props
 */
function Panel({ title, subtitle, children, className, action }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-hisabi-outline-variant/30 bg-white shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-hisabi-md border-b border-hisabi-outline-variant/15 px-hisabi-lg py-hisabi-md">
        <div>
          <h2 className="type-label-md text-hisabi-on-surface font-bold uppercase tracking-wider">
            {title}
          </h2>
          {subtitle ? (
            <p className="type-body-sm text-hisabi-on-surface-variant mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-hisabi-lg">{children}</div>
    </section>
  )
}

/**
 * @param {{ hasBusinessProfile?: boolean }} props
 */
export function DashboardClient({ hasBusinessProfile = true }) {
  const t = useTranslations('Dashboard')
  const locale = useLocale()
  const userName = useAuthStore((s) => s.user?.name ?? '')
  const activeBusinessProfileId = useAuthStore((s) => s.user?.activeBusinessProfileId ?? null)
  const analyticsScope = useAnalyticsRestaurantScopeStore((s) => s.scope)

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['pos-dashboard', activeBusinessProfileId, analyticsScope, locale],
    queryFn: () =>
      authGet(withAnalyticsScopeQuery('/dashboard', analyticsScope)),
    enabled: Boolean(activeBusinessProfileId) && hasBusinessProfile,
  })

  const variant = data?.variant ?? 'full'
  const stats = data?.stats
  const hrStats = data?.hrStats
  const alerts = data?.alerts ?? {}
  const salesTrend = data?.salesTrend ?? []
  const topSellers = data?.topSellers ?? []
  const categoryMix = data?.categoryMix ?? []
  const cashierRanking = data?.cashierRanking ?? []
  const recentSales = data?.recentSales ?? []
  const peakHours = data?.peakHours

  function money(v) {
    return formatSarAmount(v, locale)
  }

  function displayName(en, ar) {
    if (locale === 'ar') return ar || en || '—'
    return en || ar || '—'
  }

  function formatDayLabel(iso) {
    const d = new Date(`${iso}T12:00:00`)
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
    }).format(d)
  }

  function formatTime(iso) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  }

  const trendChartData = salesTrend.map((row) => ({
    label: formatDayLabel(row.date),
    total: Number.parseFloat(String(row.total)) || 0,
  }))

  const categoryChartData = categoryMix.map((row) => ({
    name: displayName(row.nameEn, row.nameAr),
    value: Number.parseFloat(String(row.revenue)) || 0,
  }))
  const categoryMixTotal = categoryChartData.reduce((sum, row) => sum + row.value, 0)

  const showSales = variant === 'full' || variant === 'accountant'
  const showCashiers = variant === 'full'
  const showHr = variant === 'full' || variant === 'hr' || variant === 'accountant'
  const showHrLean = variant === 'hr'
  const showHrAttention = variant === 'full' || variant === 'hr'

  if (!hasBusinessProfile) {
    return (
      <div className="mx-auto w-full max-w-hisabi-container space-y-hisabi-xl">
        <header className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('title')}</h1>
        </header>
        <p className="type-body-md text-hisabi-on-surface-variant">{t('needRestaurant')}</p>
        <Link
          href="/business-profile"
          className="type-label-md bg-hisabi-primary text-hisabi-on-primary inline-flex rounded-xl px-hisabi-lg py-hisabi-sm font-semibold"
        >
          {t('ctaCreateRestaurant')}
        </Link>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <AppLoader />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-hisabi-container py-hisabi-xxl text-center">
        <p className="type-body-md text-hisabi-error">{t('loadError')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="type-label-md text-hisabi-primary mt-hisabi-md underline"
        >
          {t('retryLoad')}
        </button>
      </div>
    )
  }

  const salesChange = stats?.sameWeekdayChangePct
  const salesHint =
    salesChange == null
      ? null
      : `${salesChange > 0 ? '+' : ''}${formatLocalizedNumber(salesChange, locale, {
          maximumFractionDigits: 1,
        })}% ${t('hintVsLastWeekday')}`
  const salesHintPositive = salesChange == null ? null : salesChange >= 0

  return (
    <div className="mx-auto w-full max-w-hisabi-container space-y-hisabi-xl">
      <header className="flex flex-col gap-hisabi-md sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('title')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-xl">
            {t('welcome', { name: userName || t('guestName') })}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-hisabi-md sm:flex-row sm:items-end">
          <OwnerRestaurantScopeSelect />
          {showSales ? (
            <Link
              href="/pos"
              className="type-label-md bg-hisabi-gold-muted text-hisabi-on-secondary-container hover:bg-hisabi-gold-muted-hover inline-flex min-h-hisabi-btn items-center justify-center gap-2 rounded-xl px-hisabi-lg font-bold shadow-sm transition-colors"
            >
              <Monitor className="size-4" aria-hidden />
              {t('ctaOpenPos')}
            </Link>
          ) : null}
        </div>
      </header>

      {/* Sales KPIs */}
      {showSales && stats ? (
        <div className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label={t('kpiSalesToday')}
            value={money(stats.salesToday)}
            hint={salesHint}
            hintPositive={salesHintPositive}
            icon={TrendingUp}
            iconClassName="bg-hisabi-primary-container/15 text-hisabi-primary"
          />
          <StatCard
            label={t('kpiOrdersToday')}
            value={formatLocalizedNumber(stats.ordersToday, locale)}
            icon={ShoppingBag}
            iconClassName="bg-hisabi-teal/20 text-hisabi-primary"
          />
          <StatCard
            label={t('kpiAverageTicket')}
            value={money(stats.averageTicket)}
            icon={Receipt}
            iconClassName="bg-hisabi-secondary-container/40 text-hisabi-secondary"
          />
          <StatCard
            label={t('kpiCashToday')}
            value={money(stats.cashToday)}
            icon={Banknote}
            iconClassName="bg-green-50 text-green-700"
          />
          <StatCard
            label={t('kpiCardToday')}
            value={money(stats.cardToday)}
            icon={CreditCard}
            iconClassName="bg-blue-50 text-blue-700"
          />
        </div>
      ) : null}

      {/* HR lean KPIs */}
      {showHrLean && hrStats ? (
        <div className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t('kpiVisaExpiring')}
            value={formatLocalizedNumber(hrStats.visaExpiring, locale)}
            icon={AlertTriangle}
            iconClassName="bg-amber-50 text-amber-800"
          />
          <StatCard
            label={t('kpiOutstandingAdvance')}
            value={money(hrStats.outstandingAdvance)}
            icon={Wallet}
            iconClassName="bg-hisabi-primary-container/15 text-hisabi-primary"
          />
          <StatCard
            label={t('kpiSalarySlipsToday')}
            value={formatLocalizedNumber(hrStats.salarySlipsToday, locale)}
            icon={FileText}
            iconClassName="bg-hisabi-teal/20 text-hisabi-primary"
          />
          <StatCard
            label={t('kpiPaymentsToday')}
            value={money(hrStats.employeePaymentsToday)}
            icon={Users}
            iconClassName="bg-hisabi-secondary-container/40 text-hisabi-secondary"
          />
        </div>
      ) : null}

      {/* Attention + ops as list panels (less card clutter) */}
      {showSales || showHrAttention ? (
        <div className="grid grid-cols-1 gap-hisabi-lg lg:grid-cols-2">
          <Panel title={t('attentionTitle')} subtitle={t('attentionListSubtitle')}>
            <ul className="divide-y divide-hisabi-outline-variant/20">
              {showSales ? (
                <MetricListRow
                  href="/reports/zatca-status"
                  icon={FileWarning}
                  iconClassName={
                    Number(alerts.zatcaFailed) > 0
                      ? 'bg-red-50 text-red-700'
                      : 'bg-hisabi-surface-container text-hisabi-on-surface-variant'
                  }
                  label={t('attentionZatcaFailed')}
                  value={formatLocalizedNumber(alerts.zatcaFailed ?? 0, locale)}
                  meta={
                    Number(alerts.zatcaFailed) > 0
                      ? t('attentionActionReview')
                      : t('attentionAllClear')
                  }
                  tone={Number(alerts.zatcaFailed) > 0 ? 'danger' : 'ok'}
                />
              ) : null}
              {showSales ? (
                <MetricListRow
                  href="/reports/zatca-status"
                  icon={Clock}
                  iconClassName={
                    Number(alerts.zatcaPending) > 0
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-hisabi-surface-container text-hisabi-on-surface-variant'
                  }
                  label={t('attentionZatcaPending')}
                  value={formatLocalizedNumber(alerts.zatcaPending ?? 0, locale)}
                  meta={
                    Number(alerts.zatcaPending) > 0
                      ? t('attentionActionReview')
                      : t('attentionAllClear')
                  }
                  tone={Number(alerts.zatcaPending) > 0 ? 'warn' : 'ok'}
                />
              ) : null}
              {showHrAttention ? (
                <MetricListRow
                  href="/hr/visa-status"
                  icon={CalendarClock}
                  iconClassName={
                    Number(alerts.visaExpiring) > 0
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-hisabi-surface-container text-hisabi-on-surface-variant'
                  }
                  label={t('attentionVisaExpiring')}
                  value={formatLocalizedNumber(alerts.visaExpiring ?? 0, locale)}
                  meta={
                    Number(alerts.visaExpiring) > 0
                      ? t('attentionActionReview')
                      : t('attentionAllClear')
                  }
                  tone={Number(alerts.visaExpiring) > 0 ? 'warn' : 'ok'}
                />
              ) : null}
              {showHrAttention ? (
                <MetricListRow
                  href="/reports/advances"
                  icon={Wallet}
                  iconClassName={
                    Number.parseFloat(String(alerts.outstandingAdvance ?? 0)) > 0
                      ? 'bg-hisabi-primary-container/15 text-hisabi-primary'
                      : 'bg-hisabi-surface-container text-hisabi-on-surface-variant'
                  }
                  label={t('attentionAdvances')}
                  value={money(alerts.outstandingAdvance ?? '0.00')}
                  meta={
                    Number.parseFloat(String(alerts.outstandingAdvance ?? 0)) > 0
                      ? t('attentionAdvancesHint', {
                          count: alerts.employeesWithAdvance ?? 0,
                        })
                      : t('attentionAllClear')
                  }
                  tone={
                    Number.parseFloat(String(alerts.outstandingAdvance ?? 0)) > 0
                      ? 'info'
                      : 'ok'
                  }
                />
              ) : null}
            </ul>
          </Panel>

          {showSales && stats ? (
            <Panel title={t('opsSnapshotTitle')} subtitle={t('opsSnapshotSubtitle')}>
              <ul className="divide-y divide-hisabi-outline-variant/20">
                <MetricListRow
                  href="/reports/voids"
                  icon={AlertTriangle}
                  iconClassName="bg-red-50 text-red-700"
                  label={t('kpiVoidRateToday')}
                  value={`${formatLocalizedNumber(stats.voidRateToday ?? 0, locale, {
                    maximumFractionDigits: 1,
                  })}%`}
                  meta={t('kpiVoidRateHint', { count: stats.voidedToday ?? 0 })}
                />
                <MetricListRow
                  href="/reports/discounts"
                  icon={Percent}
                  iconClassName="bg-amber-50 text-amber-800"
                  label={t('kpiDiscountToday')}
                  value={money(stats.discountToday ?? 0)}
                />
                <MetricListRow
                  href="/reports/credit-debit-notes"
                  icon={FileMinus2}
                  iconClassName="bg-hisabi-primary-container/15 text-hisabi-primary"
                  label={t('kpiCreditNotesWeek')}
                  value={formatLocalizedNumber(stats.creditNotesWeekCount ?? 0, locale)}
                  meta={money(stats.creditNotesWeekTotal ?? 0)}
                />
                <MetricListRow
                  href="/reports/credit-debit-notes"
                  icon={FilePlus2}
                  iconClassName="bg-hisabi-teal/20 text-hisabi-primary"
                  label={t('kpiDebitNotesWeek')}
                  value={formatLocalizedNumber(stats.debitNotesWeekCount ?? 0, locale)}
                  meta={money(stats.debitNotesWeekTotal ?? 0)}
                />
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {/* Charts row */}
      {showSales ? (
        <div className="grid grid-cols-1 gap-hisabi-lg xl:grid-cols-3">
          <Panel
            title={t('chartSalesTrend')}
            subtitle={t('chartSalesTrendSubtitle')}
            className="xl:col-span-2"
          >
            {trendChartData.every((d) => d.total === 0) ? (
              <EmptyBlock text={t('emptyChart')} />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendChartData}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART.teal} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={CHART.teal} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.outline} opacity={0.5} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke={CHART.outline} />
                    <YAxis tick={{ fontSize: 12 }} stroke={CHART.outline} width={48} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div className="rounded-lg border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest px-hisabi-sm py-hisabi-xs shadow-sm">
                            <p className="type-label-sm text-hisabi-on-surface-variant">
                              {label}
                            </p>
                            <p className="type-label-md text-hisabi-on-surface font-semibold">
                              {t('chartSalesSeries')}:{' '}
                              <span dir="ltr">{money(payload[0]?.value)}</span>
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name={t('chartSalesSeries')}
                      stroke={CHART.primary}
                      fill="url(#salesFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title={t('chartCategoryMix')} subtitle={t('chartCategoryMixSubtitle')}>
            {categoryChartData.length === 0 ? (
              <EmptyBlock text={t('emptyChart')} />
            ) : (
              <div className="flex flex-col items-stretch gap-hisabi-md sm:flex-row sm:items-center">
                <div className="mx-auto h-52 w-full max-w-[220px] shrink-0 sm:mx-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {categoryChartData.map((entry, i) => (
                          <Cell key={entry.name} fill={CHART.mix[i % CHART.mix.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="min-w-0 flex-1 space-y-2">
                  {categoryChartData.map((entry, i) => {
                    const pct =
                      categoryMixTotal > 0
                        ? (entry.value / categoryMixTotal) * 100
                        : 0
                    const pctLabel = formatLocalizedNumber(pct, locale, {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: 0,
                    })
                    return (
                      <li
                        key={entry.name}
                        className="flex items-center gap-hisabi-sm"
                      >
                        <span
                          className="hisabi-chart-swatch size-2.5 shrink-0 rounded-full"
                          data-mix={i % CHART.mix.length}
                          aria-hidden
                        />
                        <span className="type-body-sm text-hisabi-on-surface min-w-0 flex-1 truncate font-medium">
                          {entry.name}
                        </span>
                        <span
                          className="type-label-sm text-hisabi-on-surface-variant shrink-0 font-semibold tabular-nums"
                          dir="ltr"
                        >
                          {pctLabel}%
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {/* Peak hours heatmap */}
      {showSales ? (
        <Panel title={t('peakHoursTitle')} subtitle={t('peakHoursSubtitle')}>
          {peakHours?.insufficientVolume || !peakHours?.cells?.length ? (
            <EmptyBlock
              text={t('peakHoursNeedVolume', {
                count: peakHours?.minOrders ?? 15,
              })}
            />
          ) : (
            <PeakHoursHeatmap
              cells={peakHours.cells}
              bucketHours={peakHours.bucketHours ?? 2}
              locale={locale}
              t={t}
            />
          )}
        </Panel>
      ) : null}

      {/* Bestsellers + cashiers */}
      {showSales ? (
        <div className="grid grid-cols-1 gap-hisabi-lg lg:grid-cols-2">
          <Panel title={t('topSellersTitle')} subtitle={t('topSellersSubtitle')}>
            {topSellers.length === 0 ? (
              <EmptyBlock text={t('emptyTopSellers')} />
            ) : (
              <ul className="space-y-hisabi-sm">
                {topSellers.map((item, idx) => (
                  <li
                    key={`${item.nameAr}-${idx}`}
                    className="flex items-center gap-hisabi-md rounded-xl border border-hisabi-outline-variant/20 px-hisabi-md py-hisabi-sm"
                  >
                    <span className="type-label-md text-hisabi-outline w-6 font-bold">
                      {idx + 1}
                    </span>
                    <span className="bg-hisabi-surface-container flex size-10 items-center justify-center overflow-hidden rounded-lg">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <UtensilsCrossed className="text-hisabi-outline size-4" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="type-body-md text-hisabi-on-surface truncate font-semibold">
                        {displayName(item.nameEn, item.nameAr)}
                      </p>
                      <p className="type-body-sm text-hisabi-on-surface-variant">
                        {t('soldQty', { count: item.qtySold })}
                      </p>
                    </div>
                    <p className="type-label-md text-hisabi-primary font-bold" dir="ltr">
                      {money(item.revenue)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {showCashiers ? (
            <Panel title={t('cashiersTitle')} subtitle={t('cashiersSubtitle')}>
              {cashierRanking.length === 0 ? (
                <EmptyBlock text={t('emptyCashiers')} />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={cashierRanking.map((r) => ({
                        name: r.cashierName || t('unknownCashier'),
                        sales: Number.parseFloat(String(r.sales)) || 0,
                      }))}
                      layout="vertical"
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART.outline} opacity={0.4} />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke={CHART.outline} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={88}
                        tick={{ fontSize: 11 }}
                        stroke={CHART.outline}
                      />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="sales" fill={CHART.gold} radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          ) : (
            <Panel title={t('vatTodayTitle')} subtitle={t('vatTodaySubtitle')}>
              <p className="type-headline-lg text-hisabi-primary font-bold" dir="ltr">
                {money(stats?.vatToday ?? 0)}
              </p>
              <p className="type-body-sm text-hisabi-on-surface-variant mt-hisabi-sm">
                {t('vatTodayHint')}
              </p>
              <Link
                href="/reports/tax"
                className="type-label-md text-hisabi-primary mt-hisabi-lg inline-flex font-semibold underline"
              >
                {t('ctaTaxReport')}
              </Link>
            </Panel>
          )}
        </div>
      ) : null}

      {/* Recent sales */}
      {showSales ? (
        <Panel
          title={t('recentSalesTitle')}
          subtitle={t('recentSalesSubtitle')}
          action={
            <Link
              href="/invoices"
              className="type-label-sm text-hisabi-primary font-semibold underline"
            >
              {t('ctaViewAll')}
            </Link>
          }
        >
          {recentSales.length === 0 ? (
            <EmptyBlock text={t('emptyRecentSales')} />
          ) : (
            <div className="overflow-x-auto">
              <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
                <thead>
                  <tr className={LIST_TABLE_HEAD_ROW}>
                    <th className={listTableThClass(undefined, true)}>{t('colInvoice')}</th>
                    <th className={listTableThClass()}>{t('colTime')}</th>
                    <th className={listTableThClass()}>{t('colCashier')}</th>
                    <th className={listTableThClass()}>{t('colMethod')}</th>
                    <th className={listTableThClass()}>{t('colZatca')}</th>
                    <th className={listTableThClass('text-end')}>{t('colTotal')}</th>
                  </tr>
                </thead>
                <tbody className={LIST_TABLE_BODY}>
                  {recentSales.map((row) => (
                    <tr key={row.id} className={LIST_TABLE_ROW}>
                      <td className={listTableTdClass(undefined, true)}>
                        <Link
                          href={`/invoices/${row.id}`}
                          className="text-hisabi-primary font-semibold hover:underline"
                        >
                          {row.invoiceNumber}
                        </Link>
                      </td>
                      <td className={listTableTdClass()} dir="ltr">
                        {formatTime(row.invoiceDate)}
                      </td>
                      <td className={listTableTdClass()}>{row.cashierName || '—'}</td>
                      <td className={listTableTdClass()}>
                        {t(`method_${row.paymentMethod}`)}
                      </td>
                      <td className={listTableTdClass()}>
                        <ZatcaBadge status={row.zatcaStatus} t={t} />
                      </td>
                      <td className={listTableTdClass('text-end font-mono')} dir="ltr">
                        {money(row.grandTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {/* Quick actions */}
      <Panel title={t('quickActionsTitle')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(showSales
            ? [
                {
                  href: '/pos',
                  label: t('ctaOpenPos'),
                  icon: Monitor,
                  iconClassName: 'bg-hisabi-primary-fixed text-hisabi-primary',
                },
                {
                  href: '/menu/items/new',
                  label: t('ctaAddMenuItem'),
                  icon: UtensilsCrossed,
                  iconClassName: 'bg-amber-50 text-amber-800',
                },
                {
                  href: '/invoices',
                  label: t('ctaInvoices'),
                  icon: FileText,
                  iconClassName: 'bg-hisabi-teal/20 text-hisabi-primary',
                },
                {
                  href: '/reports/sales',
                  label: t('ctaSalesReport'),
                  icon: TrendingUp,
                  iconClassName: 'bg-green-50 text-green-700',
                },
                {
                  href: '/reports/daily',
                  label: t('ctaDailyReport'),
                  icon: Receipt,
                  iconClassName: 'bg-blue-50 text-blue-700',
                },
              ]
            : []
          )
            .concat(
              showHr
                ? [
                    {
                      href: '/hr/employees',
                      label: t('ctaEmployees'),
                      icon: Users,
                      iconClassName: 'bg-hisabi-secondary-fixed text-hisabi-primary',
                    },
                    {
                      href: '/hr/visa-status',
                      label: t('ctaVisaStatus'),
                      icon: AlertTriangle,
                      iconClassName: 'bg-amber-50 text-amber-800',
                    },
                    {
                      href: '/reports/advances',
                      label: t('ctaAdvances'),
                      icon: Wallet,
                      iconClassName: 'bg-red-50 text-red-700',
                    },
                    {
                      href: '/hr/salary-slips',
                      label: t('ctaSalarySlips'),
                      icon: FileText,
                      iconClassName: 'bg-hisabi-primary-container/15 text-hisabi-primary',
                    },
                  ]
                : [],
            )
            .map((action) => (
              <QuickLink
                key={action.href + action.label}
                href={action.href}
                label={action.label}
                icon={action.icon}
                iconClassName={action.iconClassName}
              />
            ))}
        </div>
      </Panel>
    </div>
  )
}

function EmptyBlock({ text }) {
  return (
    <p className="type-body-md text-hisabi-on-surface-variant py-hisabi-xl text-center">{text}</p>
  )
}

/**
 * @param {number} hour
 * @param {string} locale
 */
function formatHeatmapHour(hour, locale) {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return new Intl.DateTimeFormat(locale === 'ar' ? 'en-US' : locale, {
    hour: 'numeric',
    hour12: true,
  }).format(d)
}

/**
 * Monday-first short weekday labels.
 * @param {string} locale
 */
function heatmapWeekdayLabels(locale) {
  const intl = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    weekday: 'short',
  })
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 1 + i))
    return intl.format(d)
  })
}

/**
 * Day × hour busy-times grid (reference: posting-times heatmap).
 *
 * @param {{
 *   cells: number[][]
 *   bucketHours: number
 *   locale: string
 *   t: (key: string, values?: Record<string, unknown>) => string
 * }} props
 */
function PeakHoursHeatmap({ cells, bucketHours, locale, t }) {
  const dayLabels = heatmapWeekdayLabels(locale)
  const rowCount = cells[0]?.length ?? 0
  const maxOrders = Math.max(0, ...cells.flat())

  return (
    <div className="space-y-hisabi-md">
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="min-w-[32rem]">
          <div className="mb-hisabi-sm grid grid-cols-[3.75rem_repeat(7,minmax(0,1fr))] items-center gap-1.5">
            <span aria-hidden />
            {dayLabels.map((label) => (
              <span
                key={label}
                className="type-label-sm text-hisabi-on-surface-variant text-center font-medium"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            {Array.from({ length: rowCount }, (_, row) => {
              const hour = row * bucketHours
              const hourLabel = formatHeatmapHour(hour, locale)
              return (
                <div
                  key={hour}
                  className="grid grid-cols-[3.75rem_repeat(7,minmax(0,1fr))] items-center gap-1.5"
                >
                  <span
                    className="type-label-sm text-hisabi-on-surface-variant text-end font-medium tabular-nums"
                    dir="ltr"
                  >
                    {hourLabel}
                  </span>
                  {cells.map((dayCells, weekday) => {
                    const orders = dayCells[row] ?? 0
                    const intensity =
                      maxOrders === 0 || orders === 0
                        ? 0
                        : Math.ceil((orders / maxOrders) * 4)
                    return (
                      <div
                        key={`${weekday}-${hour}`}
                        title={t('peakHoursCellTitle', {
                          day: dayLabels[weekday],
                          hour: hourLabel,
                          count: formatLocalizedNumber(orders, locale),
                        })}
                        className={cn(
                          'mx-auto aspect-square w-full max-w-9 rounded-md',
                          intensity === 0 && 'bg-hisabi-surface-container',
                          intensity === 1 && 'bg-hisabi-gold/25',
                          intensity === 2 && 'bg-hisabi-gold/45',
                          intensity === 3 && 'bg-hisabi-gold/70',
                          intensity === 4 && 'bg-hisabi-gold',
                        )}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="type-body-sm text-hisabi-on-surface-variant">{t('peakHoursLegend')}</p>
    </div>
  )
}

/**
 * @param {{
 *   href: string
 *   icon: import('react').ComponentType<{ className?: string }>
 *   iconClassName?: string
 *   label: string
 *   value: string
 *   meta?: string
 *   tone?: 'danger' | 'warn' | 'info' | 'ok'
 * }} props
 */
function MetricListRow({ href, icon: Icon, iconClassName, label, value, meta, tone = 'ok' }) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          'flex items-center gap-hisabi-md px-1 py-hisabi-md transition-colors hover:bg-hisabi-surface-container/60',
          tone === 'danger' && 'bg-red-50/40',
          tone === 'warn' && 'bg-amber-50/40',
          tone === 'info' && 'bg-hisabi-primary-container/5',
        )}
      >
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            iconClassName ?? 'bg-hisabi-surface-container text-hisabi-on-surface-variant',
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-body-md text-hisabi-on-surface truncate font-semibold">{label}</p>
          {meta ? (
            <p className="type-body-sm text-hisabi-on-surface-variant truncate">{meta}</p>
          ) : null}
        </div>
        <p className="type-label-md text-hisabi-on-surface shrink-0 font-bold" dir="ltr">
          {value}
        </p>
      </Link>
    </li>
  )
}

/**
 * @param {{
 *   href: string
 *   label: string
 *   icon: import('react').ComponentType<{ className?: string }>
 *   iconClassName?: string
 * }} props
 */
function QuickLink({ href, label, icon: Icon, iconClassName }) {
  return (
    <Link
      href={href}
      className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-hisabi-outline-variant/30 p-4 transition-all hover:border-hisabi-outline-variant hover:shadow-sm active:scale-[0.97]"
    >
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-xl',
          iconClassName ?? 'bg-hisabi-primary-container/15 text-hisabi-primary',
        )}
        aria-hidden
      >
        <Icon className="size-6" />
      </span>
      <span className="type-label-sm text-hisabi-on-surface text-center font-bold">{label}</span>
    </Link>
  )
}

function ZatcaBadge({ status, t }) {
  if (!status) return <span className="text-hisabi-outline">—</span>
  return (
    <span
      className={cn(
        'type-label-sm inline-flex rounded-full px-2 py-0.5 font-semibold',
        status === 'failed' && 'bg-red-50 text-red-700',
        status === 'pending' && 'bg-amber-50 text-amber-800',
        (status === 'reported' || status === 'cleared') && 'bg-green-50 text-green-700',
      )}
    >
      {t(`zatca_${status}`)}
    </span>
  )
}
