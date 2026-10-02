'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { EWaiterSheetScaffold } from '@/components/e-waiter/e-waiter-sheet-scaffold'

/**
 * Self-serve redeem points sheet shown with Ask-for-Bill when eligible.
 *
 * @param {{
 *   maxPoints: string
 *   balance: string
 *   pending: boolean
 *   onClose: () => void
 *   onConfirm: (redeemPoints: string | null) => void
 * }} props
 */
export function EWaiterRedeemSheet({
  maxPoints,
  balance,
  pending,
  onClose,
  onConfirm,
}) {
  const t = useTranslations('EWaiter')
  const [points, setPoints] = useState('')
  const [error, setError] = useState('')

  function confirmWithPoints() {
    const raw = points.trim()
    if (!raw) {
      onConfirm(null)
      return
    }
    const n = Number.parseFloat(raw.replace(/,/g, ''))
    const max = Number.parseFloat(String(maxPoints))
    if (!Number.isFinite(n) || n <= 0) {
      setError(t('redeemInvalidAmount'))
      return
    }
    if (Number.isFinite(max) && n > max + 1e-9) {
      setError(t('redeemExceedsCeiling', { max: String(maxPoints) }))
      return
    }
    onConfirm(raw)
  }

  return (
    <EWaiterSheetScaffold
      title={t('redeemTitle')}
      onClose={onClose}
      closeDisabled={pending}
    >
      <div className="space-y-hisabi-md px-hisabi-margin-mobile pb-hisabi-md">
        <p className="type-body-md e-waiter-text-muted">
          {t('redeemBody', {
            balance: String(balance),
            max: String(maxPoints),
          })}
        </p>
        <label className="block space-y-hisabi-xs">
          <span className="type-label-md font-semibold">
            {t('redeemPointsLabel')}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={points}
            disabled={pending}
            onChange={(e) => {
              setPoints(e.target.value)
              if (error) setError('')
            }}
            className="type-body-md e-waiter-surface w-full rounded-xl border e-waiter-border px-hisabi-md py-hisabi-md"
            placeholder={t('redeemPointsPlaceholder', {
              max: String(maxPoints),
            })}
          />
        </label>
        {error ? (
          <p className="type-body-sm text-hisabi-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => confirmWithPoints()}
          className="e-waiter-btn-primary type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl font-bold disabled:opacity-50"
        >
          {t('redeemConfirmBill')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onConfirm(null)}
          className="type-label-md e-waiter-text-muted flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl font-semibold"
        >
          {t('redeemSkip')}
        </button>
      </div>
    </EWaiterSheetScaffold>
  )
}
