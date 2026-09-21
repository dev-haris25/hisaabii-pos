'use client'

import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChefHat,
  CircleDollarSign,
  FileText,
  Loader2,
  Package,
  Pencil,
  Receipt,
  ShoppingBag,
  SlidersHorizontal,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'

import { useAppAbility } from '@/components/rbac/ability-provider'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { authGet } from '@/lib/api/auth-client'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { stockUnitLabel } from '@/lib/stock/units'
import { cn } from '@/lib/utils'
import { useSearchParams } from 'next/navigation'

/** @typedef {'overview' | 'recipe'} MenuItemTab */

/** @param {string | null | undefined} raw */
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
function DetailRow({ label, value, className, valueDir }) {
  return (
    <div className={cn('space-y-1', className)}>
      <p className="type-label-md text-hisabi-on-surface-variant">{label}</p>
      <p
        className="type-body-md text-hisabi-on-surface break-words"
        dir={valueDir}
      >
        {value || '—'}
      </p>
    </div>
  )
}

/**
 * @param {{
 *   title: string
 *   icon: import('lucide-react').LucideIcon
 *   children: import('react').ReactNode
 *   bodyClassName?: string
 * }} props
 */
function DetailSection({ title, icon: Icon, children, bodyClassName }) {
  return (
    <section className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-sm">
      <div className="flex items-center gap-hisabi-md border-b border-hisabi-outline-variant/20 px-hisabi-xl py-hisabi-lg text-start sm:px-hisabi-xxl">
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
          'px-hisabi-xl pb-hisabi-xl pt-hisabi-md sm:px-hisabi-xxl sm:pb-hisabi-xxl sm:pt-hisabi-lg',
          bodyClassName,
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
function StatCard({ label, value, icon: Icon, iconClassName }) {
  return (
    <div className="border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest flex items-center gap-hisabi-md rounded-xl border p-hisabi-lg shadow-sm">
      <div
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full',
          iconClassName,
        )}
      >
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="type-label-sm text-hisabi-on-surface-variant font-medium">
          {label}
        </p>
        <p className="type-headline-md text-hisabi-primary font-bold" dir="ltr">
          {value}
        </p>
      </div>
    </div>
  )
}

/** @param {{ itemId: string }} props */
export function MenuItemDetailView({ itemId }) {
  const t = useTranslations('Menu')
  const locale = useLocale()
  const isAr = locale === 'ar'
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ability = useAppAbility()
  const canUpdate = ability.can('update', 'MenuItem')

  const tabFromUrl = searchParams.get('tab')
  const initialTab = tabFromUrl === 'recipe' ? 'recipe' : 'overview'
  const [tab, setTab] = useState(/** @type {MenuItemTab} */ (initialTab))

  const selectTab = useCallback(
    (/** @type {MenuItemTab} */ next) => {
      setTab(next)
      const params = new URLSearchParams(searchParams.toString())
      if (next === 'overview') params.delete('tab')
      else params.set('tab', next)
      params.delete('page')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const itemQuery = useQuery({
    queryKey: ['menu', 'item', itemId],
    queryFn: async () => {
      const res = await authGet(`/menu/items/${itemId}`)
      return res.item
    },
  })

  const statsQuery = useQuery({
    queryKey: ['menu', 'item', itemId, 'stats'],
    queryFn: async () => {
      const res = await authGet(`/menu/items/${itemId}/stats`)
      return res.stats
    },
    enabled: Boolean(itemId),
  })

  const item = itemQuery.data ?? null
  const stats = statsQuery.data ?? null

  const displayName = useMemo(() => {
    if (!item) return '—'
    if (isAr) return item.nameAr
    return item.nameEn?.trim() || item.nameAr
  }, [item, isAr])

  const categoryName = useMemo(() => {
    if (!item?.category) return '—'
    if (isAr) return item.category.nameAr
    return item.category.nameEn?.trim() || item.category.nameAr
  }, [item, isAr])

  const vatLabel =
    item?.vatPreset === 'zero'
      ? t('vatZero')
      : item?.vatPreset === 'exempt'
        ? t('vatExempt')
        : t('vatStandard')

  function stockName(stock) {
    if (!stock) return '—'
    if (isAr) return stock.nameAr
    return stock.nameEn?.trim() || stock.nameAr
  }

  const prepCostDisplay = useMemo(() => {
    if (statsQuery.isPending) return '…'
    if (stats?.prepCost == null) return '—'
    return formatSarAmount(stats.prepCost, locale)
  }, [stats, statsQuery.isPending, locale])

  const tabs = /** @type {Array<[MenuItemTab, string]>} */ ([
    ['overview', 'tabOverview'],
    ['recipe', 'tabRecipe'],
  ])

  if (itemQuery.isPending) {
    return (
      <div className="text-hisabi-on-surface-variant mx-auto flex min-h-[50vh] max-w-hisabi-container items-center justify-center px-hisabi-md py-hisabi-xxl">
        <Loader2 className="size-8 animate-spin text-hisabi-primary" aria-hidden />
        <span className="sr-only">{t('viewLoading')}</span>
      </div>
    )
  }

  if (itemQuery.isError || !item) {
    return (
      <div className="mx-auto max-w-hisabi-container px-hisabi-md py-hisabi-xl">
        <p className="type-body-md text-hisabi-error" role="alert">
          {t('viewLoadError')}
        </p>
        <Link
          href="/menu"
          className="type-label-md text-hisabi-primary mt-hisabi-md inline-block"
        >
          {t('backToMenu')}
        </Link>
      </div>
    )
  }

  const recipe = item.recipe
  const variantGroups = Array.isArray(item.variantGroups) ? item.variantGroups : []
  const customizations = Array.isArray(item.customizations)
    ? item.customizations
    : []
  const hasRecipe =
    Boolean(recipe?.steps?.trim()) ||
    Boolean(recipe?.stepsAr?.trim()) ||
    (Array.isArray(recipe?.ingredients) && recipe.ingredients.length > 0)

  return (
    <div className="bg-hisabi-background min-h-[calc(100vh-4rem)] pb-hisabi-xxl">
      <div className="sticky top-0 z-10 bg-transparent">
        <div className="mx-auto flex max-w-hisabi-container items-center justify-between gap-hisabi-md px-hisabi-md py-hisabi-sm sm:px-hisabi-xl">
          <div className="flex min-w-0 items-center gap-hisabi-md">
            <Link
              href="/menu"
              className="text-hisabi-primary hover:bg-hisabi-surface-container-low flex size-10 shrink-0 items-center justify-center rounded-full transition-colors"
              aria-label={t('backToMenu')}
            >
              <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
            </Link>
            <span className="type-headline-md text-hisabi-primary truncate font-bold">
              {displayName}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-hisabi-container space-y-hisabi-lg px-hisabi-md py-hisabi-xl sm:px-hisabi-xl">
        <div className="border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest flex flex-col items-start justify-between gap-hisabi-lg rounded-xl border p-hisabi-lg shadow-sm md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-hisabi-lg md:items-center">
            <div className="bg-hisabi-primary-container text-hisabi-on-primary-container relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated menu image URL
                <img
                  src={item.imageUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="type-headline-md font-bold">
                  {initialsFromName(displayName)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-hisabi-xs">
              <h1 className="type-headline-lg text-hisabi-primary break-words">
                {displayName}
              </h1>
              <div className="text-hisabi-on-surface-variant type-body-md flex flex-wrap items-center gap-hisabi-sm">
                <span>{categoryName}</span>
                <span
                  className="bg-hisabi-outline-variant hidden h-4 w-px sm:inline-block"
                  aria-hidden
                />
                <span
                  className="bg-hisabi-surface-container-high text-hisabi-primary type-label-sm rounded px-2 py-0.5 font-semibold"
                  dir="ltr"
                >
                  {formatSarAmount(item.price, locale)}
                </span>
                <span className="bg-hisabi-surface-container-high text-hisabi-primary type-label-sm rounded px-2 py-0.5 font-semibold">
                  {vatLabel}
                </span>
                <span
                  className={cn(
                    'type-label-sm rounded px-2 py-0.5 font-semibold',
                    item.active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {item.active ? t('statusActive') : t('statusInactive')}
                </span>
              </div>
            </div>
          </div>
          {canUpdate ? (
            <Link
              href={`/menu/items/${itemId}/edit`}
              className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
            >
              <Pencil className="size-4 shrink-0" aria-hidden />
              {t('edit')}
            </Link>
          ) : null}
        </div>

        <div
          className="border-hisabi-outline-variant flex gap-hisabi-xl overflow-x-auto border-b"
          role="tablist"
          aria-label={t('viewSheetTitle')}
        >
          {tabs.map(([key, labelKey]) => {
            const selected = tab === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  'type-label-md shrink-0 border-b-2 pb-hisabi-md pt-1 transition-colors',
                  selected
                    ? 'border-hisabi-primary font-bold text-hisabi-primary'
                    : 'hover:text-hisabi-primary border-transparent text-hisabi-on-surface-variant',
                )}
                onClick={() => selectTab(key)}
              >
                {t(labelKey)}
              </button>
            )
          })}
        </div>

        {tab === 'overview' ? (
          <div className="space-y-hisabi-lg">
            <div className="grid grid-cols-1 gap-hisabi-lg md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t('statInvoiceCount')}
                value={
                  statsQuery.isPending ? '…' : String(stats?.invoiceCount ?? 0)
                }
                icon={FileText}
                iconClassName="bg-hisabi-primary-container/25 text-hisabi-primary"
              />
              <StatCard
                label={t('statQtySold')}
                value={statsQuery.isPending ? '…' : String(stats?.qtySold ?? 0)}
                icon={ShoppingBag}
                iconClassName="bg-hisabi-gold-muted/50 text-hisabi-secondary"
              />
              <StatCard
                label={t('statRevenue')}
                value={
                  statsQuery.isPending
                    ? '…'
                    : formatSarAmount(stats?.revenue ?? '0', locale)
                }
                icon={Receipt}
                iconClassName="bg-hisabi-primary-container/25 text-hisabi-primary"
              />
              <StatCard
                label={t('statPrepCost')}
                value={prepCostDisplay}
                icon={CircleDollarSign}
                iconClassName="bg-hisabi-error/15 text-hisabi-error"
              />
            </div>
            {stats?.prepCostIncomplete && stats?.prepCost != null ? (
              <p className="type-body-sm text-hisabi-on-surface-variant -mt-hisabi-sm">
                {t('statPrepCostPartialHint')}
              </p>
            ) : null}
            {statsQuery.isSuccess &&
            stats?.prepCost == null &&
            hasRecipe ? (
              <p className="type-body-sm text-hisabi-on-surface-variant -mt-hisabi-sm">
                {t('statPrepCostMissingHint')}
              </p>
            ) : null}

            <DetailSection title={t('sectionBasicInfo')} icon={Package}>
              <div className="grid grid-cols-1 gap-hisabi-lg sm:grid-cols-2 lg:grid-cols-3">
                <DetailRow label={t('itemNameAr')} value={item.nameAr} />
                <DetailRow
                  label={t('itemNameEn')}
                  value={item.nameEn?.trim() || '—'}
                />
                <DetailRow label={t('colCategory')} value={categoryName} />
                <DetailRow
                  label={t('priceLabel')}
                  value={formatSarAmount(item.price, locale)}
                  valueDir="ltr"
                />
                <DetailRow label={t('vatLabel')} value={vatLabel} />
                <DetailRow
                  label={t('sortOrderLabel')}
                  value={String(
                    typeof item.sortOrder === 'number' ? item.sortOrder : 0,
                  )}
                  valueDir="ltr"
                />
                <DetailRow
                  label={t('colStatus')}
                  value={item.active ? t('statusActive') : t('statusInactive')}
                />
              </div>
            </DetailSection>

            {variantGroups.length > 0 ? (
              <DetailSection
                title={t('sectionVariants')}
                icon={SlidersHorizontal}
                bodyClassName="space-y-hisabi-lg"
              >
                {variantGroups.map((group) => {
                  const gName = isAr
                    ? group.nameAr
                    : group.nameEn?.trim() || group.nameAr
                  return (
                    <div key={group.id} className="space-y-hisabi-sm">
                      <p className="type-label-lg text-hisabi-on-surface font-semibold">
                        {gName}
                      </p>
                      <ul className="space-y-1">
                        {(group.options ?? []).map((opt) => {
                          const oName = isAr
                            ? opt.nameAr
                            : opt.nameEn?.trim() || opt.nameAr
                          const change = Number.parseFloat(
                            String(opt.priceChange ?? '0'),
                          )
                          const changeLabel =
                            !Number.isFinite(change) || change === 0
                              ? t('priceChangeZero')
                              : change > 0
                                ? `+${formatSarAmount(String(change), locale)}`
                                : formatSarAmount(String(change), locale)
                          return (
                            <li
                              key={opt.id}
                              className="type-body-md text-hisabi-on-surface-variant flex flex-wrap gap-hisabi-sm"
                            >
                              <span>{oName}</span>
                              <span dir="ltr">({changeLabel})</span>
                              {opt.isDefault ? (
                                <span className="type-label-sm inline-flex items-center justify-center rounded bg-hisabi-surface-container px-1.5 py-0.5 leading-none">
                                  {t('optionDefault')}
                                </span>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </DetailSection>
            ) : null}

            {customizations.length > 0 ? (
              <DetailSection title={t('sectionCustomizations')} icon={SlidersHorizontal}>
                <ul className="space-y-2">
                  {customizations.map((c) => {
                    const cName = isAr
                      ? c.nameAr
                      : c.nameEn?.trim() || c.nameAr
                    const change = Number.parseFloat(String(c.priceChange ?? '0'))
                    const changeLabel =
                      !Number.isFinite(change) || change === 0
                        ? t('priceChangeZero')
                        : change > 0
                          ? `+${formatSarAmount(String(change), locale)}`
                          : formatSarAmount(String(change), locale)
                    return (
                      <li
                        key={c.id}
                        className="type-body-md text-hisabi-on-surface flex flex-wrap justify-between gap-hisabi-sm border-b border-hisabi-outline-variant/15 pb-2 last:border-0"
                      >
                        <span>{cName}</span>
                        <span dir="ltr" className="text-hisabi-on-surface-variant">
                          {changeLabel}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </DetailSection>
            ) : null}
          </div>
        ) : null}

        {tab === 'recipe' ? (
          <div className="space-y-hisabi-lg">
            {!hasRecipe ? (
              <p className="type-body-md text-hisabi-on-surface-variant rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest p-hisabi-xl">
                {t('recipeEmpty')}
              </p>
            ) : (
              <>
                {recipe?.steps?.trim() || recipe?.stepsAr?.trim() ? (
                  <DetailSection title={t('recipeStepsTitle')} icon={ChefHat}>
                    <div className="space-y-hisabi-lg">
                      {recipe?.steps?.trim() ? (
                        <div className="space-y-1">
                          <p className="type-label-sm text-hisabi-on-surface-variant">
                            {t('fieldRecipeStepsEn')}
                          </p>
                          <pre className="type-body-md text-hisabi-on-surface whitespace-pre-wrap font-sans">
                            {recipe.steps}
                          </pre>
                        </div>
                      ) : null}
                      {recipe?.stepsAr?.trim() ? (
                        <div className="space-y-1" dir="rtl" lang="ar">
                          <p className="type-label-sm text-hisabi-on-surface-variant">
                            {t('fieldRecipeStepsAr')}
                          </p>
                          <pre className="type-body-md text-start text-hisabi-on-surface whitespace-pre-wrap font-sans">
                            {recipe.stepsAr}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  </DetailSection>
                ) : null}
                {Array.isArray(recipe?.ingredients) &&
                recipe.ingredients.length > 0 ? (
                  <DetailSection
                    title={t('recipeIngredientsTitle')}
                    icon={Package}
                    bodyClassName="p-0 sm:p-0"
                  >
                    <div className={LIST_TABLE_SCROLL_WRAP}>
                      <table className={cn(LIST_TABLE_BASE, 'min-w-[480px]')}>
                        <thead>
                          <tr className={LIST_TABLE_HEAD_ROW}>
                            <th className={listTableThClass(undefined, true)}>
                              {t('recipeColStock')}
                            </th>
                            <th className={listTableThClass()}>
                              {t('recipeColQty')}
                            </th>
                            <th className={listTableThClass()}>
                              {t('recipeColUnit')}
                            </th>
                          </tr>
                        </thead>
                        <tbody className={LIST_TABLE_BODY}>
                          {recipe.ingredients.map((ing) => (
                            <tr key={ing.id} className={LIST_TABLE_ROW}>
                              <td className={listTableTdClass(undefined, true)}>
                                {canUpdate && ing.stockItemId ? (
                                  <Link
                                    href={`/stock/items/${ing.stockItemId}`}
                                    className="text-hisabi-primary hover:underline"
                                  >
                                    {stockName(ing.stockItem)}
                                  </Link>
                                ) : (
                                  stockName(ing.stockItem)
                                )}
                              </td>
                              <td
                                className={cn(listTableTdClass(), 'tabular-nums')}
                              >
                                {ing.quantity}
                              </td>
                              <td className={listTableTdClass()}>
                                {stockUnitLabel(
                                  /** @type {import('@/lib/stock/units').StockUnit} */ (
                                    ing.unit
                                  ),
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </DetailSection>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
