'use client'

import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  FileBarChart,
  Minus,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import {
  ReportDateRangeFilter,
  ReportStatCard,
  useReportFormatters,
} from '@/components/reports/report-shared'
import {
  ReportEmptyState,
  ReportPageShell,
  ReportTableWrap,
} from '@/components/reports/report-page-shell'
import { OwnerRestaurantScopeSelect } from '@/components/analytics/owner-restaurant-scope-select'
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
import { downloadReportCsv } from '@/lib/reports/export-csv'
import {
  lastYearSameMonthRange,
  thisMonthRange,
  todayIso,
} from '@/lib/reports/parse-report-params'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

function buildRangeParams(fromDate, toDate) {
  const p = new URLSearchParams()
  if (fromDate) p.set('fromDate', String(fromDate))
  if (toDate) p.set('toDate', String(toDate))
  return p
}

/**
 * @param {string} kind
 */
function getApiConfig(kind) {
  /** @type {Record<string, { apiPath: string, queryKey: string, csvFilename: string, titleKey: string, subtitleKey: string }>} */
  const map = {
    sales: {
      apiPath: '/reports/sales',
      queryKey: 'report-sales',
      csvFilename: 'sales',
      titleKey: 'salesTitle',
      subtitleKey: 'salesSubtitle',
    },
    'menu-items': {
      apiPath: '/reports/menu-items',
      queryKey: 'report-menu-items',
      csvFilename: 'menu-items',
      titleKey: 'menuItemsTitle',
      subtitleKey: 'menuItemsSubtitle',
    },
    tax: {
      apiPath: '/reports/tax',
      queryKey: 'report-tax',
      csvFilename: 'tax',
      titleKey: 'taxTitle',
      subtitleKey: 'taxSubtitle',
    },
    daily: {
      apiPath: '/reports/daily',
      queryKey: 'report-daily',
      csvFilename: 'daily',
      titleKey: 'dailyTitle',
      subtitleKey: 'dailySubtitle',
    },
    summary: {
      apiPath: '/reports/date-range-summary',
      queryKey: 'report-summary',
      csvFilename: 'date-range-summary',
      titleKey: 'dateRangeSummaryTitle',
      subtitleKey: 'dateRangeSummarySubtitle',
    },
    comparison: {
      apiPath: '/reports/comparison',
      queryKey: 'report-comparison',
      csvFilename: 'comparison',
      titleKey: 'comparisonTitle',
      subtitleKey: 'comparisonSubtitle',
    },
    cashiers: {
      apiPath: '/reports/cashiers',
      queryKey: 'report-cashiers',
      csvFilename: 'cashiers',
      titleKey: 'cashiersTitle',
      subtitleKey: 'cashiersSubtitle',
    },
    payments: {
      apiPath: '/reports/payments',
      queryKey: 'report-payments',
      csvFilename: 'payments',
      titleKey: 'paymentsTitle',
      subtitleKey: 'paymentsSubtitle',
    },
    'zatca-status': {
      apiPath: '/reports/zatca-status',
      queryKey: 'report-zatca-status',
      csvFilename: 'zatca-status',
      titleKey: 'zatcaStatusTitle',
      subtitleKey: 'zatcaStatusSubtitle',
    },
    'credit-debit-notes': {
      apiPath: '/reports/credit-debit-notes',
      queryKey: 'report-credit-debit-notes',
      csvFilename: 'credit-debit-notes',
      titleKey: 'creditDebitNotesTitle',
      subtitleKey: 'creditDebitNotesSubtitle',
    },
    voids: {
      apiPath: '/reports/voids',
      queryKey: 'report-voids',
      csvFilename: 'voids',
      titleKey: 'voidsTitle',
      subtitleKey: 'voidsSubtitle',
    },
    discounts: {
      apiPath: '/reports/discounts',
      queryKey: 'report-discounts',
      csvFilename: 'discounts',
      titleKey: 'discountsTitle',
      subtitleKey: 'discountsSubtitle',
    },
    categories: {
      apiPath: '/reports/categories',
      queryKey: 'report-categories',
      csvFilename: 'categories',
      titleKey: 'categoriesTitle',
      subtitleKey: 'categoriesSubtitle',
    },
    'salary-slips': {
      apiPath: '/reports/salary-slips',
      queryKey: 'report-salary-slips',
      csvFilename: 'salary-slips',
      titleKey: 'salarySlipsTitle',
      subtitleKey: 'salarySlipsSubtitle',
    },
    'employee-payments': {
      apiPath: '/reports/employee-payments',
      queryKey: 'report-employee-payments',
      csvFilename: 'employee-payments',
      titleKey: 'employeePaymentsTitle',
      subtitleKey: 'employeePaymentsSubtitle',
    },
    advances: {
      apiPath: '/reports/advances',
      queryKey: 'report-advances',
      csvFilename: 'advances',
      titleKey: 'advancesTitle',
      subtitleKey: 'advancesSubtitle',
    },
  }
  return map[kind] ?? map.sales
}

/**
 * @param {{ hasBusinessProfile?: boolean, kind: string }} props
 */
export function ReportsModuleClient({ hasBusinessProfile, kind }) {
  const t = useTranslations('Reports')
  const locale = useLocale()
  const { formatDate, formatAmount } = useReportFormatters()
  const activeBusinessProfileId = useAuthStore((s) => s.user?.activeBusinessProfileId ?? null)
  const analyticsScope = useAnalyticsRestaurantScopeStore((s) => s.scope)
  const defaultRange = thisMonthRange()
  const priorRange = lastYearSameMonthRange()

  const [fromDate, setFromDate] = useState(defaultRange.from)
  const [toDate, setToDate] = useState(defaultRange.to)
  const [singleDate, setSingleDate] = useState(todayIso())
  const [fromDateA, setFromDateA] = useState(defaultRange.from)
  const [toDateA, setToDateA] = useState(defaultRange.to)
  const [fromDateB, setFromDateB] = useState(priorRange.from)
  const [toDateB, setToDateB] = useState(priorRange.to)

  const apiConfig = useMemo(() => getApiConfig(kind), [kind])

  const queryString = useMemo(() => {
    if (kind === 'comparison') {
      const p = new URLSearchParams()
      p.set('fromDateA', fromDateA)
      p.set('toDateA', toDateA)
      p.set('fromDateB', fromDateB)
      p.set('toDateB', toDateB)
      return p.toString()
    }
    if (kind === 'daily') return `date=${singleDate}`
    if (kind === 'advances') return ''
    return buildRangeParams(fromDate, toDate).toString()
  }, [kind, fromDate, toDate, singleDate, fromDateA, toDateA, fromDateB, toDateB])

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: [apiConfig.queryKey, activeBusinessProfileId, analyticsScope, queryString],
    queryFn: async () => {
      const qs = queryString ? `?${queryString}` : ''
      return authGet(
        withAnalyticsScopeQuery(`${apiConfig.apiPath}${qs}`, analyticsScope),
      )
    },
    enabled: Boolean(activeBusinessProfileId),
  })

  const rows = data?.rows ?? []
  const totals = data?.totals ?? {}
  const busy = isPending || isFetching

  const handleExport = useCallback(() => {
    if (kind === 'summary') {
      downloadReportCsv({
        filename: apiConfig.csvFilename,
        columns: [
          { key: 'metric', header: t('metric') },
          { key: 'value', header: t('colValue') },
        ],
        rows: Object.entries(totals).map(([metric, value]) => ({
          metric,
          value: String(value),
        })),
      })
      return
    }
    if (rows.length === 0) return
    const cols = getExportColumns(kind, t)
    downloadReportCsv({
      filename: apiConfig.csvFilename,
      columns: cols,
      rows: rows.map((row) => {
        const out = {}
        for (const c of cols) out[c.key] = String(row[c.key] ?? '')
        return out
      }),
    })
  }, [rows, totals, kind, t, apiConfig.csvFilename])

  const displayName = useCallback(
    (en, ar) => {
      if (locale === 'ar') return ar || en || '—'
      return en || ar || '—'
    },
    [locale],
  )

  return (
    <ReportPageShell
      title={t(apiConfig.titleKey)}
      subtitle={t(apiConfig.subtitleKey)}
      hasBusinessProfile={hasBusinessProfile}
      loading={busy}
      error={isError}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      exportDisabled={kind === 'summary' ? Object.keys(totals).length === 0 : rows.length === 0}
      statCards={renderStatCards(kind, totals, t, formatAmount)}
      filters={renderFilters()}
      headerExtra={<OwnerRestaurantScopeSelect />}
    >
      {renderBody()}
    </ReportPageShell>
  )

  function renderFilters() {
    if (kind === 'comparison') {
      return (
        <div className="grid w-full gap-hisabi-md lg:grid-cols-2">
          <div>
            <p className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-sm font-bold uppercase">
              {t('periodA')}
            </p>
            <ReportDateRangeFilter
              fromDate={fromDateA}
              toDate={toDateA}
              onFromDateChange={setFromDateA}
              onToDateChange={setToDateA}
              showQuickSelect={false}
            />
          </div>
          <div>
            <p className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-sm font-bold uppercase">
              {t('periodB')}
            </p>
            <ReportDateRangeFilter
              fromDate={fromDateB}
              toDate={toDateB}
              onFromDateChange={setFromDateB}
              onToDateChange={setToDateB}
              showQuickSelect={false}
            />
          </div>
        </div>
      )
    }
    if (kind === 'daily') {
      return (
        <div className="space-y-hisabi-xs min-w-[12rem]">
          <label className="type-label-sm text-hisabi-on-surface-variant font-semibold">
            {t('reportDate')}
          </label>
          <input
            type="date"
            value={singleDate}
            onChange={(e) => setSingleDate(e.target.value)}
            className="type-body-md w-full rounded-lg border border-hisabi-outline-variant bg-white px-hisabi-md py-3"
          />
        </div>
      )
    }
    if (kind === 'advances') return null
    return (
      <ReportDateRangeFilter
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
      />
    )
  }

  function renderBody() {
    if (kind === 'summary') {
      const entries = Object.entries(totals)
      if (entries.length === 0) return <ReportEmptyState />
      return (
        <div className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2 xl:grid-cols-3">
          {entries.map(([key, value]) => (
            <ReportStatCard
              key={key}
              label={t(`summary_${key}`)}
              value={
                typeof value === 'number' && !String(key).includes('Count')
                  ? formatAmount(String(value))
                  : String(key).includes('Count')
                    ? String(value)
                    : formatAmount(String(value))
              }
              icon={BarChart3}
            />
          ))}
        </div>
      )
    }

    if (kind === 'comparison') {
      if (rows.length === 0) return <ReportEmptyState />
      return (
        <ReportTableWrap>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th className={listTableThClass(undefined, true)}>{t('metric')}</th>
                <th className={listTableThClass('text-end')}>{t('periodA')}</th>
                <th className={listTableThClass('text-end')}>{t('periodB')}</th>
                <th className={listTableThClass('text-end')}>{t('percentChange')}</th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {rows.map((row) => (
                <tr key={row.metric} className={LIST_TABLE_ROW}>
                  <td className={listTableTdClass(undefined, true)}>
                    {t(`summary_${row.metric}`)}
                  </td>
                  <td className={listTableTdClass('text-end font-mono')} dir="ltr">
                    {String(row.metric).includes('Count')
                      ? String(row.periodA)
                      : formatAmount(row.periodA)}
                  </td>
                  <td className={listTableTdClass('text-end font-mono')} dir="ltr">
                    {String(row.metric).includes('Count')
                      ? String(row.periodB)
                      : formatAmount(row.periodB)}
                  </td>
                  <td className={listTableTdClass('text-end')}>
                    <span className="inline-flex items-center gap-1">
                      {row.direction === 'up' ? (
                        <ArrowUpRight className="size-4 text-emerald-600" />
                      ) : row.direction === 'down' ? (
                        <ArrowDownRight className="size-4 text-red-600" />
                      ) : (
                        <Minus className="size-4 text-hisabi-outline" />
                      )}
                      <span dir="ltr">{row.percentChange}%</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportTableWrap>
      )
    }

    if (rows.length === 0) return <ReportEmptyState />

    return (
      <ReportTableWrap>
        <table className={cn(LIST_TABLE_BASE, 'min-w-[720px]')}>
          <thead>
            <tr className={LIST_TABLE_HEAD_ROW}>
              {getTableColumns(kind, t).map((col) => (
                <th
                  key={col.key}
                  className={listTableThClass(col.align === 'end' ? 'text-end' : undefined, true)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={LIST_TABLE_BODY}>
            {rows.map((row) => (
              <tr key={row.id ?? row.menuItemId ?? row.categoryId ?? row.cashierId ?? row.employeeId ?? `${row.noteType}-${row.noteNumber}`} className={LIST_TABLE_ROW}>
                {getTableColumns(kind, t).map((col) => (
                  <td
                    key={col.key}
                    className={listTableTdClass(
                      col.align === 'end' ? 'text-end font-mono' : undefined,
                    )}
                    dir={col.align === 'end' || col.ltr ? 'ltr' : undefined}
                  >
                    {formatCell(kind, col.key, row, { formatDate, formatAmount, displayName, t })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableWrap>
    )
  }
}

function moneyOrCount(key, value, formatAmount) {
  if (String(key).includes('Count') || String(key).includes('Qty')) return String(value ?? 0)
  return formatAmount(String(value ?? 0))
}

function renderStatCards(kind, totals, t, formatAmount) {
  /** @type {Array<[string, import('react').ComponentType<{ className?: string }>]>} */
  let keys = []
  if (kind === 'sales') {
    keys = [
      ['totalSales', TrendingUp],
      ['totalVat', Receipt],
      ['invoiceCount', FileBarChart],
      ['averageInvoiceValue', BarChart3],
    ]
  } else if (kind === 'menu-items' || kind === 'categories') {
    keys = [
      ['totalRevenue', TrendingUp],
      ['totalQtySold', ShoppingCart],
      [kind === 'categories' ? 'categoryCount' : 'itemCount', FileBarChart],
    ]
  } else if (kind === 'tax') {
    keys = [
      ['outputVat', Receipt],
      ['creditNoteVat', ArrowDownRight],
      ['debitNoteVat', ArrowUpRight],
      ['netOutputVat', Wallet],
    ]
  } else if (kind === 'daily') {
    keys = [
      ['totalSales', TrendingUp],
      ['cashTotal', Wallet],
      ['cardTotal', Receipt],
      ['completedCount', FileBarChart],
    ]
  } else if (kind === 'payments') {
    keys = [
      ['grandTotal', TrendingUp],
      ['cashTotal', Wallet],
      ['cardTotal', Receipt],
      ['paymentCount', FileBarChart],
    ]
  } else if (kind === 'cashiers') {
    keys = [
      ['totalSales', TrendingUp],
      ['invoiceCount', FileBarChart],
      ['cashierCount', ShoppingCart],
    ]
  } else if (kind === 'zatca-status') {
    keys = [
      ['reportedCount', TrendingUp],
      ['failedCount', ArrowDownRight],
      ['pendingCount', FileBarChart],
      ['invoiceCount', Receipt],
    ]
  } else if (kind === 'credit-debit-notes') {
    keys = [
      ['creditTotal', ArrowDownRight],
      ['debitTotal', ArrowUpRight],
      ['creditCount', FileBarChart],
      ['debitCount', Receipt],
    ]
  } else if (kind === 'voids') {
    keys = [
      ['voidedTotal', ArrowDownRight],
      ['voidedCount', FileBarChart],
    ]
  } else if (kind === 'discounts') {
    keys = [
      ['totalDiscount', Wallet],
      ['discountLineCount', FileBarChart],
    ]
  } else if (kind === 'salary-slips') {
    keys = [
      ['totalNet', Wallet],
      ['totalEarnings', TrendingUp],
      ['totalDeductions', ArrowDownRight],
      ['slipCount', FileBarChart],
    ]
  } else if (kind === 'employee-payments') {
    keys = [
      ['totalAmount', Wallet],
      ['salaryTotal', TrendingUp],
      ['advanceTotal', Receipt],
      ['paymentCount', FileBarChart],
    ]
  } else if (kind === 'advances') {
    keys = [
      ['outstandingAdvance', Wallet],
      ['totalAdvanceGiven', TrendingUp],
      ['totalAdvanceDeducted', ArrowDownRight],
      ['employeeCount', FileBarChart],
    ]
  } else {
    return null
  }

  return keys.map(([key, Icon]) => (
    <ReportStatCard
      key={key}
      label={t(`summary_${key}`)}
      value={moneyOrCount(key, totals[key], formatAmount)}
      icon={Icon}
    />
  ))
}

function getTableColumns(kind, t) {
  if (kind === 'sales') {
    return [
      { key: 'invoiceNumber', header: t('colInvoiceNumber') },
      { key: 'invoiceDate', header: t('colDate') },
      { key: 'cashierName', header: t('colCashier') },
      { key: 'paymentMethod', header: t('colMethod') },
      { key: 'subtotal', header: t('colSubtotal'), align: 'end' },
      { key: 'totalVat', header: t('colVat'), align: 'end' },
      { key: 'grandTotal', header: t('colGrandTotal'), align: 'end' },
      { key: 'status', header: t('colStatus') },
      { key: 'zatcaStatus', header: t('colZatcaStatus') },
    ]
  }
  if (kind === 'daily') {
    return [
      { key: 'invoiceNumber', header: t('colInvoiceNumber') },
      { key: 'invoiceDate', header: t('colDate') },
      { key: 'cashierName', header: t('colCashier') },
      { key: 'paymentMethod', header: t('colMethod') },
      { key: 'grandTotal', header: t('colGrandTotal'), align: 'end' },
      { key: 'status', header: t('colStatus') },
      { key: 'zatcaStatus', header: t('colZatcaStatus') },
    ]
  }
  if (kind === 'menu-items') {
    return [
      { key: 'name', header: t('colMenuItem') },
      { key: 'categoryName', header: t('colCategory') },
      { key: 'qtySold', header: t('colQtySold'), align: 'end', ltr: true },
      { key: 'revenue', header: t('colRevenue'), align: 'end' },
    ]
  }
  if (kind === 'categories') {
    return [
      { key: 'name', header: t('colCategory') },
      { key: 'qtySold', header: t('colQtySold'), align: 'end', ltr: true },
      { key: 'revenue', header: t('colRevenue'), align: 'end' },
    ]
  }
  if (kind === 'tax') {
    return [
      { key: 'vatPreset', header: t('colVatPreset') },
      { key: 'outputVat', header: t('colOutputVat'), align: 'end' },
      { key: 'creditNoteVat', header: t('colCreditNoteVat'), align: 'end' },
      { key: 'debitNoteVat', header: t('colDebitNoteVat'), align: 'end' },
      { key: 'netOutputVat', header: t('colNetOutputVat'), align: 'end' },
    ]
  }
  if (kind === 'cashiers') {
    return [
      { key: 'cashierName', header: t('colCashier') },
      { key: 'invoiceCount', header: t('colInvoiceCount'), align: 'end', ltr: true },
      { key: 'totalSales', header: t('colSubtotal'), align: 'end' },
      { key: 'grandTotal', header: t('colGrandTotal'), align: 'end' },
      { key: 'averageInvoiceValue', header: t('colAverage'), align: 'end' },
    ]
  }
  if (kind === 'payments') {
    return [
      { key: 'invoiceNumber', header: t('colInvoiceNumber') },
      { key: 'invoiceDate', header: t('colDate') },
      { key: 'cashierName', header: t('colCashier') },
      { key: 'paymentMethod', header: t('colMethod') },
      { key: 'amount', header: t('colAmount'), align: 'end' },
    ]
  }
  if (kind === 'zatca-status') {
    return [
      { key: 'invoiceNumber', header: t('colInvoiceNumber') },
      { key: 'invoiceDate', header: t('colDate') },
      { key: 'grandTotal', header: t('colGrandTotal'), align: 'end' },
      { key: 'zatcaStatus', header: t('colZatcaStatus') },
      { key: 'zatcaReportAttempts', header: t('colAttempts'), align: 'end', ltr: true },
      { key: 'zatcaLastError', header: t('colLastError') },
    ]
  }
  if (kind === 'credit-debit-notes') {
    return [
      { key: 'noteType', header: t('colType') },
      { key: 'noteNumber', header: t('colNoteNumber') },
      { key: 'noteDate', header: t('colDate') },
      { key: 'invoiceNumber', header: t('colInvoiceNumber') },
      { key: 'cashierName', header: t('colCashier') },
      { key: 'grandTotal', header: t('colGrandTotal'), align: 'end' },
      { key: 'zatcaStatus', header: t('colZatcaStatus') },
    ]
  }
  if (kind === 'voids') {
    return [
      { key: 'invoiceNumber', header: t('colInvoiceNumber') },
      { key: 'invoiceDate', header: t('colDate') },
      { key: 'cashierName', header: t('colCashier') },
      { key: 'grandTotal', header: t('colGrandTotal'), align: 'end' },
    ]
  }
  if (kind === 'discounts') {
    return [
      { key: 'invoiceNumber', header: t('colInvoiceNumber') },
      { key: 'invoiceDate', header: t('colDate') },
      { key: 'itemName', header: t('colMenuItem') },
      { key: 'cashierName', header: t('colCashier') },
      { key: 'discount', header: t('colDiscount'), align: 'end' },
      { key: 'lineTotal', header: t('colLineTotal'), align: 'end' },
    ]
  }
  if (kind === 'salary-slips') {
    return [
      { key: 'voucherNumber', header: t('colVoucher') },
      { key: 'slipDate', header: t('colDate') },
      { key: 'employeeName', header: t('colEmployee') },
      { key: 'totalEarnings', header: t('colEarnings'), align: 'end' },
      { key: 'totalDeductions', header: t('colDeductions'), align: 'end' },
      { key: 'netTotal', header: t('colNetTotal'), align: 'end' },
    ]
  }
  if (kind === 'employee-payments') {
    return [
      { key: 'paymentDate', header: t('colDate') },
      { key: 'employeeName', header: t('colEmployee') },
      { key: 'paymentType', header: t('colType') },
      { key: 'payPeriod', header: t('colPayPeriod') },
      { key: 'paymentMethod', header: t('colMethod') },
      { key: 'amount', header: t('colAmount'), align: 'end' },
    ]
  }
  if (kind === 'advances') {
    return [
      { key: 'employeeName', header: t('colEmployee') },
      { key: 'totalAdvanceGiven', header: t('colAdvanceGiven'), align: 'end' },
      { key: 'totalAdvanceDeducted', header: t('colAdvanceDeducted'), align: 'end' },
      { key: 'outstandingAdvance', header: t('colOutstandingAdvance'), align: 'end' },
    ]
  }
  return []
}

function getExportColumns(kind, t) {
  return getTableColumns(kind, t).map((c) => {
    if (c.key === 'name') {
      return { key: 'nameAr', header: c.header }
    }
    return { key: c.key, header: c.header }
  })
}

function formatCell(kind, key, row, { formatDate, formatAmount, displayName, t }) {
  if (key === 'name') {
    return displayName(row.nameEn, row.nameAr)
  }
  if (key === 'invoiceDate' || key === 'noteDate' || key === 'slipDate' || key === 'paymentDate') {
    return formatDate(row[key])
  }
  if (
    [
      'subtotal',
      'totalVat',
      'grandTotal',
      'revenue',
      'outputVat',
      'creditNoteVat',
      'debitNoteVat',
      'netOutputVat',
      'totalSales',
      'averageInvoiceValue',
      'amount',
      'discount',
      'lineTotal',
      'totalEarnings',
      'totalDeductions',
      'netTotal',
      'totalAdvanceGiven',
      'totalAdvanceDeducted',
      'outstandingAdvance',
    ].includes(key)
  ) {
    return formatAmount(row[key])
  }
  if (key === 'paymentMethod' || key === 'noteType' || key === 'paymentType' || key === 'status' || key === 'zatcaStatus' || key === 'vatPreset') {
    const val = row[key]
    if (!val) return '—'
    const valueKey = `value_${val}`
    try {
      return t(valueKey)
    } catch {
      return String(val)
    }
  }
  if (key === 'nameEn' || key === 'nameAr') return displayName(row.nameEn, row.nameAr)
  const v = row[key]
  return v === '' || v == null ? '—' : String(v)
}
