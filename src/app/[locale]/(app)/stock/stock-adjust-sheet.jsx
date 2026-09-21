'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import {
  HISABI_SHEET_FOOTER_CANCEL_CLASS,
  HISABI_SHEET_FOOTER_SAVE_CLASS,
  HisabiSheet,
} from '@/components/shared/hisabi-sheet'
import { RequiredMark } from '@/components/ui/required-mark'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { stockUnitLabel } from '@/lib/stock/units'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

const fieldInvalidClass =
  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   item: {
 *     id: string
 *     nameAr: string
 *     nameEn: string | null
 *     unit: string
 *     unitLabel?: string
 *     quantityOnHand: string
 *     unitCost?: string | null
 *   } | null
 *   displayName: string
 *   onSuccess?: () => void
 * }} props
 */
export function StockAdjustSheet({
  open,
  onOpenChange,
  item,
  displayName,
  onSuccess,
}) {
  const t = useTranslations('Stock')
  const tErr = useTranslations('AuthErrors')
  const queryClient = useQueryClient()

  const [type, setType] = useState(
    /** @type {'purchase' | 'adjust_in' | 'adjust_out'} */ ('purchase'),
  )
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [fieldErrors, setFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  )
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open || !item) return
    setType('purchase')
    setQuantity('')
    setUnitCost(
      typeof item.unitCost === 'string' && item.unitCost.trim()
        ? item.unitCost.trim()
        : '',
    )
    setReason('')
    setNote('')
    setFieldErrors({})
    setFormError('')
  }, [open, item])

  const mutation = useMutation({
    mutationFn: () => {
      /** @type {Record<string, unknown>} */
      const body = {
        type,
        quantity: quantity.trim(),
        reason: reason.trim() || null,
        note: note.trim() || null,
      }
      if (type === 'purchase' && unitCost.trim()) {
        body.unitCost = unitCost.trim()
      }
      return authPost(`/stock/items/${item?.id}/movements`, body)
    },
    onSuccess: () => {
      toast.success(t('movementRecorded'))
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-count'] })
      onOpenChange(false)
      onSuccess?.()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(
        code === 'INSUFFICIENT_STOCK'
          ? t('errorInsufficientStock')
          : code
            ? tErr(code)
            : tErr('generic'),
      )
    },
  })

  const unitLabel = item
    ? item.unitLabel || stockUnitLabel(/** @type {any} */ (item.unit))
    : ''

  function validate() {
    /** @type {Record<string, string>} */
    const next = {}
    if (
      !quantity.trim() ||
      !/^\d+(\.\d+)?$/.test(quantity.trim()) ||
      Number(quantity) <= 0
    ) {
      next.quantity = t('errorQtyInvalid')
    }
    if (type === 'adjust_out' && !reason.trim()) {
      next.reason = t('errorReasonRequired')
    }
    if (
      type === 'purchase' &&
      unitCost.trim() &&
      !/^\d+(\.\d{1,4})?$/.test(unitCost.trim())
    ) {
      next.unitCost = t('errorCostInvalid')
    }
    setFieldErrors(next)
    setFormError('')
    return Object.keys(next).length === 0
  }

  return (
    <HisabiSheet
      open={open && Boolean(item)}
      onOpenChange={onOpenChange}
      title={t('adjustTitle')}
      description={
        item
          ? `${displayName} · ${t('onHandNow', {
              qty: item.quantityOnHand,
              unit: unitLabel,
            })}`
          : undefined
      }
      closeLabel={t('closeSheet')}
      footer={
        <>
          <button
            type="button"
            className={HISABI_SHEET_FOOTER_CANCEL_CLASS}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="submit"
            form="stock-adjust-form"
            pending={mutation.isPending}
            className={HISABI_SHEET_FOOTER_SAVE_CLASS}
          >
            {t('recordMovement')}
          </AuthSubmitButton>
        </>
      }
    >
      <form
        id="stock-adjust-form"
        className="flex flex-col gap-hisabi-md"
        onSubmit={(e) => {
          e.preventDefault()
          if (!validate()) return
          mutation.mutate()
        }}
      >
        <label className="flex flex-col gap-hisabi-xs">
          <span className="type-label-md text-hisabi-on-surface">
            {t('fieldMovementType')}
            <RequiredMark />
          </span>
          <select
            className={fieldClass}
            value={type}
            onChange={(e) => {
              const next =
                /** @type {'purchase' | 'adjust_in' | 'adjust_out'} */ (
                  e.target.value
                )
              setType(next)
              if (
                next === 'purchase' &&
                !unitCost.trim() &&
                typeof item?.unitCost === 'string' &&
                item.unitCost.trim()
              ) {
                setUnitCost(item.unitCost.trim())
              }
            }}
          >
            <option value="purchase">{t('movementTypePurchase')}</option>
            <option value="adjust_in">{t('movementTypeAdjustIn')}</option>
            <option value="adjust_out">{t('movementTypeAdjustOut')}</option>
          </select>
        </label>

        <label className="flex flex-col gap-hisabi-xs">
          <span className="type-label-md text-hisabi-on-surface">
            {t('fieldMovementQty')} ({unitLabel})
            <RequiredMark />
          </span>
          <input
            className={cn(fieldClass, fieldErrors.quantity && fieldInvalidClass)}
            inputMode="decimal"
            value={quantity}
            placeholder={t('fieldMovementQtyPlaceholder')}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {fieldErrors.quantity ? (
            <span className="type-body-sm text-hisabi-error">
              {fieldErrors.quantity}
            </span>
          ) : null}
        </label>

        {type === 'purchase' ? (
          <label className="flex flex-col gap-hisabi-xs">
            <span className="type-label-md text-hisabi-on-surface">
              {t('fieldUnitCost')}
            </span>
            <input
              className={cn(
                fieldClass,
                fieldErrors.unitCost && fieldInvalidClass,
              )}
              inputMode="decimal"
              dir="ltr"
              value={unitCost}
              placeholder={t('fieldUnitCostPlaceholder')}
              onChange={(e) => setUnitCost(e.target.value)}
            />
            {fieldErrors.unitCost ? (
              <span className="type-body-sm text-hisabi-error">
                {fieldErrors.unitCost}
              </span>
            ) : (
              <span className="type-body-sm text-hisabi-on-surface-variant">
                {t('fieldPurchaseUnitCostHint')}
              </span>
            )}
          </label>
        ) : null}

        <label className="flex flex-col gap-hisabi-xs">
          <span className="type-label-md text-hisabi-on-surface">
            {t('fieldReason')}
            {type === 'adjust_out' ? <RequiredMark /> : null}
          </span>
          <input
            className={cn(fieldClass, fieldErrors.reason && fieldInvalidClass)}
            value={reason}
            maxLength={200}
            placeholder={t('fieldReasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
          />
          {fieldErrors.reason ? (
            <span className="type-body-sm text-hisabi-error">
              {fieldErrors.reason}
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-hisabi-xs">
          <span className="type-label-md text-hisabi-on-surface">
            {t('fieldNote')}
          </span>
          <textarea
            className={cn(fieldClass, 'min-h-20 resize-y')}
            value={note}
            maxLength={500}
            placeholder={t('fieldNotePlaceholder')}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {formError ? (
          <p className="type-body-md text-hisabi-error" role="alert">
            {formError}
          </p>
        ) : null}
      </form>
    </HisabiSheet>
  )
}
