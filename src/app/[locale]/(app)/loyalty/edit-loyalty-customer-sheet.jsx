'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import {
  HisabiSheet,
  HISABI_SHEET_FOOTER_CANCEL_CLASS,
  HISABI_SHEET_FOOTER_SAVE_CLASS,
} from '@/components/shared/hisabi-sheet'
import { RequiredMark } from '@/components/ui/required-mark'
import { AuthApiError, authPatch } from '@/lib/api/auth-client'
import { isValidLoyaltyBalanceString } from '@/lib/loyalty/loyalty-customer-schemas'
import { normalizeLoyaltyPhone } from '@/lib/loyalty/normalize-loyalty-phone'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'
const fieldInvalidClass =
  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'

/**
 * Shared Edit Customer sheet — used from list rows and detail page.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   customer: { id: string, phone?: string, balance?: string } | null
 *   onSuccess?: (customer: Record<string, unknown>) => void
 * }} props
 */
export function EditLoyaltyCustomerSheet({
  open,
  onOpenChange,
  customer,
  onSuccess,
}) {
  const t = useTranslations('Loyalty')
  const tErr = useTranslations('AuthErrors')

  const [phone, setPhone] = useState('')
  const [balance, setBalance] = useState('')
  const [fieldErrors, setFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  )
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !customer) return
    setPhone(String(customer.phone ?? ''))
    setBalance(String(customer.balance ?? '0'))
    setFieldErrors({})
    setFormError('')
  }, [open, customer])

  function clearFieldError(key) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  async function handleSave() {
    if (!customer?.id || saving) return
    setFormError('')
    /** @type {Record<string, string>} */
    const errors = {}

    const phoneNorm = normalizeLoyaltyPhone(phone)
    if (!phoneNorm.valid) {
      errors.phone =
        phoneNorm.reason === 'invalid_length'
          ? tErr('LOYALTY_PHONE_INVALID_LENGTH')
          : phoneNorm.reason === 'invalid_prefix'
            ? tErr('LOYALTY_PHONE_INVALID_PREFIX')
            : tErr('LOYALTY_ACCOUNT_PHONE_INVALID')
    }

    const balanceTrim = balance.trim()
    if (!isValidLoyaltyBalanceString(balanceTrim)) {
      errors.balance = tErr('LOYALTY_ACCOUNT_BALANCE_INVALID')
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      scrollAfterFieldValidation()
      return
    }

    setFieldErrors({})
    setSaving(true)
    try {
      const res = await authPatch(`/loyalty/customers/${customer.id}`, {
        phone: phoneNorm.valid ? phoneNorm.normalized : phone.trim(),
        balance: balanceTrim,
      })
      toast.success(t('editSaved'))
      onOpenChange(false)
      onSuccess?.(res?.customer ?? {})
    } catch (err) {
      const code = err instanceof AuthApiError ? err.code : undefined
      const message = code ? tErr(code) : tErr('generic')
      setFormError(message)
      if (
        code === 'LOYALTY_ACCOUNT_PHONE_ALREADY_EXISTS' ||
        code === 'LOYALTY_ACCOUNT_PHONE_INVALID' ||
        code === 'LOYALTY_PHONE_INVALID_LENGTH' ||
        code === 'LOYALTY_PHONE_INVALID_PREFIX'
      ) {
        setFieldErrors({ phone: message })
        scrollAfterFieldValidation()
      } else if (code === 'LOYALTY_ACCOUNT_BALANCE_INVALID') {
        setFieldErrors({ balance: message })
        scrollAfterFieldValidation()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <HisabiSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('editSheetTitle')}
      description={t('editSheetSubtitle')}
      closeLabel={t('cancel')}
      footer={
        <>
          <button
            type="button"
            className={HISABI_SHEET_FOOTER_CANCEL_CLASS}
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="button"
            pending={saving}
            disabled={saving}
            className={HISABI_SHEET_FOOTER_SAVE_CLASS}
            onClick={() => void handleSave()}
          >
            {t('editSave')}
          </AuthSubmitButton>
        </>
      }
    >
      <div className="space-y-hisabi-lg">
        {formError ? (
          <p className="type-body-md text-hisabi-error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="min-w-0 space-y-hisabi-xs">
          <label
            htmlFor="loyalty-edit-phone"
            className="type-label-md text-hisabi-on-surface-variant flex items-center gap-1"
          >
            {t('colPhone')}
            <RequiredMark />
          </label>
          <input
            id="loyalty-edit-phone"
            className={cn(fieldClass, fieldErrors.phone && fieldInvalidClass)}
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            placeholder={t('editPhonePlaceholder')}
            aria-invalid={fieldErrors.phone ? true : undefined}
            onChange={(e) => {
              setPhone(e.target.value)
              clearFieldError('phone')
              setFormError('')
            }}
          />
          {fieldErrors.phone ? (
            <p className="type-body-sm text-hisabi-error" role="alert">
              {fieldErrors.phone}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 space-y-hisabi-xs">
          <label
            htmlFor="loyalty-edit-balance"
            className="type-label-md text-hisabi-on-surface-variant flex items-center gap-1"
          >
            {t('colBalance')}
            <RequiredMark />
          </label>
          <input
            id="loyalty-edit-balance"
            className={cn(
              fieldClass,
              fieldErrors.balance && fieldInvalidClass,
            )}
            dir="ltr"
            inputMode="decimal"
            value={balance}
            placeholder={t('editBalancePlaceholder')}
            aria-invalid={fieldErrors.balance ? true : undefined}
            onChange={(e) => {
              setBalance(e.target.value)
              clearFieldError('balance')
              setFormError('')
            }}
          />
          {fieldErrors.balance ? (
            <p className="type-body-sm text-hisabi-error" role="alert">
              {fieldErrors.balance}
            </p>
          ) : (
            <p className="type-body-sm text-hisabi-on-surface-variant">
              {t('editBalanceHint')}
            </p>
          )}
        </div>
      </div>
    </HisabiSheet>
  )
}
