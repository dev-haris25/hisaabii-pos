'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { HisabiOverlayModal } from '@/components/hisabi-overlay-modal'
import {
  allowedGroupOptions,
  comboItemsOf,
  componentNeedsChoice,
  defaultComponentSelection,
} from '@/components/pos/pos-deal-utils'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'

/**
 * Variant picker for a COMBO deal: only components that need a choice are
 * listed, and only the options the offer allows are shown. Mount it only while
 * open (state is initialised from the offer on mount).
 *
 * @param {{
 *   offer: Record<string, any>
 *   itemsById: Map<string, Record<string, any>>
 *   locale: string
 *   onClose: () => void
 *   onConfirm: (selections: Record<string, Record<string, string>>) => void
 * }} props
 */
export function PosDealConfigurator({
  offer,
  itemsById,
  locale,
  onClose,
  onConfirm,
}) {
  const t = useTranslations('Pos')
  const isAr = locale === 'ar'
  const components = useMemo(() => comboItemsOf(offer), [offer])
  const [selections, setSelections] = useState(
    /** @type {Record<string, Record<string, string>>} */ (() => {
      /** @type {Record<string, Record<string, string>>} */
      const init = {}
      for (const oi of comboItemsOf(offer)) {
        init[oi.id] = defaultComponentSelection(oi, itemsById.get(oi.menuItemId))
      }
      return init
    }),
  )

  /** English UI: `English/Arabic`. Arabic UI: Arabic only. */
  function bilingualName(row) {
    const english = String(row?.nameEn ?? '').trim()
    const arabic = String(row?.nameAr ?? '').trim()
    if (isAr) return arabic || english
    if (english && arabic && english !== arabic) return `${english}/${arabic}`
    return english || arabic
  }

  const dealName = isAr
    ? String(offer.nameAr ?? '')
    : String(offer.nameEn || offer.nameAr || '')

  return (
    <HisabiOverlayModal
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={dealName}
      description={t('offers.dealPickerHint')}
      closeLabel={t('modalClose')}
      footer={
        <AuthSubmitButton type="button" onClick={() => onConfirm(selections)}>
          {t('addToCart')}
        </AuthSubmitButton>
      }
    >
      <p dir="ltr" className="type-label-md mb-hisabi-md font-bold text-hisabi-teal">
        {formatSarAmount(offer.comboPrice, locale)}
      </p>
      <div className="space-y-hisabi-lg">
        {components.map((oi) => {
          const item = itemsById.get(oi.menuItemId)
          if (!item || !componentNeedsChoice(oi, item)) return null
          const quantity = Math.max(1, Math.round(Number(oi.quantity)) || 1)
          const itemName = bilingualName(item)
          return (
            <section
              key={oi.id}
              className="space-y-hisabi-sm rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface px-hisabi-md py-hisabi-md"
            >
              <p className="type-label-md font-bold text-hisabi-primary">
                {quantity > 1
                  ? t('offers.dealItemQty', { qty: quantity, name: itemName })
                  : itemName}
              </p>
              {(item.variantGroups ?? []).map((group) => {
                const options = allowedGroupOptions(oi, group)
                if (options.length <= 1) return null
                return (
                  <div key={group.id} className="space-y-hisabi-xs">
                    <p className="type-label-sm font-bold text-hisabi-on-surface">
                      {bilingualName(group)}
                    </p>
                    <div className="grid grid-cols-2 gap-hisabi-sm">
                      {options.map((option) => {
                        const selected = selections[oi.id]?.[group.id] === option.id
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setSelections((prev) => ({
                                ...prev,
                                [oi.id]: { ...(prev[oi.id] ?? {}), [group.id]: option.id },
                              }))
                            }
                            className={cn(
                              'type-label-md flex min-h-hisabi-btn w-full cursor-pointer items-center justify-center rounded-xl px-hisabi-lg py-hisabi-btn text-center font-bold transition-colors active:scale-[0.98]',
                              selected
                                ? 'bg-hisabi-primary-container text-white'
                                : 'border border-hisabi-outline-variant/50 bg-white text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                            )}
                          >
                            {bilingualName(option)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </HisabiOverlayModal>
  )
}
