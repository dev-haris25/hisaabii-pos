'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AuthSplitShell } from '@/components/auth/auth-split-shell'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { Link, useRouter } from '@/i18n/navigation'
import { useAuthStore } from '@/stores/auth-store'

const OTP_LEN = 6

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * @param {{ mode: 'register' | 'forgot', namespace: string, searchEmail: string, nextPath?: string | null }} props
 */
export function OtpVerifyFlow({ mode, namespace, searchEmail, nextPath = null }) {
  const t = useTranslations(namespace)
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const isRtl = useIsRtl()
  const BackIcon = isRtl ? ArrowRight : ArrowLeft
  const email = searchEmail.trim().toLowerCase()

  const inputRefs = useRef(/** @type {(HTMLInputElement | null)[]} */ ([]))
  const [digits, setDigits] = useState(() => Array(OTP_LEN).fill(''))
  const [secondsLeft, setSecondsLeft] = useState(119)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 0 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const setRef = useCallback((el, i) => {
    inputRefs.current[i] = el
  }, [])

  function focusIndex(i) {
    const clamped = Math.max(0, Math.min(OTP_LEN - 1, i))
    inputRefs.current[clamped]?.focus()
  }

  function handleChange(i, raw) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = digit
    setDigits(next)
    if (digit && i < OTP_LEN - 1) focusIndex(i + 1)
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      focusIndex(i - 1)
    }
    if (e.key === 'ArrowLeft') focusIndex(i - 1)
    if (e.key === 'ArrowRight') focusIndex(i + 1)
  }

  function handlePaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LEN)
    if (!text) return
    e.preventDefault()
    const next = [...digits]
    for (let j = 0; j < text.length; j += 1) next[j] = text[j]
    setDigits(next)
    focusIndex(Math.min(text.length, OTP_LEN - 1))
  }

  const resendMutation = useMutation({
    mutationFn: async () => {
      const path =
        mode === 'register' ? '/resend-register-otp' : '/forgot-password'
      return authPost(path, { email })
    },
    onSuccess: () => {
      setSecondsLeft(119)
      setDigits(Array(OTP_LEN).fill(''))
      setFormError('')
      focusIndex(0)
      toast.success(t('resendSuccess'))
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  function handleResend() {
    if (!email || secondsLeft > 0 || resendMutation.isPending) return
    setFormError('')
    resendMutation.mutate()
  }

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const otp = digits.join('')
      const path =
        mode === 'register' ? '/verify-register-otp' : '/forgot-password/verify-otp'
      return authPost(path, { email, otp })
    },
    onSuccess: (data) => {
      if (mode === 'register') {
        const user = data?.user
        if (user) {
          queryClient.setQueryData(['auth', 'me'], { user })
          setUser(user)
        }
        const next = getPostAuthLandingPath(user, nextPath)
        router.push(next)
      } else {
        router.push('/forgot-password/reset')
      }
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!email) {
      setFormError(tErr('MISSING_EMAIL'))
      return
    }
    verifyMutation.mutate()
  }

  return (
    <AuthSplitShell namespace={namespace} showHeaderWordmark>
      <>
        {!email ? (
          <p className="type-body-md text-hisabi-error mb-hisabi-md">
            {tErr('MISSING_EMAIL')}
          </p>
        ) : null}

        {formError ? (
          <p className="type-body-md text-hisabi-error mb-hisabi-md" role="alert">
            {formError}
          </p>
        ) : null}

        <form className="space-y-hisabi-lg" onSubmit={handleSubmit}>
          <div
            className="flex justify-center gap-hisabi-sm md:gap-hisabi-md"
            dir="ltr"
          >
            {Array.from({ length: OTP_LEN }, (_, i) => (
              <input
                key={i}
                ref={(el) => setRef(el, i)}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digits[i]}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                aria-label={t('otpDigitLabel', { n: i + 1 })}
                className="type-headline-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container h-14 w-12 rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest text-center font-bold text-hisabi-teal outline-none transition-all focus:ring-2 focus:ring-inset md:h-16 md:w-14"
              />
            ))}
          </div>

          <div className="flex flex-col items-center gap-hisabi-sm">
            <p className="type-body-sm text-hisabi-outline">{t('didntReceive')}</p>
            <div className="flex flex-wrap items-center justify-center gap-hisabi-sm">
              <button
                type="button"
                disabled={secondsLeft > 0 || resendMutation.isPending || !email}
                onClick={handleResend}
                className="type-label-md font-semibold text-hisabi-teal underline-offset-2 hover:text-hisabi-teal-container hover:underline disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-hisabi-outline disabled:opacity-60 disabled:hover:text-hisabi-outline disabled:hover:no-underline"
              >
                {resendMutation.isPending ? t('resendSending') : t('resend')}
              </button>
              <span className="type-label-md rounded bg-hisabi-secondary-fixed/30 px-hisabi-sm py-0.5 font-semibold text-hisabi-secondary tabular-nums">
                {secondsLeft > 0 ? formatTimer(secondsLeft) : '00:00'}
              </span>
            </div>
          </div>

          <AuthSubmitButton
            pending={verifyMutation.isPending}
            disabled={!email}
          >
            {t('verify')}
          </AuthSubmitButton>
        </form>

        <div className="mt-hisabi-xl text-center">
          <Link
            href="/login"
            className="type-label-md text-hisabi-teal hover:text-hisabi-teal-container group inline-flex cursor-pointer items-center gap-hisabi-xs font-semibold hover:underline"
          >
            <BackIcon
              className="size-4 shrink-0 transition-transform group-hover:-translate-x-1 rtl:group-hover:translate-x-1"
              aria-hidden
            />
            {t('backToLogin')}
          </Link>
        </div>
      </>
    </AuthSplitShell>
  )
}
