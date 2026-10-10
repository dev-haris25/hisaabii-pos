'use client'

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Gift,
  History,
  Pencil,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import { EditLoyaltyCustomerSheet } from './edit-loyalty-customer-sheet'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { PageBackButton } from '@/components/shared/page-back-button'
import { SettingsSection } from '@/components/settings/settings-page-shell'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { parseMoney } from '@/lib/invoices/invoice-compute-totals'
import { buildPaginationItems } from '@/lib/list-views/build-pagination-items'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

/**
 * Stacked label-above-value tile. Keep the pair as one start-aligned unit
 * (right in RTL / left in LTR). Put `dir="ltr"` on an inner span for numbers,
 * never on the value container — same pattern as the tables in this file.
 *
 * @param {{ label: string, children: import('react').ReactNode, className?: string }} props
 */
function DetailField({ label, children, className }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col items-start gap-1 text-start',
        className,
      )}
    >
      <dt className="type-label-md text-hisabi-on-surface-variant">{label}</dt>
      <dd className="type-body-md font-semibold text-hisabi-on-surface">
        {children}
      </dd>
    </div>
  )
}

/**
 * @param {string | null | undefined} iso
 * @param {string} locale
 */
function formatDate(iso, locale) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/**
 * @param {string | null | undefined} iso
 * @param {string} locale
 */
function formatDateTime(iso, locale) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/**
 * @param {string} type
 * @param {string} pointsRaw
 */
function formatSignedPoints(type, pointsRaw) {
  const n = parseMoney(pointsRaw)
  if (type === 'REDEEM') {
    const abs = Math.abs(n)
    return `−${abs}`
  }
  if (type === 'EARN') {
    return n >= 0 ? `+${pointsRaw}` : String(pointsRaw)
  }
  // ADJUSTMENT — show stored sign
  if (n > 0) return `+${pointsRaw}`
  return String(pointsRaw ?? '0')
}

/**
 * @param {string} type
 * @param {(key: string) => string} t
 */
function transactionTypeBadge(type, t) {
  if (type === 'EARN') {
    return {
      label: t('txTypeEarn'),
      className: 'bg-green-100 text-green-700',
    }
  }
  if (type === 'REDEEM') {
    return {
      label: t('txTypeRedeem'),
      className: 'bg-amber-100 text-amber-800',
    }
  }
  return {
    label: t('txTypeAdjustment'),
    className: 'bg-slate-100 text-slate-700',
  }
}

/**
 * @param {{
 *   customer: Record<string, unknown>
 *   stats: {
 *     totalSpend: string
 *     totalPointsEarned: string
 *     totalPointsRedeemed: string
 *     visitCount: number
 *   }
 *   invoices: Array<Record<string, unknown>>
 *   invoicesPagination: { page: number, limit: number, total: number, totalPages: number }
 *   invoicesFilters: { invoicesPage: number, invoicesLimit: number }
 *   transactions: Array<Record<string, unknown>>
 *   transactionsPagination: { page: number, limit: number, total: number, totalPages: number }
 *   transactionsFilters: { transactionsPage: number, transactionsLimit: number }
 * }} props
 */
export function CustomerDetailView({
  customer,
  stats,
  invoices,
  invoicesPagination,
  invoicesFilters,
  transactions,
  transactionsPagination,
  transactionsFilters,
}) {
  const t = useTranslations('Loyalty')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const ability = useAppAbility()
  const canUpdate =
    hasFullAccess(ability) || ability.can('update', 'Loyalty')
  const [isPending, startTransition] = useTransition()
  const listBusy = isPending

  const [editOpen, setEditOpen] = useState(false)

  function pushDetailFilters(next) {
    const params = new URLSearchParams()
    params.set(
      'invoicesPage',
      String(next.invoicesPage ?? invoicesFilters.invoicesPage ?? 1),
    )
    params.set(
      'invoicesLimit',
      String(
        next.invoicesLimit ??
          invoicesPagination.limit ??
          invoicesFilters.invoicesLimit ??
          10,
      ),
    )
    params.set(
      'transactionsPage',
      String(
        next.transactionsPage ?? transactionsFilters.transactionsPage ?? 1,
      ),
    )
    params.set(
      'transactionsLimit',
      String(
        next.transactionsLimit ??
          transactionsPagination.limit ??
          transactionsFilters.transactionsLimit ??
          10,
      ),
    )
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const invSafePage = Math.max(1, invoicesPagination.page || 1)
  const invTotalPages = Math.max(1, invoicesPagination.totalPages || 1)
  const invTotal = invoicesPagination.total || 0
  const invPageSize = invoicesPagination.limit || 10
  const invStart = invTotal === 0 ? 0 : (invSafePage - 1) * invPageSize
  const invPaginationItems = useMemo(
    () => buildPaginationItems(invSafePage, invTotalPages),
    [invSafePage, invTotalPages],
  )

  const txSafePage = Math.max(1, transactionsPagination.page || 1)
  const txTotalPages = Math.max(1, transactionsPagination.totalPages || 1)
  const txTotal = transactionsPagination.total || 0
  const txPageSize = transactionsPagination.limit || 10
  const txStart = txTotal === 0 ? 0 : (txSafePage - 1) * txPageSize
  const txPaginationItems = useMemo(
    () => buildPaginationItems(txSafePage, txTotalPages),
    [txSafePage, txTotalPages],
  )

  /**
   * @param {{
   *   safePage: number
   *   totalPages: number
   *   total: number
   *   pageSize: number
   *   start: number
   *   rowsLength: number
   *   paginationItems: Array<number | 'ellipsis'>
   *   emptyKey: string
   *   onPage: (page: number) => void
   *   onLimit: (limit: number) => void
   * }} opts
   */
  function renderPaginationBar({
    safePage,
    totalPages,
    total,
    pageSize,
    start,
    rowsLength,
    paginationItems,
    emptyKey,
    onPage,
    onLimit,
  }) {
    return (
      <div className="text-hisabi-on-surface-variant flex flex-col gap-hisabi-md border-t border-hisabi-outline-variant/20 bg-slate-50/50 p-hisabi-md text-xs font-medium sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-hisabi-lg">
          <div className="flex items-center gap-2">
            <span>{t('rowsPerPage')}</span>
            <select
              className="type-label-sm cursor-pointer border-none bg-transparent py-0 ps-1 pe-6 font-bold text-hisabi-on-surface focus:ring-0"
              aria-label={t('rowsPerPageAria')}
              value={pageSize}
              disabled={listBusy}
              onChange={(e) => onLimit(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <span>
            {total === 0
              ? t(emptyKey)
              : t('range', {
                  from: start + 1,
                  to: start + rowsLength,
                  total,
                })}
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 sm:justify-end">
          <button
            type="button"
            disabled={safePage <= 1 || listBusy}
            className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t('pageFirst')}
            onClick={() => onPage(1)}
          >
            <ChevronsLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={safePage <= 1 || listBusy}
            className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t('pagePrev')}
            onClick={() => onPage(Math.max(1, safePage - 1))}
          >
            <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
          </button>
          <div className="flex items-center gap-1">
            {paginationItems.map((item, idx) =>
              item === 'ellipsis' ? (
                <span key={`e-${idx}`} className="px-2 text-slate-400">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  disabled={listBusy}
                  onClick={() => onPage(item)}
                  className={cn(
                    'type-label-sm min-w-8 cursor-pointer rounded-lg px-2 py-1.5 font-bold transition-colors',
                    item === safePage
                      ? 'bg-hisabi-primary-container text-white'
                      : 'text-hisabi-on-surface-variant hover:bg-white',
                  )}
                >
                  {item}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            disabled={safePage >= totalPages || listBusy}
            className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t('pageNext')}
            onClick={() => onPage(Math.min(totalPages, safePage + 1))}
          >
            <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
          </button>
          <button
            type="button"
            disabled={safePage >= totalPages || listBusy}
            className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t('pageLast')}
            onClick={() => onPage(totalPages)}
          >
            <ChevronsRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    )
  }

  function invoiceKindLabel(row) {
    const earn = row.hasEarn === true
    const redeem = row.hasRedeem === true
    if (earn && redeem) return t('invoiceKindBoth')
    if (earn) return t('invoiceKindEarn')
    if (redeem) return t('invoiceKindRedeem')
    return t('invoiceKindLinked')
  }

  return (
    <div
      className={cn(
        'mx-auto max-w-hisabi-container pb-hisabi-xxl',
        listBusy && 'opacity-70',
      )}
    >
      <PageBackButton
        href="/loyalty/customers"
        label={t('customerBackToList')}
      />

      <div className="mb-hisabi-xl flex flex-col gap-hisabi-md sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1
            className="type-headline-xl text-hisabi-on-surface tracking-tight"
            dir="ltr"
          >
            {String(customer.phone ?? '—')}
          </h1>
          <p className="type-body-md text-hisabi-on-surface-variant">
            {t('customerDetailSubtitle')}
          </p>
        </div>
        {canUpdate ? (
          <div className="flex w-full flex-col gap-hisabi-sm sm:w-auto sm:min-w-[12rem]">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="type-label-md flex min-h-hisabi-btn w-full cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-lg py-hisabi-btn font-bold text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
            >
              <Pencil className="size-4 shrink-0" aria-hidden />
              {t('edit')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="space-y-hisabi-xl">
        <SettingsSection title={t('customerSectionBasics')} icon={Gift}>
          <dl className="grid grid-cols-1 gap-hisabi-lg min-[480px]:grid-cols-2">
            <DetailField label={t('colPhone')}>
              <span dir="ltr" className="inline-block">
                {String(customer.phone ?? '—')}
              </span>
            </DetailField>
            <DetailField label={t('colBalance')}>
              <span dir="ltr" className="inline-block">
                {String(customer.balance ?? '0')}
              </span>
            </DetailField>
            <DetailField label={t('colCreatedAt')}>
              {formatDate(
                typeof customer.createdAt === 'string'
                  ? customer.createdAt
                  : null,
                locale,
              )}
            </DetailField>
            <DetailField label={t('statVisitCount')}>
              <span dir="ltr" className="inline-block">
                {String(stats.visitCount ?? 0)}
              </span>
            </DetailField>
            <DetailField label={t('statTotalSpend')}>
              <span dir="ltr" className="inline-block">
                {String(stats.totalSpend ?? '0')}
              </span>
            </DetailField>
            <DetailField label={t('statTotalEarned')}>
              <span dir="ltr" className="inline-block">
                {String(stats.totalPointsEarned ?? '0')}
              </span>
            </DetailField>
            <DetailField label={t('statTotalRedeemed')}>
              <span dir="ltr" className="inline-block">
                {String(stats.totalPointsRedeemed ?? '0')}
              </span>
            </DetailField>
          </dl>
        </SettingsSection>

        <SettingsSection title={t('customerSectionInvoices')} icon={FileText}>
          <div className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white">
            <div className={LIST_TABLE_SCROLL_WRAP}>
              <table className={cn(LIST_TABLE_BASE, 'min-w-[720px]')}>
                <thead>
                  <tr className={LIST_TABLE_HEAD_ROW}>
                    <th scope="col" className={listTableThClass(undefined, true)}>
                      {t('colInvoiceNumber')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colInvoiceDate')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colGrandTotal')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colLoyaltyKind')}
                    </th>
                  </tr>
                </thead>
                <tbody className={LIST_TABLE_BODY}>
                  {invoices.length === 0 ? (
                    <tr className={LIST_TABLE_ROW}>
                      <td
                        colSpan={4}
                        className={listTableTdClass(
                          'type-body-md text-hisabi-on-surface-variant py-hisabi-xl text-center',
                        )}
                      >
                        {t('invoicesEmpty')}
                      </td>
                    </tr>
                  ) : (
                    invoices.map((row) => (
                      <tr key={String(row.id)} className={LIST_TABLE_ROW}>
                        <td className={listTableTdClass(undefined, true)}>
                          <Link
                            href={`/invoices/${row.id}`}
                            className="type-body-md font-bold text-hisabi-on-surface hover:text-hisabi-primary hover:underline"
                            dir="ltr"
                          >
                            {String(row.invoiceNumber ?? '—')}
                          </Link>
                        </td>
                        <td
                          className={listTableTdClass(
                            'type-body-sm text-hisabi-on-surface-variant',
                          )}
                        >
                          {formatDate(
                            typeof row.invoiceDate === 'string'
                              ? row.invoiceDate
                              : null,
                            locale,
                          )}
                        </td>
                        <td
                          className={listTableTdClass(
                            'type-body-sm text-hisabi-on-surface tabular-nums',
                          )}
                        >
                          <span dir="ltr" className="inline-block">
                            {String(row.grandTotal ?? '—')}
                          </span>
                        </td>
                        <td
                          className={listTableTdClass(
                            'type-body-sm text-hisabi-on-surface',
                          )}
                        >
                          {invoiceKindLabel(row)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {renderPaginationBar({
              safePage: invSafePage,
              totalPages: invTotalPages,
              total: invTotal,
              pageSize: invPageSize,
              start: invStart,
              rowsLength: invoices.length,
              paginationItems: invPaginationItems,
              emptyKey: 'invoicesRangeEmpty',
              onPage: (page) =>
                pushDetailFilters({
                  invoicesPage: page,
                  invoicesLimit: invPageSize,
                  transactionsPage: transactionsFilters.transactionsPage,
                  transactionsLimit: txPageSize,
                }),
              onLimit: (limit) =>
                pushDetailFilters({
                  invoicesPage: 1,
                  invoicesLimit: limit,
                  transactionsPage: transactionsFilters.transactionsPage,
                  transactionsLimit: txPageSize,
                }),
            })}
          </div>
        </SettingsSection>

        <SettingsSection title={t('customerSectionTransactions')} icon={History}>
          <div className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white">
            <div className={LIST_TABLE_SCROLL_WRAP}>
              <table className={cn(LIST_TABLE_BASE, 'min-w-[760px]')}>
                <thead>
                  <tr className={LIST_TABLE_HEAD_ROW}>
                    <th scope="col" className={listTableThClass(undefined, true)}>
                      {t('colTxDate')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colTxType')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colTxPoints')}
                    </th>
                    <th scope="col" className={listTableThClass()}>
                      {t('colTxInvoice')}
                    </th>
                  </tr>
                </thead>
                <tbody className={LIST_TABLE_BODY}>
                  {transactions.length === 0 ? (
                    <tr className={LIST_TABLE_ROW}>
                      <td
                        colSpan={4}
                        className={listTableTdClass(
                          'type-body-md text-hisabi-on-surface-variant py-hisabi-xl text-center',
                        )}
                      >
                        {t('transactionsEmpty')}
                      </td>
                    </tr>
                  ) : (
                    transactions.map((row) => {
                      const type = String(row.type ?? '')
                      const badge = transactionTypeBadge(type, t)
                      const pointsClass =
                        type === 'EARN'
                          ? 'text-green-700'
                          : type === 'REDEEM'
                            ? 'text-amber-800'
                            : parseMoney(row.points) < 0
                              ? 'text-hisabi-error'
                              : 'text-slate-700'
                      return (
                        <tr key={String(row.id)} className={LIST_TABLE_ROW}>
                          <td
                            className={listTableTdClass(
                              'type-body-sm text-hisabi-on-surface-variant',
                              true,
                            )}
                          >
                            {formatDateTime(
                              typeof row.createdAt === 'string'
                                ? row.createdAt
                                : null,
                              locale,
                            )}
                          </td>
                          <td className={listTableTdClass()}>
                            <span
                              className={cn(
                                'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                                badge.className,
                              )}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td
                            className={listTableTdClass(
                              cn(
                                'type-body-sm font-semibold tabular-nums',
                                pointsClass,
                              ),
                            )}
                          >
                            <span dir="ltr" className="inline-block">
                              {formatSignedPoints(
                                type,
                                String(row.points ?? '0'),
                              )}
                            </span>
                          </td>
                          <td className={listTableTdClass()}>
                            {row.invoiceId && row.invoiceNumber ? (
                              <Link
                                href={`/invoices/${row.invoiceId}`}
                                className="type-body-sm font-medium text-hisabi-on-surface hover:text-hisabi-primary hover:underline"
                                dir="ltr"
                              >
                                {String(row.invoiceNumber)}
                              </Link>
                            ) : (
                              <span className="type-body-sm text-hisabi-on-surface-variant">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            {renderPaginationBar({
              safePage: txSafePage,
              totalPages: txTotalPages,
              total: txTotal,
              pageSize: txPageSize,
              start: txStart,
              rowsLength: transactions.length,
              paginationItems: txPaginationItems,
              emptyKey: 'transactionsRangeEmpty',
              onPage: (page) =>
                pushDetailFilters({
                  invoicesPage: invoicesFilters.invoicesPage,
                  invoicesLimit: invPageSize,
                  transactionsPage: page,
                  transactionsLimit: txPageSize,
                }),
              onLimit: (limit) =>
                pushDetailFilters({
                  invoicesPage: invoicesFilters.invoicesPage,
                  invoicesLimit: invPageSize,
                  transactionsPage: 1,
                  transactionsLimit: limit,
                }),
            })}
          </div>
        </SettingsSection>
      </div>

      <EditLoyaltyCustomerSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={{
          id: String(customer.id),
          phone: String(customer.phone ?? ''),
          balance: String(customer.balance ?? '0'),
        }}
        onSuccess={() => {
          router.refresh()
        }}
      />
    </div>
  )
}
