'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { HisabiOverlayModal } from '@/components/hisabi-overlay-modal'
import {
  computeUnitPriceFromItem,
  defaultVariantSelection,
  menuItemHasCustomizations,
  menuItemHasVariantGroups,
  optionIdsFromSelection,
} from '@/lib/menu/item-modifiers'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'

/**
 * @param {{
 *   open: boolean
 *   item: Record<string, unknown> | null
 *   locale: string
 *   mode?: 'add' | 'edit'
 *   initialSelection?: Record<string, string>
 *   initialCustomizationIds?: string[]
 *   onClose: () => void
 *   onConfirm: (payload: {
 *     variantOptionIds: string[]
 *     customizationIds: string[]
 *     variantSelection: Record<string, string>
 *     unitPrice: string
 *   }) => void
 * }} props
 */
export function PosItemModifiersFlow({
  open,
  item,
  locale,
  mode = 'add',
  initialSelection,
  initialCustomizationIds,
  onClose,
  onConfirm,
}) {
  const t = useTranslations('Pos')
  const hasVariants = menuItemHasVariantGroups(item)
  const hasCustoms = menuItemHasCustomizations(item)
  const [step, setStep] = useState(
    /** @type {'variant' | 'customize'} */ (
      hasVariants ? 'variant' : 'customize'
    ),
  )
  const [selection, setSelection] = useState(
    /** @type {Record<string, string>} */ ({}),
  )
  const [customIds, setCustomIds] = useState(/** @type {string[]} */ ([]))

  useEffect(() => {
    if (!open || !item) return
    setSelection(initialSelection ?? defaultVariantSelection(item))
    setCustomIds(initialCustomizationIds ?? [])
    setStep(menuItemHasVariantGroups(item) ? 'variant' : 'customize')
  }, [open, item, initialSelection, initialCustomizationIds])

  const unitPrice = useMemo(() => {
    if (!item) return '0.00'
    return computeUnitPriceFromItem(
      item,
      optionIdsFromSelection(selection),
      customIds,
    )
  }, [item, selection, customIds])

  if (!open || !item) return null

  const isAr = locale === 'ar'
  const itemName = isAr
    ? String(item.nameAr ?? '')
    : String(item.nameEn || item.nameAr || '')
  const isEdit = mode === 'edit'
  const showCustomizeOnVariant = hasVariants && hasCustoms
  const variantOpen = hasVariants && step === 'variant'
  const customizeOpen = hasCustoms && (!hasVariants || step === 'customize')

  function confirmCart() {
    onConfirm({
      variantOptionIds: optionIdsFromSelection(selection),
      customizationIds: customIds,
      variantSelection: selection,
      unitPrice,
    })
  }

  function groupName(group) {
    return isAr ? group.nameAr : group.nameEn?.trim() || group.nameAr
  }

  function optionName(option) {
    return isAr ? option.nameAr : option.nameEn?.trim() || option.nameAr
  }

  return (
    <>
      <HisabiOverlayModal
        open={variantOpen}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
        title={itemName}
        description={t('variantModalHint')}
        closeLabel={t('modalClose')}
        footer={
          <div className="flex flex-col gap-hisabi-sm">
            {showCustomizeOnVariant ? (
              <AuthSubmitButton
                type="button"
                variant="secondary"
                onClick={() => setStep('customize')}
              >
                {t('customize')}
              </AuthSubmitButton>
            ) : null}
            <AuthSubmitButton type="button" onClick={confirmCart}>
              {isEdit ? t('updateCart') : t('addToCart')}
            </AuthSubmitButton>
          </div>
        }
      >
        <p dir="ltr" className="type-label-md mb-hisabi-md font-bold text-hisabi-teal">
          {formatSarAmount(unitPrice, locale)}
        </p>
        <div className="space-y-hisabi-lg">
          {(item.variantGroups ?? []).map((group) => (
            <div key={group.id} className="space-y-hisabi-xs">
              <p className="type-label-md font-bold text-hisabi-on-surface">
                {groupName(group)}
              </p>
              <div className="flex flex-wrap gap-hisabi-xs">
                {(group.options ?? []).map((option) => {
                  const selected = selection[group.id] === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        setSelection((prev) => ({
                          ...prev,
                          [group.id]: option.id,
                        }))
                      }
                      className={cn(
                        'type-label-sm cursor-pointer rounded-lg px-hisabi-md py-2 font-bold transition-colors',
                        selected
                          ? 'bg-hisabi-primary-container text-white'
                          : 'border border-hisabi-outline-variant/50 bg-white text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                      )}
                    >
                      {optionName(option)}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </HisabiOverlayModal>

      <HisabiOverlayModal
        open={customizeOpen}
        onOpenChange={(next) => {
          if (!next) {
            if (hasVariants) setStep('variant')
            else onClose()
          }
        }}
        title={t('customizeTitle')}
        description={itemName}
        closeLabel={t('modalClose')}
        footer={
          <div className="flex flex-col gap-hisabi-sm">
            {hasVariants ? (
              <AuthSubmitButton
                type="button"
                variant="secondary"
                onClick={() => setStep('variant')}
              >
                {t('backToVariants')}
              </AuthSubmitButton>
            ) : null}
            <AuthSubmitButton type="button" onClick={confirmCart}>
              {isEdit ? t('updateCart') : t('addToCart')}
            </AuthSubmitButton>
          </div>
        }
      >
        <p dir="ltr" className="type-label-md mb-hisabi-md font-bold text-hisabi-teal">
          {formatSarAmount(unitPrice, locale)}
        </p>
        <ul className="space-y-hisabi-sm">
          {(item.customizations ?? []).map((row) => {
            const checked = customIds.includes(row.id)
            return (
              <li key={row.id}>
                <label className="flex cursor-pointer items-center gap-hisabi-sm rounded-lg border border-hisabi-outline-variant/30 bg-hisabi-surface px-hisabi-md py-hisabi-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setCustomIds((prev) =>
                        prev.includes(row.id)
                          ? prev.filter((id) => id !== row.id)
                          : [...prev, row.id],
                      )
                    }}
                    className="size-4 accent-hisabi-primary"
                  />
                  <span className="type-body-md min-w-0 flex-1 text-hisabi-on-surface">
                    {optionName(row)}
                  </span>
                  <span dir="ltr" className="type-body-sm text-hisabi-on-surface-variant">
                    +{formatSarAmount(row.priceChange ?? '0', locale)}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </HisabiOverlayModal>
    </>
  )
}
