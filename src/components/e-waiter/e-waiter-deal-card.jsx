'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EWaiterOfferPrice } from '@/components/e-waiter/e-waiter-offer-price'
import {
  comboItemsOf,
  offerDisplayName,
} from '@/components/e-waiter/e-waiter-offer-utils'

/**
 * Featured deal as a product card (same look as menu item cards).
 *
 * @param {{
 *   offer: Record<string, unknown>
 *   locale: 'ar' | 'en'
 *   price: { grossIncl: string, netIncl: string }
 *   disabled: boolean
 *   onActivate: (offer: Record<string, unknown>) => void
 * }} props
 */
export function EWaiterDealCard({ offer, locale, price, disabled, onActivate }) {
  const t = useTranslations('EWaiter')
  const name = offerDisplayName(offer, locale)
  const components = comboItemsOf(offer)
    .map((it) => {
      const label = offerDisplayName(it, locale)
      const qty = Number(it.quantity) || 1
      return qty > 1 ? t('offers.componentQty', { qty, name: label }) : label
    })
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="e-waiter-surface e-waiter-fade-in e-waiter-menu-card rounded-xl border e-waiter-border p-hisabi-md shadow-sm">
      {offer.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- public offer image
        <img
          src={String(offer.imageUrl)}
          alt={name}
          className="e-waiter-thumb shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div
          className="e-waiter-thumb e-waiter-chip flex shrink-0 items-center justify-center rounded-lg type-label-sm"
          aria-hidden
        >
          {name.slice(0, 1)}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-hisabi-xs">
        <button
          type="button"
          className="text-start"
          onClick={() => onActivate(offer)}
        >
          <span className="type-label-sm e-waiter-btn-accent mb-hisabi-xs inline-flex rounded-full px-hisabi-sm font-semibold">
            {t('offers.dealBadge')}
          </span>
          <p className="type-label-md font-semibold leading-snug">{name}</p>
          {components ? (
            <p className="type-body-sm e-waiter-text-muted mt-0.5">
              {components}
            </p>
          ) : null}
        </button>
        <div className="mt-auto flex items-center justify-between gap-hisabi-sm pt-hisabi-xs">
          <EWaiterOfferPrice
            original={price.grossIncl}
            discounted={price.netIncl}
            locale={locale}
          />
          <button
            type="button"
            disabled={disabled}
            className="e-waiter-btn-primary e-waiter-tap inline-flex shrink-0 items-center justify-center rounded-full shadow-sm active:scale-[0.96] disabled:opacity-40"
            aria-label={t('addItem', { name })}
            onClick={() => onActivate(offer)}
          >
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  )
}
