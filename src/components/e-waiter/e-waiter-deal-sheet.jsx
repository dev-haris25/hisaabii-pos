'use client'

import { Minus, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { EWaiterOfferPrice } from '@/components/e-waiter/e-waiter-offer-price'
import {
  allowedOptionsForGroup,
  buildDealDraft,
  comboItemsOf,
  defaultOfferItemSelection,
  offerDisplayName,
  priceGuestCart,
} from '@/components/e-waiter/e-waiter-offer-utils'
import { EWaiterSheetScaffold } from '@/components/e-waiter/e-waiter-sheet-scaffold'
import { cn } from '@/lib/utils'

/**
 * Pick variants for a combo deal's items (only the options the deal allows),
 * then add the deal. Deal items have no extras / notes.
 *
 * @param {{
 *   offer: Record<string, unknown>
 *   itemsById: Map<string, Record<string, unknown>>
 *   offers: Array<Record<string, unknown>>
 *   locale: 'ar' | 'en'
 *   maxBoxes: number | null
 *   onClose: () => void
 *   onAdd: (draft: NonNullable<ReturnType<typeof buildDealDraft>>, quantity: number) => void
 * }} props
 */
export function EWaiterDealSheet({
  offer,
  itemsById,
  offers,
  locale,
  maxBoxes,
  onClose,
  onAdd,
}) {
  const t = useTranslations('EWaiter')
  const tErr = useTranslations('AuthErrors')
  const comps = comboItemsOf(offer)

  const [selections, setSelections] = useState(() => {
    /** @type {Record<string, Record<string, string>>} */
    const init = {}
    for (const it of comps) {
      const menuItem = itemsById.get(String(it.menuItemId))
      if (menuItem) init[String(it.id)] = defaultOfferItemSelection(it, menuItem)
    }
    return init
  })
  const [qty, setQty] = useState(1)

  const draft = useMemo(
    () => buildDealDraft(offer, itemsById, selections),
    [offer, itemsById, selections],
  )
  const priced = useMemo(
    () =>
      draft
        ? priceGuestCart({
            lines: [],
            deals: [{ ...draft, quantity: qty }],
            offers,
          })
        : null,
    [draft, qty, offers],
  )

  const atMax = maxBoxes != null && qty >= maxBoxes
  const blocked = !draft || !priced || !priced.ok || (maxBoxes != null && maxBoxes < 1)

  return (
    <EWaiterSheetScaffold onClose={onClose} title={offerDisplayName(offer, locale)}>
      <div className="space-y-hisabi-lg overflow-y-auto px-hisabi-margin-mobile">
        <p className="type-body-sm e-waiter-text-muted">
          {t('offers.dealSheetHint')}
        </p>

        {comps.map((it) => {
          const menuItem = itemsById.get(String(it.menuItemId))
          if (!menuItem) return null
          const groups = /** @type {Array<Record<string, unknown>>} */ (
            menuItem.variantGroups ?? []
          )
          const itemQty = Number(it.quantity) || 1
          const sel = selections[String(it.id)] ?? {}
          return (
            <section key={String(it.id)} className="space-y-hisabi-sm">
              <p className="type-label-md font-semibold">
                {itemQty > 1
                  ? t('offers.componentQty', {
                      qty: itemQty,
                      name: offerDisplayName(menuItem, locale),
                    })
                  : offerDisplayName(menuItem, locale)}
              </p>
              {groups.map((group) => {
                const opts = allowedOptionsForGroup(it, group)
                if (opts.length === 0) return null
                if (opts.length === 1) {
                  return (
                    <p
                      key={String(group.id)}
                      className="type-body-sm e-waiter-text-muted"
                    >
                      {offerDisplayName(group, locale)}:{' '}
                      {offerDisplayName(opts[0], locale)}
                    </p>
                  )
                }
                return (
                  <fieldset key={String(group.id)} className="space-y-hisabi-xs">
                    <legend className="type-body-sm e-waiter-text-muted font-semibold">
                      {offerDisplayName(group, locale)}
                    </legend>
                    <div className="flex flex-col gap-hisabi-xs">
                      {opts.map((opt) => {
                        const selected = sel[String(group.id)] === opt.id
                        return (
                          <button
                            key={String(opt.id)}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setSelections((prev) => ({
                                ...prev,
                                [String(it.id)]: {
                                  ...(prev[String(it.id)] ?? {}),
                                  [String(group.id)]: String(opt.id),
                                },
                              }))
                            }
                            className={cn(
                              'flex min-h-[var(--e-waiter-tap)] items-center rounded-xl border px-hisabi-md text-start transition-colors',
                              selected
                                ? 'e-waiter-chip-active border-transparent'
                                : 'e-waiter-border e-waiter-surface',
                            )}
                          >
                            <span className="type-body-md">
                              {offerDisplayName(opt, locale)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                )
              })}
            </section>
          )
        })}

        <div className="flex items-center justify-between gap-hisabi-md">
          <p className="type-label-md font-semibold">{t('quantity')}</p>
          <div className="flex items-center gap-hisabi-sm">
            <button
              type="button"
              className="e-waiter-tap e-waiter-chip inline-flex items-center justify-center rounded-full"
              aria-label={t('decreaseQty')}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="type-label-md min-w-8 text-center font-bold">
              {qty}
            </span>
            <button
              type="button"
              disabled={atMax}
              className="e-waiter-tap e-waiter-btn-primary inline-flex items-center justify-center rounded-full disabled:opacity-40"
              aria-label={t('increaseQty')}
              onClick={() => setQty((q) => q + 1)}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        {maxBoxes != null ? (
          <p className="type-body-sm e-waiter-text-muted">
            {maxBoxes < 1
              ? t('offers.dealMaxInCart')
              : t('offers.dealMaxHint', { max: maxBoxes })}
          </p>
        ) : null}
        {priced && !priced.ok && priced.error ? (
          <p className="type-body-sm text-hisabi-error" role="alert">
            {tErr(String(priced.error.code))}
          </p>
        ) : null}
      </div>

      <div className="mt-hisabi-md border-t e-waiter-border px-hisabi-margin-mobile pt-hisabi-md">
        <button
          type="button"
          disabled={blocked}
          onClick={() => {
            if (draft && !blocked) onAdd(draft, qty)
          }}
          className="e-waiter-btn-primary type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-between gap-hisabi-md rounded-2xl px-hisabi-lg font-bold disabled:opacity-40"
        >
          <span>{t('addToCart')}</span>
          {priced?.ok ? (
            <EWaiterOfferPrice
              original={priced.grossIncl}
              discounted={priced.netIncl}
              locale={locale}
              as="span"
              priceClassName="type-label-md font-bold"
              strikeClassName="type-body-sm line-through opacity-75"
              className="justify-end"
            />
          ) : null}
        </button>
      </div>
    </EWaiterSheetScaffold>
  )
}
