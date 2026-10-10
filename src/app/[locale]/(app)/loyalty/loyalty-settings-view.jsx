'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Coins, Gift, Save, Scale, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'

import { AppLoader } from '@/components/app-loader'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { SettingsSection } from '@/components/settings/settings-page-shell'
import { RequiredMark } from '@/components/ui/required-mark'
import { AuthApiError, authGet, authPatch } from '@/lib/api/auth-client'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const QUERY_KEY = ['loyalty-settings']

/** Menu / Coupon Active-Inactive segment outer shell (exact class match). */
const SEGMENT_SHELL =
  'flex w-full max-w-sm rounded-lg border border-hisabi-outline-variant/60 bg-white p-1'

/** Match Coupon form field classes exactly. */
const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'
const fieldInvalidClass =
  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'

const FORM_FOOTER_CLASS =
  'flex w-full flex-col-reverse gap-hisabi-md border-t border-hisabi-outline-variant/20 pt-hisabi-xl min-[500px]:flex-row min-[500px]:justify-end min-[500px]:gap-hisabi-xl'

/** Same money-string pattern as loyalty-settings-schema / coupons. */
const MONEY_RE = /^\d+(\.\d{1,4})?$/

/** Server AuthErrors → primary form field (local map; no shared API_FIELD_MAP). */
const LOYALTY_SETTINGS_ERROR_FIELD_MAP = {
  LOYALTY_EARN_RATE_AMOUNT_REQUIRED: 'earnRateAmount',
  LOYALTY_EARN_RATE_AMOUNT_INVALID: 'earnRateAmount',
  LOYALTY_EARN_RATE_POINTS_REQUIRED: 'earnRatePoints',
  LOYALTY_EARN_RATE_POINTS_INVALID: 'earnRatePoints',
  LOYALTY_REDEEM_RATE_POINTS_REQUIRED: 'redeemRatePoints',
  LOYALTY_REDEEM_RATE_POINTS_INVALID: 'redeemRatePoints',
  LOYALTY_REDEEM_RATE_AMOUNT_REQUIRED: 'redeemRateAmount',
  LOYALTY_REDEEM_RATE_AMOUNT_INVALID: 'redeemRateAmount',
  LOYALTY_MIN_BALANCE_TO_REDEEM_INVALID: 'minBalanceToRedeem',
  LOYALTY_MAX_POINTS_PER_ORDER_INVALID: 'maxPointsPerOrder',
  LOYALTY_MIN_ORDER_VALUE_TO_REDEEM_INVALID: 'minOrderValueToRedeem',
  VALIDATION_ERROR: 'form',
}

/**
 * @param {Record<string, unknown> | null | undefined} settings
 */
function formStateFromSettings(settings) {
  const minBal = settings?.minBalanceToRedeem
  const maxPts = settings?.maxPointsPerOrder
  const minOrder = settings?.minOrderValueToRedeem
  return {
    enabled: settings?.enabled === true,
    earnRateAmount:
      settings?.earnRateAmount != null ? String(settings.earnRateAmount) : '',
    earnRatePoints:
      settings?.earnRatePoints != null ? String(settings.earnRatePoints) : '',
    redeemRatePoints:
      settings?.redeemRatePoints != null
        ? String(settings.redeemRatePoints)
        : '',
    redeemRateAmount:
      settings?.redeemRateAmount != null
        ? String(settings.redeemRateAmount)
        : '',
    minBalanceUnlimited: minBal == null || String(minBal).trim() === '',
    minBalanceToRedeem:
      minBal != null && String(minBal).trim() !== '' ? String(minBal) : '',
    maxPointsUnlimited: maxPts == null || String(maxPts).trim() === '',
    maxPointsPerOrder:
      maxPts != null && String(maxPts).trim() !== '' ? String(maxPts) : '',
    minOrderUnlimited: minOrder == null || String(minOrder).trim() === '',
    minOrderValueToRedeem:
      minOrder != null && String(minOrder).trim() !== ''
        ? String(minOrder)
        : '',
  }
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isPositiveMoneyString(raw) {
  if (!MONEY_RE.test(raw)) return false
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isNonNegativeMoneyString(raw) {
  if (!MONEY_RE.test(raw)) return false
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0
}

export function LoyaltySettingsView() {
  const t = useTranslations('Loyalty')
  const tErr = useTranslations('AuthErrors')
  const isRtl = useIsRtl()
  const alignDoc = isRtl ? 'text-start' : undefined
  const ability = useAppAbility()
  const canUpdate =
    hasFullAccess(ability) || ability.can('update', 'Loyalty')
  const queryClient = useQueryClient()
  const titleId = useId()

  const [form, setForm] = useState(() => formStateFromSettings(null))
  const [fieldErrors, setFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  )
  const [formError, setFormError] = useState('')
  const [hydrated, setHydrated] = useState(false)

  const { data, isPending, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => authGet('/loyalty/settings'),
  })

  useEffect(() => {
    if (data?.settings) {
      setForm(formStateFromSettings(data.settings))
      setHydrated(true)
    }
  }, [data?.settings])

  function clearFieldError(key) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  /**
   * Coupon-style unlimited checkbox → input only when unchecked.
   * @param {string} id
   * @param {string} label
   * @param {boolean} unlimited
   * @param {(v: boolean) => void} setUnlimited
   * @param {string} value
   * @param {(v: string) => void} setValue
   * @param {string} errorKey
   * @param {string} unlimitedLabel
   * @param {string} [placeholder]
   * @param {string} [hint]
   */
  function renderLimitedNumberField(
    id,
    label,
    unlimited,
    setUnlimited,
    value,
    setValue,
    errorKey,
    unlimitedLabel,
    placeholder,
    hint,
  ) {
    const err = fieldErrors[errorKey]
    return (
      <div className="min-w-0 space-y-hisabi-xs">
        <label
          htmlFor={id}
          className={cn(
            'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
            alignDoc,
          )}
        >
          {label}
        </label>
        <label className="mb-hisabi-xs flex cursor-pointer items-center gap-hisabi-sm">
          <input
            type="checkbox"
            className="size-5 accent-hisabi-primary"
            checked={unlimited}
            disabled={!canUpdate}
            onChange={(e) => {
              setUnlimited(e.target.checked)
              if (e.target.checked) {
                setValue('')
                clearFieldError(errorKey)
              }
            }}
          />
          <span className="type-body-sm text-hisabi-on-surface">
            {unlimitedLabel}
          </span>
        </label>
        {!unlimited ? (
          <>
            <input
              id={id}
              className={cn(fieldClass, err && fieldInvalidClass)}
              dir="ltr"
              inputMode="decimal"
              value={value}
              placeholder={placeholder}
              disabled={!canUpdate}
              aria-invalid={err ? true : undefined}
              onChange={(e) => {
                setValue(e.target.value)
                clearFieldError(errorKey)
              }}
            />
            {err ? (
              <p className="type-body-sm text-hisabi-error" role="alert">
                {err}
              </p>
            ) : null}
          </>
        ) : null}
        {hint ? (
          <p
            className={cn(
              'type-body-sm text-hisabi-on-surface-variant',
              alignDoc,
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>
    )
  }

  function collectClientErrors() {
    /** @type {Record<string, string>} */
    const errors = {}

    const earnAmount = form.earnRateAmount.trim()
    if (!earnAmount) {
      errors.earnRateAmount = tErr('LOYALTY_EARN_RATE_AMOUNT_REQUIRED')
    } else if (!isPositiveMoneyString(earnAmount)) {
      errors.earnRateAmount = tErr('LOYALTY_EARN_RATE_AMOUNT_INVALID')
    }

    const earnPoints = form.earnRatePoints.trim()
    if (!earnPoints) {
      errors.earnRatePoints = tErr('LOYALTY_EARN_RATE_POINTS_REQUIRED')
    } else if (!isPositiveMoneyString(earnPoints)) {
      errors.earnRatePoints = tErr('LOYALTY_EARN_RATE_POINTS_INVALID')
    }

    const redeemPoints = form.redeemRatePoints.trim()
    if (!redeemPoints) {
      errors.redeemRatePoints = tErr('LOYALTY_REDEEM_RATE_POINTS_REQUIRED')
    } else if (!isPositiveMoneyString(redeemPoints)) {
      errors.redeemRatePoints = tErr('LOYALTY_REDEEM_RATE_POINTS_INVALID')
    }

    const redeemAmount = form.redeemRateAmount.trim()
    if (!redeemAmount) {
      errors.redeemRateAmount = tErr('LOYALTY_REDEEM_RATE_AMOUNT_REQUIRED')
    } else if (!isPositiveMoneyString(redeemAmount)) {
      errors.redeemRateAmount = tErr('LOYALTY_REDEEM_RATE_AMOUNT_INVALID')
    }

    if (!form.minBalanceUnlimited) {
      const raw = form.minBalanceToRedeem.trim()
      if (!raw || !isNonNegativeMoneyString(raw)) {
        errors.minBalanceToRedeem = tErr('LOYALTY_MIN_BALANCE_TO_REDEEM_INVALID')
      }
    }
    if (!form.maxPointsUnlimited) {
      const raw = form.maxPointsPerOrder.trim()
      if (!raw || !isNonNegativeMoneyString(raw)) {
        errors.maxPointsPerOrder = tErr('LOYALTY_MAX_POINTS_PER_ORDER_INVALID')
      }
    }
    if (!form.minOrderUnlimited) {
      const raw = form.minOrderValueToRedeem.trim()
      if (!raw || !isNonNegativeMoneyString(raw)) {
        errors.minOrderValueToRedeem = tErr(
          'LOYALTY_MIN_ORDER_VALUE_TO_REDEEM_INVALID',
        )
      }
    }

    return errors
  }

  function buildPatchBody() {
    return {
      enabled: form.enabled === true,
      earnRateAmount: form.earnRateAmount.trim(),
      earnRatePoints: form.earnRatePoints.trim(),
      redeemRatePoints: form.redeemRatePoints.trim(),
      redeemRateAmount: form.redeemRateAmount.trim(),
      minBalanceToRedeem: form.minBalanceUnlimited
        ? null
        : form.minBalanceToRedeem.trim(),
      maxPointsPerOrder: form.maxPointsUnlimited
        ? null
        : form.maxPointsPerOrder.trim(),
      minOrderValueToRedeem: form.minOrderUnlimited
        ? null
        : form.minOrderValueToRedeem.trim(),
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => authPatch('/loyalty/settings', buildPatchBody()),
    onSuccess: (res) => {
      queryClient.setQueryData(QUERY_KEY, res)
      if (res?.settings) setForm(formStateFromSettings(res.settings))
      setFormError('')
      setFieldErrors({})
      toast.success(t('settingsSaved'))
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      const message = code ? tErr(code) : tErr('generic')
      setFormError(message)
      const fieldKey = code
        ? LOYALTY_SETTINGS_ERROR_FIELD_MAP[code]
        : undefined
      if (fieldKey && fieldKey !== 'form') {
        setFieldErrors((prev) => ({ ...prev, [fieldKey]: message }))
        scrollAfterFieldValidation()
      }
    },
  })

  function handleSave(e) {
    e.preventDefault()
    if (!canUpdate || saveMutation.isPending) return
    setFormError('')
    const errors = collectClientErrors()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      scrollAfterFieldValidation()
      return
    }
    setFieldErrors({})
    saveMutation.mutate()
  }

  if (isPending && !hydrated) {
    return (
      <div className="mx-auto flex w-full max-w-hisabi-container justify-center px-hisabi-md py-16 sm:px-hisabi-xl">
        <AppLoader size="lg" />
      </div>
    )
  }

  if (isError && !hydrated) {
    const code = error instanceof AuthApiError ? error.code : undefined
    return (
      <div className="mx-auto w-full max-w-hisabi-container px-hisabi-md py-hisabi-xl sm:px-hisabi-xl">
        <p className="type-body-md text-hisabi-error" role="alert">
          {code ? tErr(code) : tErr('generic')}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-hisabi-container px-hisabi-md sm:px-hisabi-xl">
      <header className="mb-hisabi-xl">
        <h1
          id={titleId}
          className={cn(
            'type-headline-xl text-hisabi-on-surface tracking-tight',
            alignDoc,
          )}
        >
          {t('settingsTitle')}
        </h1>
        <p
          className={cn(
            'type-body-md text-hisabi-on-surface-variant mt-0.5 max-w-2xl',
            alignDoc,
          )}
        >
          {t('settingsSubtitle')}
        </p>
      </header>

      <form
        noValidate
        className="flex flex-col"
        onSubmit={handleSave}
        aria-labelledby={titleId}
      >
        <div className="space-y-hisabi-xl">
          {formError ? (
            <p className="type-body-md text-hisabi-error" role="alert">
              {formError}
            </p>
          ) : null}

          <SettingsSection title={t('sectionStatus')} icon={Gift}>
            <fieldset
              disabled={!canUpdate}
              className="min-w-0 space-y-hisabi-xs border-0 p-0"
            >
              <legend
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant',
                  alignDoc,
                )}
              >
                {t('fieldEnabledLabel')}
              </legend>
              <div className={SEGMENT_SHELL}>
                {(
                  /** @type {const} */ ([
                    [true, 'statusEnabled'],
                    [false, 'statusDisabled'],
                  ])
                ).map(([value, labelKey]) => (
                  <button
                    key={String(value)}
                    type="button"
                    disabled={!canUpdate}
                    onClick={() =>
                      setForm((f) => ({ ...f, enabled: value }))
                    }
                    className={cn(
                      'type-label-sm flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 text-center font-bold transition-colors',
                      form.enabled === value
                        ? 'bg-hisabi-primary-container text-white'
                        : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                      !canUpdate && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
              <p
                className={cn(
                  'type-body-sm text-hisabi-on-surface-variant',
                  alignDoc,
                )}
              >
                {t('fieldEnabledHint')}
              </p>
            </fieldset>
          </SettingsSection>

          <SettingsSection title={t('sectionEarnRate')} icon={Coins}>
            <fieldset
              disabled={!canUpdate}
              className="min-w-0 space-y-hisabi-md border-0 p-0"
            >
              <p
                className={cn(
                  'type-body-sm text-hisabi-on-surface-variant',
                  alignDoc,
                )}
              >
                {t('earnRateIntro')}
              </p>
              <div className="flex flex-col gap-hisabi-md sm:flex-row sm:items-end sm:gap-hisabi-sm">
                <div className="min-w-0 flex-1 space-y-hisabi-xs">
                  <label
                    htmlFor="loyalty-earn-amount"
                    className={cn(
                      'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
                      alignDoc,
                    )}
                  >
                    {t('fieldEarnRateAmount')}
                    <RequiredMark />
                  </label>
                  <input
                    id="loyalty-earn-amount"
                    className={cn(
                      fieldClass,
                      fieldErrors.earnRateAmount && fieldInvalidClass,
                    )}
                    dir="ltr"
                    inputMode="decimal"
                    value={form.earnRateAmount}
                    placeholder={t('fieldEarnRateAmountPlaceholder')}
                    aria-invalid={
                      fieldErrors.earnRateAmount ? true : undefined
                    }
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        earnRateAmount: e.target.value,
                      }))
                      clearFieldError('earnRateAmount')
                    }}
                  />
                  {fieldErrors.earnRateAmount ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.earnRateAmount}
                    </p>
                  ) : null}
                </div>
                <p className="type-label-md text-hisabi-on-surface-variant shrink-0 pb-3 text-center sm:px-1">
                  {t('rateConnectorSarEquals')}
                </p>
                <div className="min-w-0 flex-1 space-y-hisabi-xs">
                  <label
                    htmlFor="loyalty-earn-points"
                    className={cn(
                      'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
                      alignDoc,
                    )}
                  >
                    {t('fieldEarnRatePoints')}
                    <RequiredMark />
                  </label>
                  <input
                    id="loyalty-earn-points"
                    className={cn(
                      fieldClass,
                      fieldErrors.earnRatePoints && fieldInvalidClass,
                    )}
                    dir="ltr"
                    inputMode="decimal"
                    value={form.earnRatePoints}
                    placeholder={t('fieldEarnRatePointsPlaceholder')}
                    aria-invalid={
                      fieldErrors.earnRatePoints ? true : undefined
                    }
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        earnRatePoints: e.target.value,
                      }))
                      clearFieldError('earnRatePoints')
                    }}
                  />
                  {fieldErrors.earnRatePoints ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.earnRatePoints}
                    </p>
                  ) : null}
                </div>
                <p className="type-label-md text-hisabi-on-surface-variant shrink-0 pb-3 text-center sm:px-1">
                  {t('rateUnitPoints')}
                </p>
              </div>
              <p
                className={cn(
                  'type-body-sm text-hisabi-on-surface-variant',
                  alignDoc,
                )}
              >
                {t('earnRateExampleHint')}
              </p>
            </fieldset>
          </SettingsSection>

          <SettingsSection title={t('sectionRedeemRate')} icon={Scale}>
            <fieldset
              disabled={!canUpdate}
              className="min-w-0 space-y-hisabi-md border-0 p-0"
            >
              <p
                className={cn(
                  'type-body-sm text-hisabi-on-surface-variant',
                  alignDoc,
                )}
              >
                {t('redeemRateIntro')}
              </p>
              <div className="flex flex-col gap-hisabi-md sm:flex-row sm:items-end sm:gap-hisabi-sm">
                <div className="min-w-0 flex-1 space-y-hisabi-xs">
                  <label
                    htmlFor="loyalty-redeem-points"
                    className={cn(
                      'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
                      alignDoc,
                    )}
                  >
                    {t('fieldRedeemRatePoints')}
                    <RequiredMark />
                  </label>
                  <input
                    id="loyalty-redeem-points"
                    className={cn(
                      fieldClass,
                      fieldErrors.redeemRatePoints && fieldInvalidClass,
                    )}
                    dir="ltr"
                    inputMode="decimal"
                    value={form.redeemRatePoints}
                    placeholder={t('fieldRedeemRatePointsPlaceholder')}
                    aria-invalid={
                      fieldErrors.redeemRatePoints ? true : undefined
                    }
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        redeemRatePoints: e.target.value,
                      }))
                      clearFieldError('redeemRatePoints')
                    }}
                  />
                  {fieldErrors.redeemRatePoints ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.redeemRatePoints}
                    </p>
                  ) : null}
                </div>
                <p className="type-label-md text-hisabi-on-surface-variant shrink-0 pb-3 text-center sm:px-1">
                  {t('rateConnectorPointsEquals')}
                </p>
                <div className="min-w-0 flex-1 space-y-hisabi-xs">
                  <label
                    htmlFor="loyalty-redeem-amount"
                    className={cn(
                      'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
                      alignDoc,
                    )}
                  >
                    {t('fieldRedeemRateAmount')}
                    <RequiredMark />
                  </label>
                  <input
                    id="loyalty-redeem-amount"
                    className={cn(
                      fieldClass,
                      fieldErrors.redeemRateAmount && fieldInvalidClass,
                    )}
                    dir="ltr"
                    inputMode="decimal"
                    value={form.redeemRateAmount}
                    placeholder={t('fieldRedeemRateAmountPlaceholder')}
                    aria-invalid={
                      fieldErrors.redeemRateAmount ? true : undefined
                    }
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        redeemRateAmount: e.target.value,
                      }))
                      clearFieldError('redeemRateAmount')
                    }}
                  />
                  {fieldErrors.redeemRateAmount ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.redeemRateAmount}
                    </p>
                  ) : null}
                </div>
                <p className="type-label-md text-hisabi-on-surface-variant shrink-0 pb-3 text-center sm:px-1">
                  {t('rateUnitSar')}
                </p>
              </div>
              <p
                className={cn(
                  'type-body-sm text-hisabi-on-surface-variant',
                  alignDoc,
                )}
              >
                {t('redeemRateExampleHint')}
              </p>
            </fieldset>
          </SettingsSection>

          <SettingsSection title={t('sectionLimits')} icon={SlidersHorizontal}>
            <fieldset
              disabled={!canUpdate}
              className="min-w-0 space-y-hisabi-lg border-0 p-0"
            >
              {renderLimitedNumberField(
                'loyalty-min-balance',
                t('fieldMinBalanceToRedeem'),
                form.minBalanceUnlimited,
                (v) => setForm((f) => ({ ...f, minBalanceUnlimited: v })),
                form.minBalanceToRedeem,
                (v) => setForm((f) => ({ ...f, minBalanceToRedeem: v })),
                'minBalanceToRedeem',
                t('formNoLimit'),
                t('fieldMinBalancePlaceholder'),
                t('fieldMinBalanceHint'),
              )}
              {renderLimitedNumberField(
                'loyalty-max-points',
                t('fieldMaxPointsPerOrder'),
                form.maxPointsUnlimited,
                (v) => setForm((f) => ({ ...f, maxPointsUnlimited: v })),
                form.maxPointsPerOrder,
                (v) => setForm((f) => ({ ...f, maxPointsPerOrder: v })),
                'maxPointsPerOrder',
                t('formNoLimit'),
                t('fieldMaxPointsPlaceholder'),
                t('fieldMaxPointsHint'),
              )}
              {renderLimitedNumberField(
                'loyalty-min-order',
                t('fieldMinOrderValueToRedeem'),
                form.minOrderUnlimited,
                (v) => setForm((f) => ({ ...f, minOrderUnlimited: v })),
                form.minOrderValueToRedeem,
                (v) => setForm((f) => ({ ...f, minOrderValueToRedeem: v })),
                'minOrderValueToRedeem',
                t('formNoLimit'),
                t('fieldMinOrderPlaceholder'),
                t('fieldMinOrderHint'),
              )}
            </fieldset>
          </SettingsSection>
        </div>

        {canUpdate ? (
          <div className={cn(FORM_FOOTER_CLASS, 'mt-hisabi-xl')}>
            <AuthSubmitButton
              type="submit"
              pending={saveMutation.isPending}
              disabled={saveMutation.isPending}
            >
              <Save className="size-5" aria-hidden />
              {t('settingsSave')}
            </AuthSubmitButton>
          </div>
        ) : null}
      </form>
    </div>
  )
}
