'use client'

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Pencil,
  Ticket,
  TicketPercent,
  UtensilsCrossed,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { SettingsSection } from '@/components/settings/settings-page-shell'
import { PageBackButton } from '@/components/shared/page-back-button'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { AuthApiError, authGetBlob } from '@/lib/api/auth-client'
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
import { useUrlSyncedSearchInput } from '@/lib/list-views/use-url-synced-search-input'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

/**
 * @param {{ label: string, children: import('react').ReactNode, className?: string, dir?: string }} props
 */
function DetailField({ label, children, className, dir }) {
  return (
    <div className={cn('min-w-0 space-y-hisabi-xs', className)}>
      <p className="type-label-md text-hisabi-on-surface-variant">{label}</p>
      <div className="type-body-md text-hisabi-on-surface" dir={dir}>
        {children}
      </div>
    </div>
  )
}

/**
 * @param {string | null | undefined} iso
 * @param {string} locale
 */
function formatDate(iso, locale) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * @param {string | null | undefined} iso
 * @param {string} locale
 */
function formatDateTime(iso, locale) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * @param {{
 *   nameAr?: string | null
 *   nameEn?: string | null
 * } | null | undefined} named
 * @param {string} locale
 * @param {string} [fallback]
 */
function localizedName(named, locale, fallback = '—') {
  if (!named) return fallback
  if (locale === 'ar') {
    const ar = String(named.nameAr ?? '').trim()
    return ar || String(named.nameEn ?? '').trim() || fallback
  }
  const en = String(named.nameEn ?? '').trim()
  return en || String(named.nameAr ?? '').trim() || fallback
}

/**
 * @param {Record<string, unknown>} rule
 * @param {string} locale
 */
function ruleMenuItemLabel(rule, locale) {
  const menu =
    rule.menuItem && typeof rule.menuItem === 'object'
      ? /** @type {{ nameAr?: string | null, nameEn?: string | null }} */ (
          rule.menuItem
        )
      : null
  return localizedName(menu, locale)
}

/**
 * @param {Record<string, unknown>} rule
 * @param {string} locale
 * @param {(key: string) => string} t
 */
function ruleVariantsLabel(rule, locale, t) {
  const variants = Array.isArray(rule.variants) ? rule.variants : []
  if (variants.length === 0) return t('detailVariantsAny')
  return variants
    .map((v) => {
      const opt =
        v && typeof v === 'object'
          ? /** @type {{
              nameAr?: string | null
              nameEn?: string | null
              group?: { nameAr?: string | null, nameEn?: string | null } | null
            }} */ (v)
          : null
      if (!opt) return '—'
      const optionName = localizedName(opt, locale)
      const groupName = opt.group ? localizedName(opt.group, locale, '') : ''
      return groupName ? `${groupName}: ${optionName}` : optionName
    })
    .join(' · ')
}

/**
 * @param {string} ruleType
 * @param {(key: string) => string} t
 */
function ruleTypeLabel(ruleType, t) {
  if (ruleType === 'BUY') return t('detailRuleTypeBuy')
  if (ruleType === 'GET') return t('detailRuleTypeGet')
  if (ruleType === 'COMBO_ITEM') return t('detailRuleTypeCombo')
  return ruleType
}

/**
 * @param {{
 *   usedCount?: number | null
 *   usageLimit?: number | null
 * }} row
 * @param {(key: string, values?: Record<string, unknown>) => string} t
 */
function codeUsageLabel(row, t) {
  const used = typeof row.usedCount === 'number' ? row.usedCount : 0
  if (row.usageLimit == null) {
    return t('codeUsageUnlimited', { used })
  }
  const limit = row.usageLimit
  if (used <= 0) return t('codeUsageAvailable')
  if (used >= limit) return t('codeUsageUsed')
  return t('codeUsagePartial', { used, limit })
}

/**
 * @param {{
 *   title: string
 *   rules: Array<Record<string, unknown>>
 *   locale: string
 *   t: (key: string, values?: Record<string, unknown>) => string
 *   showGetDiscount?: boolean
 *   showRuleType?: boolean
 * }} props
 */
function ItemRulesTable({
  title,
  rules,
  locale,
  t,
  showGetDiscount = false,
  showRuleType = true,
}) {
  if (rules.length === 0) {
    return (
      <div className="space-y-hisabi-sm">
        <p className="type-label-md font-bold text-hisabi-on-surface">{title}</p>
        <p className="type-body-md text-hisabi-on-surface-variant">
          {t('detailItemRulesEmpty')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-hisabi-sm">
      <p className="type-label-md font-bold text-hisabi-on-surface">{title}</p>
      <div
        className={cn(
          LIST_TABLE_SCROLL_WRAP,
          'overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white',
        )}
      >
        <table className={cn(LIST_TABLE_BASE, 'min-w-[520px]')}>
          <thead>
            <tr className={LIST_TABLE_HEAD_ROW}>
              {showRuleType ? (
                <th className={listTableThClass(undefined, true)}>
                  {t('detailColRole')}
                </th>
              ) : null}
              <th className={listTableThClass(undefined, !showRuleType)}>
                {t('formMenuItem')}
              </th>
              <th className={listTableThClass()}>{t('formQuantity')}</th>
              <th className={listTableThClass()}>{t('formVariantsLegend')}</th>
              {showGetDiscount ? (
                <th className={listTableThClass()}>
                  {t('formGetDiscountPercent')}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className={LIST_TABLE_BODY}>
            {rules.map((rule, idx) => {
              const key =
                typeof rule.id === 'string' && rule.id
                  ? rule.id
                  : `rule-${idx}`
              const ruleType =
                typeof rule.ruleType === 'string' ? rule.ruleType : ''
              return (
                <tr key={key} className={LIST_TABLE_ROW}>
                  {showRuleType ? (
                    <td className={listTableTdClass(undefined, true)}>
                      <span className="type-label-sm rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
                        {ruleTypeLabel(ruleType, t)}
                      </span>
                    </td>
                  ) : null}
                  <td
                    className={listTableTdClass(
                      'type-label-lg text-hisabi-on-surface',
                      !showRuleType,
                    )}
                  >
                    {ruleMenuItemLabel(rule, locale)}
                  </td>
                  <td
                    className={cn(listTableTdClass(), 'tabular-nums')}
                    dir="ltr"
                  >
                    {typeof rule.quantity === 'number' ? rule.quantity : '—'}
                  </td>
                  <td
                    className={listTableTdClass(
                      'type-body-sm text-hisabi-on-surface',
                    )}
                  >
                    {ruleVariantsLabel(rule, locale, t)}
                  </td>
                  {showGetDiscount ? (
                    <td
                      className={cn(listTableTdClass(), 'tabular-nums')}
                      dir="ltr"
                    >
                      {rule.discountPercent != null &&
                      String(rule.discountPercent).trim() !== ''
                        ? `${String(rule.discountPercent)}%`
                        : '—'}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * @param {{
 *   coupon: Record<string, unknown>
 *   codes: Array<Record<string, unknown>> | null
 *   codesPagination: { page: number, limit: number, total: number, totalPages: number }
 *   codesFilters: { codesSearch: string, codesPage: number, codesLimit: number }
 * }} props
 */
export function CouponDetailView({
  coupon,
  codes,
  codesPagination,
  codesFilters,
}) {
  const t = useTranslations('Coupons')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const ability = useAppAbility()
  const canUpdate = ability.can('update', 'Coupon')
  const [isPending, startTransition] = useTransition()
  const [exporting, setExporting] = useState(
    /** @type {null | 'all' | 'available'} */ (null),
  )

  const isBatch = coupon.codeType === 'UNIQUE_BATCH'
  const displayName =
    locale === 'ar'
      ? String(coupon.nameAr ?? '')
      : String(coupon.nameEn ?? '').trim() || String(coupon.nameAr ?? '')

  const discountKindLabel = useMemo(
    () => ({
      PERCENTAGE: t('kindPercentage'),
      FIXED_AMOUNT: t('kindFixed'),
      BOGO: t('kindBogo'),
      COMBO: t('kindCombo'),
    }),
    [t],
  )

  const codeTypeLabel = useMemo(
    () => ({
      SHARED: t('codeTypeShared'),
      UNIQUE_BATCH: t('codeTypeUniqueBatch'),
    }),
    [t],
  )

  function couponUsageLabel() {
    if (coupon.codeType === 'UNIQUE_BATCH') {
      const used =
        typeof coupon.usageCount === 'number' ? coupon.usageCount : 0
      const codeCount =
        typeof coupon.codeCount === 'number'
          ? coupon.codeCount
          : typeof coupon.batchSize === 'number'
            ? coupon.batchSize
            : 0
      return t('usageBatch', { used, codes: codeCount })
    }
    const used = typeof coupon.usedCount === 'number' ? coupon.usedCount : 0
    if (coupon.totalUsageLimit == null) {
      return t('usageSharedUnlimited', { used })
    }
    return t('usageShared', {
      used,
      limit: coupon.totalUsageLimit,
    })
  }

  function discountValueDisplay() {
    const kind = String(coupon.discountKind ?? '')
    if (kind === 'BOGO') return '—'
    if (kind === 'PERCENTAGE') {
      const v = coupon.discountValue != null ? String(coupon.discountValue) : '—'
      return v === '—' ? v : `${v}%`
    }
    if (kind === 'COMBO') {
      return coupon.discountValue != null
        ? String(coupon.discountValue)
        : '—'
    }
    return coupon.discountValue != null ? String(coupon.discountValue) : '—'
  }

  const { searchInput, setSearchInput, debouncedSearch, lastPushedSearch } =
    useUrlSyncedSearchInput(codesFilters.codesSearch)

  function pushCodesFilters(next) {
    const params = new URLSearchParams()
    params.set('codesPage', String(next.codesPage ?? 1))
    params.set(
      'codesLimit',
      String(next.codesLimit ?? codesPagination.limit ?? 10),
    )
    if (next.codesSearch) params.set('codesSearch', next.codesSearch)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  useEffect(() => {
    if (!isBatch) return
    if (debouncedSearch === lastPushedSearch.current) return
    lastPushedSearch.current = debouncedSearch
    pushCodesFilters({
      codesPage: 1,
      codesSearch: debouncedSearch,
      codesLimit: codesPagination.limit,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from debounced search only
  }, [debouncedSearch, isBatch])

  /**
   * @param {'all' | 'available'} mode
   */
  async function handleExportCsv(mode) {
    setExporting(mode)
    try {
      const qs =
        mode === 'available'
          ? 'format=csv&availableOnly=1'
          : 'format=csv'
      const { blob, filename } = await authGetBlob(
        `/coupons/${coupon.id}/codes?${qs}`,
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        filename ||
        (mode === 'available'
          ? `hisabi-pos-coupon-codes-available-${coupon.id}.csv`
          : `hisabi-pos-coupon-codes-${coupon.id}.csv`)
      a.click()
      URL.revokeObjectURL(url)
      toast.success(
        mode === 'available'
          ? t('exportAvailableCsvSuccess')
          : t('exportCsvSuccess'),
      )
    } catch (err) {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    } finally {
      setExporting(null)
    }
  }

  const codesRows = codes ?? []
  const safePage = Math.max(1, codesPagination.page || 1)
  const totalPages = Math.max(1, codesPagination.totalPages || 1)
  const total = codesPagination.total || 0
  const pageSize = codesPagination.limit || 10
  const start = total === 0 ? 0 : (safePage - 1) * pageSize
  const listBusy = isPending
  const paginationItems = useMemo(
    () => buildPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  )

  const discountKind = String(coupon.discountKind ?? '')
  const showItemRules = discountKind === 'BOGO' || discountKind === 'COMBO'
  const itemRules = useMemo(() => {
    const raw = Array.isArray(coupon.itemRules) ? coupon.itemRules : []
    return [...raw].sort((a, b) => {
      const sa =
        typeof a === 'object' && a && typeof a.sortOrder === 'number'
          ? a.sortOrder
          : 0
      const sb =
        typeof b === 'object' && b && typeof b.sortOrder === 'number'
          ? b.sortOrder
          : 0
      return sa - sb
    })
  }, [coupon.itemRules])
  const buyRules = itemRules.filter(
    (r) => r && typeof r === 'object' && r.ruleType === 'BUY',
  )
  const getRules = itemRules.filter(
    (r) => r && typeof r === 'object' && r.ruleType === 'GET',
  )
  const comboRules = itemRules.filter(
    (r) => r && typeof r === 'object' && r.ruleType === 'COMBO_ITEM',
  )

  return (
    <div
      className={cn(
        'mx-auto max-w-hisabi-container pb-hisabi-xxl',
        listBusy && 'opacity-70',
      )}
    >
      <PageBackButton href="/coupons" label={t('formBackToList')} />

      <div className="mb-hisabi-xl flex flex-col gap-hisabi-md sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="type-headline-xl text-hisabi-on-surface tracking-tight">
            {displayName}
          </h1>
          <p className="type-body-md text-hisabi-on-surface-variant">
            {t('detailSubtitle')}
          </p>
          <div className="flex flex-wrap gap-hisabi-sm">
            <span
              className={cn(
                'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                coupon.active
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600',
              )}
            >
              {coupon.active ? t('statusActive') : t('statusInactive')}
            </span>
          </div>
        </div>

        {canUpdate ? (
          <div className="flex w-full flex-col gap-hisabi-sm sm:w-auto sm:min-w-[12rem]">
            <Link
              href={`/coupons/${coupon.id}/edit`}
              className="type-label-md flex min-h-hisabi-btn w-full cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-lg py-hisabi-btn font-bold text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
            >
              <Pencil className="size-4 shrink-0" aria-hidden />
              {t('edit')}
            </Link>
          </div>
        ) : null}
      </div>

      <div className="space-y-hisabi-xl">
        <SettingsSection title={t('detailSectionBasics')} icon={TicketPercent}>
          <div className="grid grid-cols-1 gap-hisabi-lg min-[480px]:grid-cols-2">
            <DetailField label={t('formNameAr')}>
              {String(coupon.nameAr ?? '—')}
            </DetailField>
            <DetailField label={t('formNameEn')}>
              {String(coupon.nameEn ?? '').trim() || '—'}
            </DetailField>
            <DetailField label={t('colCodeType')}>
              {codeTypeLabel[/** @type {string} */ (coupon.codeType)] ??
                String(coupon.codeType ?? '—')}
            </DetailField>
            <DetailField label={t('colDiscountKind')}>
              {discountKindLabel[/** @type {string} */ (coupon.discountKind)] ??
                String(coupon.discountKind ?? '—')}
            </DetailField>
            {!isBatch ? (
              <DetailField label={t('colCode')} dir="ltr">
                {typeof coupon.code === 'string' && coupon.code.length > 0
                  ? coupon.code
                  : '—'}
              </DetailField>
            ) : (
              <DetailField label={t('formBatchSizeLabel')}>
                {typeof coupon.batchSize === 'number'
                  ? t('batchOf', { size: coupon.batchSize })
                  : '—'}
              </DetailField>
            )}
            <DetailField label={t('detailDiscountValue')} dir="ltr">
              {discountValueDisplay()}
            </DetailField>
            <DetailField label={t('formMaxDiscountCap')} dir="ltr">
              {coupon.maxDiscountCap != null &&
              String(coupon.maxDiscountCap).trim() !== ''
                ? String(coupon.maxDiscountCap)
                : t('detailNoCap')}
            </DetailField>
            <DetailField label={t('formMinOrder')} dir="ltr">
              {coupon.minOrderAmount != null &&
              String(coupon.minOrderAmount) !== '0'
                ? String(coupon.minOrderAmount)
                : t('detailNoMinimum')}
            </DetailField>
            <DetailField label={t('formStartDate')}>
              {formatDate(
                typeof coupon.startDate === 'string' ? coupon.startDate : null,
                locale,
              )}
            </DetailField>
            <DetailField label={t('formExpiresAt')}>
              {formatDate(
                typeof coupon.expiresAt === 'string' ? coupon.expiresAt : null,
                locale,
              )}
            </DetailField>
            <DetailField label={t('colUsage')}>{couponUsageLabel()}</DetailField>
            <DetailField label={t('colStatus')}>
              {coupon.active ? t('statusActive') : t('statusInactive')}
            </DetailField>
          </div>
        </SettingsSection>

        {showItemRules ? (
          <SettingsSection
            title={
              discountKind === 'BOGO'
                ? t('detailSectionBogo')
                : t('detailSectionCombo')
            }
            icon={UtensilsCrossed}
          >
            {itemRules.length === 0 ? (
              <p className="type-body-md text-hisabi-on-surface-variant">
                {t('detailItemRulesEmpty')}
              </p>
            ) : (
              <div className="space-y-hisabi-lg">
                {discountKind === 'BOGO' ? (
                  <>
                    <ItemRulesTable
                      title={t('formBuyItemsTitle')}
                      rules={buyRules}
                      locale={locale}
                      t={t}
                      showGetDiscount={false}
                      showRuleType={false}
                    />
                    <ItemRulesTable
                      title={t('formGetItemsTitle')}
                      rules={getRules}
                      locale={locale}
                      t={t}
                      showGetDiscount
                      showRuleType={false}
                    />
                  </>
                ) : (
                  <ItemRulesTable
                    title={t('formComboItemsTitle')}
                    rules={comboRules}
                    locale={locale}
                    t={t}
                    showGetDiscount={false}
                    showRuleType={false}
                  />
                )}
              </div>
            )}
          </SettingsSection>
        ) : null}

        {isBatch ? (
          <SettingsSection
            title={t('detailSectionCodes')}
            icon={Ticket}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-hisabi-sm">
                <button
                  type="button"
                  disabled={exporting != null || listBusy}
                  onClick={() => void handleExportCsv('available')}
                  className="type-label-md inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-md py-2 font-bold text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exporting === 'available' ? (
                    <HisabiSpinner size="inline" />
                  ) : (
                    <Download className="size-4 shrink-0" aria-hidden />
                  )}
                  {t('exportAvailableCsv')}
                </button>
                <button
                  type="button"
                  disabled={exporting != null || listBusy}
                  onClick={() => void handleExportCsv('all')}
                  className="type-label-md inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-md py-2 font-bold text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exporting === 'all' ? (
                    <HisabiSpinner size="inline" />
                  ) : (
                    <Download className="size-4 shrink-0" aria-hidden />
                  )}
                  {t('exportCsv')}
                </button>
              </div>
            }
          >
            <div className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
              <ListTableToolbar
                summary={
                  listBusy
                    ? t('codesLoading')
                    : t('codesShowingCount', {
                        shown: codesRows.length,
                        total,
                      })
                }
                searchValue={searchInput}
                onSearchChange={setSearchInput}
                searchPlaceholder={t('codesSearchPlaceholder')}
              />

              <div className={LIST_TABLE_SCROLL_WRAP}>
                <table className={LIST_TABLE_BASE}>
                  <thead>
                    <tr className={LIST_TABLE_HEAD_ROW}>
                      <th className={listTableThClass(true)}>
                        {t('colTicketNumber')}
                      </th>
                      <th className={listTableThClass()}>{t('colCode')}</th>
                      <th className={listTableThClass()}>{t('colUsage')}</th>
                      <th className={listTableThClass()}>
                        {t('colCreatedAt')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className={LIST_TABLE_BODY}>
                    {codesRows.length === 0 ? (
                      <tr className={LIST_TABLE_ROW}>
                        <td
                          colSpan={4}
                          className={listTableTdClass(
                            'type-body-md text-hisabi-on-surface-variant py-hisabi-xl text-center',
                          )}
                        >
                          {codesFilters.codesSearch
                            ? t('codesEmptyFiltered')
                            : t('codesEmpty')}
                        </td>
                      </tr>
                    ) : (
                      codesRows.map((row) => (
                        <tr key={String(row.id)} className={LIST_TABLE_ROW}>
                          <td
                            className={listTableTdClass(undefined, true)}
                            dir="ltr"
                          >
                            {String(row.ticketNumber ?? '—')}
                          </td>
                          <td
                            className={listTableTdClass(
                              'type-body-sm font-medium text-hisabi-on-surface',
                            )}
                            dir="ltr"
                          >
                            {typeof row.code === 'string' && row.code.length > 0
                              ? row.code
                              : '—'}
                          </td>
                          <td
                            className={listTableTdClass(
                              'type-body-sm text-hisabi-on-surface',
                            )}
                          >
                            {codeUsageLabel(row, t)}
                          </td>
                          <td
                            className={listTableTdClass(
                              'type-body-sm text-hisabi-on-surface-variant',
                            )}
                          >
                            {formatDateTime(
                              typeof row.createdAt === 'string'
                                ? row.createdAt
                                : null,
                              locale,
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="text-hisabi-on-surface-variant flex flex-col gap-hisabi-md border-t border-hisabi-outline-variant/20 bg-slate-50/50 p-hisabi-md text-xs font-medium sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-hisabi-lg">
                  <div className="flex items-center gap-2">
                    <span>{t('rowsPerPage')}</span>
                    <select
                      className="type-label-sm cursor-pointer border-none bg-transparent py-0 ps-1 pe-6 font-bold text-hisabi-on-surface focus:ring-0"
                      aria-label={t('rowsPerPageAria')}
                      value={pageSize}
                      disabled={listBusy}
                      onChange={(e) =>
                        pushCodesFilters({
                          codesPage: 1,
                          codesSearch: codesFilters.codesSearch,
                          codesLimit: Number(e.target.value),
                        })
                      }
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
                      ? t('codesRangeEmpty')
                      : t('range', {
                          from: start + 1,
                          to: start + codesRows.length,
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
                    onClick={() =>
                      pushCodesFilters({
                        codesPage: 1,
                        codesSearch: codesFilters.codesSearch,
                        codesLimit: pageSize,
                      })
                    }
                  >
                    <ChevronsLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    disabled={safePage <= 1 || listBusy}
                    className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={t('pagePrev')}
                    onClick={() =>
                      pushCodesFilters({
                        codesPage: Math.max(1, safePage - 1),
                        codesSearch: codesFilters.codesSearch,
                        codesLimit: pageSize,
                      })
                    }
                  >
                    <ChevronLeft className="size-5 rtl:rotate-180" />
                  </button>
                  <div className="flex items-center gap-1">
                    {paginationItems.map((item, idx) =>
                      item === 'ellipsis' ? (
                        <span key={`e-${idx}`} className="px-2 text-slate-400">
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          disabled={listBusy}
                          onClick={() =>
                            pushCodesFilters({
                              codesPage: item,
                              codesSearch: codesFilters.codesSearch,
                              codesLimit: pageSize,
                            })
                          }
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
                    onClick={() =>
                      pushCodesFilters({
                        codesPage: Math.min(totalPages, safePage + 1),
                        codesSearch: codesFilters.codesSearch,
                        codesLimit: pageSize,
                      })
                    }
                  >
                    <ChevronRight className="size-5 rtl:rotate-180" />
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages || listBusy}
                    className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={t('pageLast')}
                    onClick={() =>
                      pushCodesFilters({
                        codesPage: totalPages,
                        codesSearch: codesFilters.codesSearch,
                        codesLimit: pageSize,
                      })
                    }
                  >
                    <ChevronsRight className="size-5" />
                  </button>
                </div>
              </div>
            </div>
          </SettingsSection>
        ) : null}
      </div>
    </div>
  )
}
