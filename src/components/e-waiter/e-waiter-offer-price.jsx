'use client'

import { useTranslations } from 'next-intl'

import { parseMoney } from '@/lib/invoices/invoice-compute-totals'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'

/**
 * VAT-inclusive price; when an offer lowers it, the original is shown struck
 * through before the offer price (white-label E-Waiter colours).
 *
 * @param {{
 *   original: string | number
 *   discounted?: string | number | null
 *   locale: 'ar' | 'en'
 *   className?: string
 *   priceClassName?: string
 *   strikeClassName?: string
 *   as?: 'p' | 'span'
 * }} props
 */
export function EWaiterOfferPrice({
  original,
  discounted = null,
  locale,
  className,
  priceClassName = 'type-label-md e-waiter-primary-text font-bold',
  strikeClassName = 'type-body-sm e-waiter-text-muted line-through',
  as: Tag = 'p',
}) {
  const t = useTranslations('EWaiter')
  const hasDiscount =
    discounted != null &&
    parseMoney(String(discounted)) + 0.004 < parseMoney(String(original))

  if (!hasDiscount) {
    return (
      <Tag className={cn(priceClassName, className)}>
        {formatSarAmount(original, locale)}
      </Tag>
    )
  }

  return (
    <Tag
      className={cn(
        'inline-flex flex-wrap items-baseline gap-x-hisabi-xs',
        className,
      )}
    >
      <span className="sr-only">
        {t('offers.priceWasNow', {
          was: formatSarAmount(original, locale),
          now: formatSarAmount(discounted, locale),
        })}
      </span>
      <span className={strikeClassName} aria-hidden>
        {formatSarAmount(original, locale)}
      </span>
      <span className={priceClassName} aria-hidden>
        {formatSarAmount(discounted, locale)}
      </span>
    </Tag>
  )
}
