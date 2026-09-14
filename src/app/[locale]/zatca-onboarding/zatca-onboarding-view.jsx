'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'

import { ZatcaOtpHelpLink } from '@/components/zatca/zatca-otp-help-link'
import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import { AuthPageFooter } from '@/components/auth/auth-page-footer'
import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { parseSafeNextPath } from '@/lib/auth/safe-next-path'
import { getZatcaSupportWhatsappLink } from '@/lib/support/zatca-support-whatsapp-link'
import {
  formatHumanizedZatcaErrorText,
  isZatcaErrorMessage,
} from '@/lib/zatca/humanize-zatca-error'
import { cn } from '@/lib/utils'
import { useRouter } from '@/i18n/navigation'
import { useAuthStore } from '@/stores/auth-store'

const OTP_LEN = 6

const zatcaPrimaryCtaClassName =
  'min-h-[52px] w-full min-w-[10rem] px-10 py-3 sm:w-auto'

const zatcaBackButtonClassName =
  'type-label-md border-hisabi-outline text-hisabi-on-surface-variant hover:bg-hisabi-surface-container-low min-h-[52px] w-full min-w-[10rem] px-10 inline-flex cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-2 font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto'

const zatcaFooterActionsClassName =
  'border-hisabi-outline-variant flex w-full flex-col-reverse items-stretch gap-hisabi-sm border-t pt-hisabi-lg sm:flex-row sm:items-center sm:justify-center sm:gap-hisabi-md'

/**
 * Same UX as Hisabi: OTP → onboard, or Skip for now.
 *
 * @param {{
 *   variant?: 'page' | 'modal' | 'embedded'
 *   open?: boolean
 *   onRequestClose?: () => void
 *   onBack?: () => void
 *   targetBusinessProfileId?: string | null
 *   successHref?: string
 * }} [props]
 */
export function ZatcaOnboardingView({
  variant = 'page',
  open = false,
  onRequestClose,
  onBack,
  targetBusinessProfileId = null,
  successHref,
} = {}) {
  const isModal = variant === 'modal'
  const isEmbedded = variant === 'embedded'
  const t = useTranslations('ZatcaOnboarding')
  const tErr = useTranslations('AuthErrors')
  const tZatca = useTranslations('ZatcaErrors')
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath =
    isModal || isEmbedded
      ? null
      : parseSafeNextPath(searchParams.get('next'))
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const isRtl = useIsRtl()
  const NextIcon = isRtl ? ArrowLeft : ArrowRight
  const BackIcon = isRtl ? ArrowRight : ArrowLeft
  const whatsappLink = getZatcaSupportWhatsappLink()
  const finishHref = successHref ?? (isEmbedded ? '/restaurants' : '/')

  const [otp, setOtp] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [onboardDone, setOnboardDone] = useState(false)

  useEffect(() => {
    if (!isModal || !open) return
    setOtp('')
    setOnboardDone(false)
    setSubmitError('')
  }, [isModal, open])

  function resolveTargetProfileId() {
    return (
      targetBusinessProfileId ??
      useAuthStore.getState().user?.activeBusinessProfileId ??
      null
    )
  }

  function applyUser(u) {
    if (u) {
      queryClient.setQueryData(['auth', 'me'], { user: u })
      setUser(u)
    }
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    queryClient.invalidateQueries({ queryKey: ['auth', 'business-profiles'] })
    queryClient.invalidateQueries({ queryKey: ['auth', 'business-profile'] })
  }

  const skipMutation = useMutation({
    mutationFn: () => {
      const id = resolveTargetProfileId()
      return authPost(
        '/zatca-onboarding/skip',
        id ? { businessProfileId: id } : {},
      )
    },
    onSuccess: (data) => {
      applyUser(data?.user)
      if (isModal) {
        onRequestClose?.()
        router.refresh()
      } else if (isEmbedded) {
        router.push(finishHref)
        router.refresh()
      } else {
        router.push(getPostAuthLandingPath(data?.user, nextPath))
      }
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setSubmitError(code ? tErr(code) : tErr('generic'))
    },
  })

  const skipPending = skipMutation.isPending

  const onboardMutation = useMutation({
    mutationFn: () => {
      const id = resolveTargetProfileId()
      return authPost('/zatca-onboarding/compliance-csid', {
        otp,
        ...(id ? { businessProfileId: id } : {}),
      })
    },
    onSuccess: (data) => {
      setOnboardDone(true)
      setSubmitError('')
      applyUser(data?.user)
      queryClient.invalidateQueries({ queryKey: ['zatca', 'status'] })
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      const message =
        err instanceof AuthApiError && typeof err.message === 'string'
          ? err.message
          : err instanceof Error
            ? err.message
            : ''
      if (isZatcaErrorMessage(message, code) && message.trim()) {
        setSubmitError(formatHumanizedZatcaErrorText(message, tZatca))
        return
      }
      setSubmitError(code ? tErr(code) : tErr('generic'))
    },
  })

  const onboardPending = onboardMutation.isPending

  function handleOtpChange(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, OTP_LEN)
    setOtp(v)
  }

  function handleOtpSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    if (otp.length !== OTP_LEN) {
      setSubmitError(tErr('VALIDATION_ERROR'))
      return
    }
    onboardMutation.mutate()
  }

  function handleBackFromOtp() {
    if (isModal) {
      onRequestClose?.()
      return
    }
    if (isEmbedded) {
      onBack?.()
      return
    }
    router.push('/business-profile?from=zatca')
  }

  function handleGoToDashboard() {
    setSubmitError('')
    const user = useAuthStore.getState().user
    if (isModal) {
      onRequestClose?.()
      router.refresh()
      return
    }
    if (isEmbedded) {
      router.push(finishHref)
      router.refresh()
      return
    }
    const path =
      user && user.needsZatcaOnboarding !== true
        ? getPostAuthLandingPath(user, nextPath)
        : nextPath || '/'
    router.push(path)
  }

  const rootClass = isModal
    ? 'type-body-md text-hisabi-on-surface flex min-h-0 flex-1 flex-col overflow-hidden bg-hisabi-background'
    : isEmbedded
      ? 'type-body-md text-hisabi-on-surface flex w-full flex-col'
      : 'type-body-md text-hisabi-on-surface relative flex min-h-dvh flex-col overflow-x-hidden bg-hisabi-background'

  const mainClass = cn(
    'relative z-10 flex flex-1 flex-col items-center',
    isModal
      ? 'min-h-0 justify-start overflow-y-auto px-hisabi-margin-mobile py-hisabi-lg md:px-hisabi-margin-desktop'
      : isEmbedded
        ? 'justify-start py-hisabi-md'
        : 'justify-center px-hisabi-margin-mobile py-hisabi-xxl md:px-hisabi-margin-desktop',
  )

  const otpFieldId = isModal
    ? 'zatca-otp-modal'
    : isEmbedded
      ? 'zatca-otp-embedded'
      : 'zatca-otp'

  return (
    <div className={rootClass}>
      {!isEmbedded ? (
        <div
          className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04]"
          aria-hidden
        >
          <svg
            className="text-hisabi-primary-container absolute end-0 top-0 size-[min(800px,100vw)]"
            fill="currentColor"
            viewBox="0 0 100 100"
          >
            <path
              d="M0,0 L100,0 L100,100 L0,100 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
            />
            <path
              d="M0,0 L100,100 M100,0 L0,100"
              stroke="currentColor"
              strokeWidth="0.25"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.1"
            />
            <circle
              cx="50"
              cy="50"
              r="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.1"
            />
          </svg>
        </div>
      ) : null}

      {!isEmbedded ? (
        <header className="border-hisabi-outline-variant/30 sticky top-0 z-50 shrink-0 border-b bg-hisabi-surface-container-lowest shadow-sm">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-hisabi-sm px-hisabi-md py-hisabi-md md:px-hisabi-lg">
            {isModal ? (
              <button
                type="button"
                onClick={() => onRequestClose?.()}
                className="text-hisabi-outline hover:text-hisabi-teal inline-flex size-10 cursor-pointer items-center justify-center justify-self-start rounded-lg transition-colors"
                aria-label={t('closeModal')}
              >
                <X className="size-5" aria-hidden />
              </button>
            ) : (
              <div aria-hidden />
            )}
            <div className="flex justify-center">
              <Image
                src="/images/hisabi-logo-light.png"
                alt={t('brandWordmark')}
                width={84}
                height={32}
                className="h-8 w-auto"
                priority
              />
            </div>
            <div className="flex justify-end">
              <AuthLocaleToggle />
            </div>
          </div>
        </header>
      ) : null}

      <main className={mainClass}>
        <div className="border-hisabi-outline-variant/40 shadow-hisabi-1 w-full max-w-2xl rounded-xl border bg-hisabi-surface-container-lowest p-hisabi-xl md:p-hisabi-xxl">
          {submitError ? (
            <p
              className="type-body-md text-hisabi-error mb-hisabi-md whitespace-pre-line text-center"
              role="alert"
            >
              {submitError}
            </p>
          ) : null}

          {!onboardDone ? (
            <>
              <div className="mb-hisabi-xl text-center">
                <h1 className="type-headline-lg text-hisabi-teal mb-hisabi-sm">
                  {t('title')}
                </h1>
                <p className="type-body-md text-hisabi-outline mx-auto max-w-lg leading-relaxed">
                  {t('subtitle')}
                </p>
              </div>

              <form className="space-y-hisabi-xl" onSubmit={handleOtpSubmit} noValidate>
                <div className="space-y-hisabi-md">
                  <label
                    className="type-label-md text-hisabi-on-surface-variant ml-1 block"
                    htmlFor={otpFieldId}
                  >
                    {t('otpLabel')}
                  </label>
                  <input
                    id={otpFieldId}
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={OTP_LEN}
                    placeholder={t('otpPlaceholder')}
                    value={otp}
                    onChange={handleOtpChange}
                    disabled={onboardPending}
                    className={cn(
                      'type-headline-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-lg py-4 text-center tracking-[0.35em] text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset',
                      'placeholder:text-hisabi-outline-variant/50',
                      onboardPending && 'opacity-60',
                    )}
                  />
                  <div className="flex flex-col items-center gap-hisabi-sm pt-hisabi-xs">
                    <ZatcaOtpHelpLink />
                    {whatsappLink ? (
                      <p className="type-body-sm text-hisabi-outline text-center">
                        {t('troubleOnboarding')}{' '}
                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="type-label-md text-hisabi-teal hover:text-hisabi-teal-container font-semibold underline decoration-hisabi-teal-container/40 underline-offset-4 transition-colors hover:decoration-hisabi-teal"
                        >
                          {t('contactUs')}
                        </a>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className={zatcaFooterActionsClassName}>
                  {!isModal ? (
                    <button
                      type="button"
                      onClick={handleBackFromOtp}
                      disabled={skipPending || onboardPending}
                      className={zatcaBackButtonClassName}
                    >
                      <BackIcon className="size-5 shrink-0" aria-hidden />
                      {t('back')}
                    </button>
                  ) : null}
                  <AuthSubmitButton
                    type="submit"
                    className={zatcaPrimaryCtaClassName}
                    pending={onboardPending}
                  >
                    <>
                      {onboardPending ? t('connectingZatca') : t('submit')}
                      {!onboardPending ? (
                        <NextIcon className="size-5 shrink-0" aria-hidden />
                      ) : null}
                    </>
                  </AuthSubmitButton>
                </div>
              </form>

              <div className="mt-hisabi-xl text-center">
                <button
                  type="button"
                  disabled={skipPending || onboardPending}
                  onClick={() => {
                    setSubmitError('')
                    skipMutation.mutate()
                  }}
                  className="type-label-sm text-hisabi-outline hover:text-hisabi-teal inline-flex min-h-[1.5rem] cursor-pointer items-center justify-center uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {skipPending ? <AuthButtonSpinner /> : t('skip')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-hisabi-xl text-center">
                <div className="mb-hisabi-lg inline-flex size-20 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                  <CheckCircle2
                    className="size-12 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </div>
                <h1 className="type-headline-lg text-hisabi-teal mb-hisabi-sm">
                  {t('successTitle')}
                </h1>
                <p className="type-body-md text-hisabi-outline mx-auto mb-hisabi-lg max-w-md leading-relaxed">
                  {t('successSubtitleBefore')}
                  <span className="font-semibold text-hisabi-teal">
                    {t('successCsid')}
                  </span>
                  {t('successSubtitleAfter')}
                </p>
                <div className="mb-hisabi-lg inline-flex items-center gap-hisabi-sm rounded-full border border-teal-100 bg-teal-50 px-hisabi-lg py-3">
                  <span
                    className="size-3 shrink-0 rounded-full bg-teal-600"
                    aria-hidden
                  />
                  <span className="type-label-md font-semibold text-teal-900">
                    {t('successStatus')}
                  </span>
                </div>
                <div className="mx-auto mb-hisabi-xl max-w-lg rounded-lg border border-teal-50 bg-hisabi-surface-container-low p-hisabi-lg">
                  <p className="type-body-lg font-semibold text-teal-900">
                    {t('successCallout')}
                  </p>
                </div>
              </div>

              <div className={zatcaFooterActionsClassName}>
                <AuthSubmitButton
                  type="button"
                  className={zatcaPrimaryCtaClassName}
                  pending={false}
                  onClick={handleGoToDashboard}
                >
                  <>
                    {t('goToDashboard')}
                    <LayoutDashboard className="size-5 shrink-0" aria-hidden />
                  </>
                </AuthSubmitButton>
              </div>
            </>
          )}
        </div>
      </main>

      {!isEmbedded ? (
        <div
          className={cn(
            'mt-auto shrink-0 px-hisabi-margin-mobile pb-hisabi-xl md:px-hisabi-margin-desktop',
            isModal && 'pb-hisabi-md pt-hisabi-sm',
          )}
        >
          <AuthPageFooter />
        </div>
      ) : null}
    </div>
  )
}
