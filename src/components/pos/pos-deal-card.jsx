'use client'

import { useTranslations } from 'next-intl'

import { parseMoney } from '@/lib/invoices/invoice-compute-totals'
import { formatSarAmount } from '@/lib/settings/format-helpers'

/**
 * Deal (COMBO offer) in the POS product grid — same look as a menu item card.
 *
 * @param {{
 *   offer: Record<string, any>
 *   normalTotal: string
 *   locale: string
 *   onAdd: () => void
 * }} props
 */
export function PosDealCard({ offer, normalTotal, locale, onAdd }) {
  const t = useTranslations('Pos')
  const name =
    locale === 'ar'
      ? String(offer.nameAr ?? '')
      : String(offer.nameEn?.trim() || offer.nameAr || '')
  const arabicUnderEn =
    locale !== 'ar' && offer.nameEn?.trim() ? String(offer.nameAr ?? '').trim() : ''
  const showWas = parseMoney(normalTotal) > parseMoney(offer.comboPrice)

  return (
    <button
      type="button"
      onClick={onAdd}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest text-start shadow-sm transition-all hover:border-hisabi-primary/40 hover:shadow-md active:scale-[0.98]"
    >
      <div className="bg-hisabi-surface-container-high text-hisabi-primary relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden text-lg font-bold">
        {typeof offer.imageUrl === 'string' && offer.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated offer image
          <img
            src={offer.imageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          name.slice(0, 2).toUpperCase()
        )}
        <span className="hisabi-pos-offer-badge absolute end-2 top-2 z-[1]">
          {t('offers.dealBadge')}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-hisabi-md">
        <span className="type-body-md line-clamp-2 pb-0.5 font-bold leading-normal text-hisabi-on-surface">
          {name}
        </span>
        {arabicUnderEn ? (
          <span className="type-body-sm line-clamp-2 text-start text-hisabi-on-surface-variant">
            {arabicUnderEn}
          </span>
        ) : null}
        <span dir="ltr" className="type-body-sm flex flex-wrap items-baseline gap-x-hisabi-xs">
          {showWas ? (
            <span className="hisabi-pos-price-was">
              <span className="sr-only">{t('offers.wasPrice')} </span>
              {formatSarAmount(normalTotal, locale)}
            </span>
          ) : null}
          <span className="font-medium text-hisabi-teal">
            {formatSarAmount(offer.comboPrice, locale)}
          </span>
        </span>
      </div>
    </button>
  )
}
