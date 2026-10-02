'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { EWaiterSheetScaffold } from '@/components/e-waiter/e-waiter-sheet-scaffold'

/**
 * Skippable loyalty phone login sheet.
 *
 * @param {{
 *   slug: string
 *   qrToken: string
 *   onSkip: () => void
 *   onLoggedIn: (payload: { loyaltyAccountId: string, balance: string }) => void
 * }} props
 */
export function EWaiterLoyaltyLoginSheet({ slug, qrToken, onSkip, onLoggedIn }) {
  const t = useTranslations('EWaiter')
  const [phone, setPhone] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (pending) return
    setPending(true)
    setError('')
    try {
      const res = await fetch(
        `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/login-loyalty`,
        {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        const code = typeof data.code === 'string' ? data.code : ''
        setError(
          code === 'INVALID_PHONE_FORMAT'
            ? t('loyaltyPhoneInvalid')
            : t('loyaltyLoginFailed'),
        )
        return
      }
      onLoggedIn({
        loyaltyAccountId: String(data.loyaltyAccountId),
        balance: String(data.balance ?? '0'),
      })
    } catch {
      setError(t('loyaltyLoginFailed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <EWaiterSheetScaffold
      title={t('loyaltyLoginTitle')}
      onClose={onSkip}
      closeDisabled={pending}
    >
      <div className="space-y-hisabi-md px-hisabi-margin-mobile pb-hisabi-md">
        <p className="type-body-md e-waiter-text-muted">{t('loyaltyLoginBody')}</p>
        <label className="block space-y-hisabi-xs">
          <span className="type-label-md font-semibold">
            {t('loyaltyPhoneLabel')} <span aria-hidden>*</span>
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('loyaltyPhonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="type-body-md e-waiter-surface w-full rounded-xl border e-waiter-border px-hisabi-md py-hisabi-md"
          />
        </label>
        {error ? (
          <p className="type-body-sm text-hisabi-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending || !phone.trim()}
          onClick={() => void submit()}
          className="e-waiter-btn-primary type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl font-bold disabled:opacity-50"
        >
          {pending ? t('loyaltyLoggingIn') : t('loyaltyLoginSubmit')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onSkip}
          className="type-label-md e-waiter-text-muted flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl font-semibold"
        >
          {t('loyaltyLoginSkip')}
        </button>
      </div>
    </EWaiterSheetScaffold>
  )
}
