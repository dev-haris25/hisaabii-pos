'use client'

import { Minus, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { LineModifierSummary } from '@/components/pos/line-modifier-summary'
import { parseMoney } from '@/lib/invoices/invoice-compute-totals'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'

/**
 * One deal (COMBO offer) in the POS cart: deal name, its component items with
 * the chosen variants, qty +/- and remove. No extras / line note.
 *
 * @param {{
 *   entry: import('@/components/pos/pos-deal-utils').DealEntry
 *   locale: string
 *   lineTotal: string
 *   normalLineTotal: string
 *   canIncrease: boolean
 *   problem?: string | null
 *   onDecrease: () => void
 *   onIncrease: () => void
 *   onRemove: () => void
 * }} props
 */
export function PosDealCartEntry({
  entry,
  locale,
  lineTotal,
  normalLineTotal,
  canIncrease,
  problem = null,
  onDecrease,
  onIncrease,
  onRemove,
}) {
  const t = useTranslations('Pos')
  const isAr = locale === 'ar'
  const name = isAr ? entry.nameAr : entry.nameEn?.trim() || entry.nameAr
  const showWas = parseMoney(normalLineTotal) > parseMoney(lineTotal)

  return (
    <div
      className={cn(
        'flex items-stretch gap-hisabi-sm rounded-lg bg-hisabi-surface-container-low/60 px-hisabi-sm py-hisabi-sm',
        problem && 'ring-1 ring-hisabi-error/60',
      )}
    >
      <div className="bg-hisabi-surface-container-high text-hisabi-primary relative flex w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold self-stretch min-h-[4.5rem]">
        {entry.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated offer image
          <img
            src={entry.imageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          String(name ?? '').slice(0, 2).toUpperCase()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-hisabi-xs">
          <span className="type-label-md line-clamp-2 font-bold text-hisabi-on-surface">
            {name}
          </span>
          <span className="hisabi-pos-offer-badge">{t('offers.dealBadge')}</span>
        </div>
        {!isAr && entry.nameEn?.trim() && entry.nameAr ? (
          <span className="type-body-sm mt-0.5 line-clamp-2 block text-start text-hisabi-on-surface-variant">
            {entry.nameAr}
          </span>
        ) : null}
        <ul
          aria-label={t('offers.dealItemsAria')}
          className="hisabi-pos-deal-components mt-hisabi-xs space-y-0.5"
        >
          {entry.components.map((comp) => {
            const compName = isAr ? comp.nameAr : comp.nameEn?.trim() || comp.nameAr
            return (
              <li key={comp.offerItemId}>
                <p className="type-body-sm font-medium text-hisabi-on-surface">
                  {comp.quantity > 1
                    ? t('offers.dealItemQty', { qty: comp.quantity, name: compName })
                    : compName}
                </p>
                <LineModifierSummary snapshot={comp.modifiersSnapshot} locale={locale} />
              </li>
            )
          })}
        </ul>
        <p dir="ltr" className="type-body-sm text-hisabi-on-surface-variant">
          {formatSarAmount(entry.comboPrice, locale)} × {entry.quantity}
        </p>
        {problem ? (
          <p className="type-body-sm text-hisabi-error" role="alert">
            {problem}
          </p>
        ) : null}
        <div className="mt-hisabi-xs flex items-center gap-1">
          <button
            type="button"
            aria-label={t('qtyDecrease')}
            onClick={onDecrease}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hisabi-outline-variant/50 bg-white text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <span dir="ltr" className="type-label-md w-8 text-center font-bold">
            {entry.quantity}
          </span>
          <button
            type="button"
            aria-label={t('qtyIncrease')}
            onClick={onIncrease}
            disabled={!canIncrease}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hisabi-outline-variant/50 bg-white text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
        <div className="flex flex-col items-end">
          {showWas ? (
            <span dir="ltr" className="type-body-sm hisabi-pos-price-was">
              <span className="sr-only">{t('offers.wasPrice')} </span>
              {formatSarAmount(normalLineTotal, locale)}
            </span>
          ) : null}
          <span dir="ltr" className="type-label-md font-bold text-hisabi-on-surface">
            {formatSarAmount(lineTotal, locale)}
          </span>
        </div>
        <button
          type="button"
          aria-label={t('removeLine')}
          onClick={onRemove}
          className="text-hisabi-error hover:bg-hisabi-error/8 flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
