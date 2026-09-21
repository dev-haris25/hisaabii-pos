'use client'

import { Clock3, Package, Sparkles, Trash2, UtensilsCrossed } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { PageBackButton } from '@/components/shared/page-back-button'
import { SettingsSection } from '@/components/settings/settings-page-shell'
import { WasteSeverityBadge } from '@/components/stock/waste-severity-badge'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { displayedKitchenUsedQty } from '@/lib/stock/kitchen-waste-ai-result'
import { stockUnitLabel } from '@/lib/stock/units'
import { cn } from '@/lib/utils'

function formatWhen(iso, locale) {
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

function itemLabel(stock, locale) {
  if (!stock) return '—'
  if (locale === 'ar') return stock.nameAr || stock.nameEn || '—'
  return stock.nameEn || stock.nameAr || '—'
}

function recipeLabel(row, locale) {
  if (locale === 'ar') return row.menuItemNameAr || row.menuItemNameEn || '—'
  return row.menuItemNameEn || row.menuItemNameAr || '—'
}

/**
 * Dashboard-style KPI card (matches `dashboard-client.jsx` StatCard).
 * @param {{
 *   label: string
 *   value: string
 *   hint?: string | null
 *   hintPositive?: boolean | null
 *   icon: import('react').ComponentType<{ className?: string }>
 *   iconClassName?: string
 *   footer?: string | null
 * }} props
 */
function StatCard({
  label,
  value,
  hint,
  hintPositive,
  icon: Icon,
  iconClassName,
  footer,
}) {
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
              hintPositive == null &&
                'bg-hisabi-surface-container text-hisabi-on-surface-variant',
            )}
          >
            {hint}
          </span>
        ) : null}
      </div>
      <p className="type-headline-md text-hisabi-on-surface mb-1 font-bold tabular-nums" dir="ltr">
        {value}
      </p>
      <p className="type-body-sm text-hisabi-on-surface-variant font-medium">{label}</p>
      {footer ? (
        <p className="type-body-sm mt-hisabi-xs text-hisabi-on-surface-variant">{footer}</p>
      ) : null}
    </div>
  )
}

/**
 * @param {{ allocation: Record<string, unknown> }} props
 */
export function StockWastageDetailView({ allocation }) {
  const t = useTranslations('Stock')
  const locale = useLocale()
  const stock = /** @type {Record<string, unknown> | null} */ (
    allocation.stockItem
  )
  const unit = stockUnitLabel(/** @type {string | undefined} */ (stock?.unit))
  const isBulk = allocation.isBulk === true
  const stats = /** @type {Record<string, number | null>} */ (
    allocation.stats ?? {}
  )
  const recipes = Array.isArray(allocation.recipes) ? allocation.recipes : []
  const usedQty = displayedKitchenUsedQty(allocation)
  const wasteIsAi = allocation.wasteIsAiEstimate === true
  const severity =
    typeof allocation.wasteSeverity === 'string'
      ? allocation.wasteSeverity
      : null
  const analysis =
    typeof allocation.aiAnalysis === 'string' && allocation.aiAnalysis.trim()
      ? allocation.aiAnalysis.trim()
      : ''
  const severityLabels = {
    low: t('wastageSeverityLow'),
    bearable: t('wastageSeverityBearable'),
    high: t('wastageSeverityHigh'),
  }

  return (
    <div className="mx-auto max-w-hisabi-container pb-hisabi-xxl">
      <PageBackButton href="/stock/wastage" label={t('backToWastage')} />

      <div className="mb-hisabi-xl space-y-2">
        <h1 className="type-headline-xl text-hisabi-on-surface tracking-tight">
          {itemLabel(stock, locale)}
        </h1>
        <p className="type-body-md max-w-2xl text-hisabi-on-surface-variant">
          {t('wastageDetailSubtitle')}
        </p>
        {isBulk ? (
          <p className="type-body-sm max-w-2xl text-hisabi-on-surface-variant">
            {t('wastageBulkAiDisclaimer')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {isBulk ? (
            <span className="type-label-sm rounded-md bg-hisabi-surface-container px-2 py-0.5 text-hisabi-on-surface-variant">
              {t('bulkBadge')}
            </span>
          ) : null}
          <WasteSeverityBadge severity={severity} labels={severityLabels} />
          {stats.durationDays != null ? (
            <span className="type-label-sm rounded-md bg-hisabi-primary/10 px-2 py-0.5 font-semibold text-hisabi-primary">
              {t('wastageStatDaysOpen', { days: Number(stats.durationDays) })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-hisabi-xl">
        <div className="grid grid-cols-1 gap-hisabi-md min-[480px]:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Package}
            iconClassName="bg-hisabi-primary-container/15 text-hisabi-primary"
            label={t('kitchenColIssued')}
            value={`${String(allocation.quantityIssued)} ${unit}`}
          />
          <StatCard
            icon={UtensilsCrossed}
            iconClassName="bg-hisabi-teal/20 text-hisabi-primary"
            label={t('kitchenColUsed')}
            value={`${usedQty} ${unit}`}
            hint={
              isBulk && wasteIsAi
                ? t('wastageUsedAiHint')
                : stats.usePercent != null
                  ? t('wastageStatUsePercent', {
                      percent: String(stats.usePercent),
                    })
                  : null
            }
            hintPositive={
              isBulk && wasteIsAi
                ? null
                : stats.usePercent != null
                  ? true
                  : null
            }
          />
          <StatCard
            icon={Trash2}
            iconClassName="bg-red-50 text-red-700"
            label={t('wastageColWaste')}
            value={`${String(allocation.quantityWaste ?? '0')} ${unit}`}
            hint={
              wasteIsAi
                ? t('wastageWasteAiHint')
                : stats.wastePercent != null
                  ? t('wastageStatWastePercent', {
                      percent: String(stats.wastePercent),
                    })
                  : null
            }
            hintPositive={
              wasteIsAi ? null : stats.wastePercent != null ? false : null
            }
          />
          <StatCard
            icon={Clock3}
            iconClassName="bg-hisabi-secondary-container/40 text-hisabi-secondary"
            label={t('wastageStatPeriod')}
            value={
              stats.durationDays != null
                ? t('wastageStatDaysOpen', {
                    days: Number(stats.durationDays),
                  })
                : '—'
            }
            footer={`${formatWhen(/** @type {string} */ (allocation.openedAt), locale)} → ${formatWhen(/** @type {string | null} */ (allocation.closedAt), locale)}`}
          />
        </div>

        <SettingsSection title={t('wastageSectionAnalysis')} icon={Sparkles}>
          {analysis ? (
            <p className="type-body-md whitespace-pre-wrap text-hisabi-on-surface">
              {analysis}
            </p>
          ) : (
            <p className="type-body-md text-hisabi-on-surface-variant">
              {t('wastageAnalysisEmpty')}
            </p>
          )}
        </SettingsSection>

        <SettingsSection title={t('wastageSectionRecipes')} icon={UtensilsCrossed}>
          {recipes.length === 0 ? (
            <p className="type-body-md text-hisabi-on-surface-variant">
              {t('wastageRecipesEmpty')}
            </p>
          ) : (
            <>
              <p className="type-body-sm mb-hisabi-md text-hisabi-on-surface-variant">
                {t('wastageRecipesSummary', {
                  recipes: Number(stats.recipeCount ?? recipes.length),
                  servings: Number(stats.totalServings ?? 0),
                  tickets: Number(stats.totalTickets ?? 0),
                })}
              </p>
              <div className={LIST_TABLE_SCROLL_WRAP}>
                <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
                  <thead>
                    <tr className={LIST_TABLE_HEAD_ROW}>
                      <th className={listTableThClass(undefined, true)}>
                        {t('wastageColRecipe')}
                      </th>
                      <th className={listTableThClass()}>
                        {t('wastageColServings')}
                      </th>
                      <th className={listTableThClass()}>
                        {t('wastageColStockUsed')}
                      </th>
                      <th className={listTableThClass()}>
                        {t('wastageColTickets')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className={LIST_TABLE_BODY}>
                    {recipes.map((row) => (
                      <tr
                        key={`${row.menuItemId ?? row.menuItemNameAr}-${row.quantityUsed}`}
                        className={LIST_TABLE_ROW}
                      >
                        <td className={listTableTdClass(undefined, true)}>
                          {recipeLabel(row, locale)}
                        </td>
                        <td className={cn(listTableTdClass(), 'tabular-nums')}>
                          {Number(row.servings)}
                        </td>
                        <td className={cn(listTableTdClass(), 'tabular-nums')}>
                          {String(row.quantityUsed)} {unit}
                        </td>
                        <td className={cn(listTableTdClass(), 'tabular-nums')}>
                          {Number(row.ticketCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SettingsSection>
      </div>
    </div>
  )
}
