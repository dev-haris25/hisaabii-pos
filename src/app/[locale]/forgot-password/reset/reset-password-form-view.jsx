'use client'

import { useMutation } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { AppLoader } from '@/components/app-loader'
import { AuthSplitShell } from '@/components/auth/auth-split-shell'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { hasNumberOrSpecial } from '@/lib/auth/password-rules'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import {
  clearForgotPasswordPendingEmail,
  getForgotPasswordPendingEmail,
  setForgotPasswordPendingEmail,
} from '@/lib/auth/forgot-password-flow-storage'
import { Link, usePathname, useRouter } from '@/i18n/navigation'

export function ResetPasswordFormView() {
  const t = useTranslations('PasswordReset')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [ready, setReady] = useState(false)

  const isRtl = useIsRtl()
  const BackIcon = isRtl ? ArrowRight : ArrowLeft
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [formError, setFormError] = useState('')

  const lengthOk = password.length >= 8
  const complexOk = hasNumberOrSpecial(password)
  const matchOk = password.length > 0 && password === confirm
  const canSubmit = lengthOk && complexOk && matchOk && Boolean(email)

  const fieldClassName =
    'type-body-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest py-3 pe-12 ps-4 text-hisabi-on-surface outline-none transition-all placeholder:text-hisabi-on-surface-variant/40 focus:ring-2 focus:ring-inset'

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate email from query/sessionStorage once */
  useEffect(() => {
    const fromQuery = (searchParams.get('email') || '').trim().toLowerCase()
    if (fromQuery) {
      setForgotPasswordPendingEmail(fromQuery)
      router.replace(pathname)
      setEmail(fromQuery)
      setReady(true)
      return
    }
    setEmail(getForgotPasswordPendingEmail())
    setReady(true)
  }, [searchParams, router, pathname])
  /* eslint-enable react-hooks/set-state-in-effect */

  const resetMutation = useMutation({
    mutationFn: () => authPost('/reset-password', { email, password }),
    onSuccess: () => {
      clearForgotPasswordPendingEmail()
      router.push('/login')
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
    if (!canSubmit) return
    resetMutation.mutate()
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-hisabi-background">
        <AppLoader />
      </div>
    )
  }

  return (
    <AuthSplitShell namespace="PasswordReset" showHeaderWordmark>
      <>
        {!email ? (
          <p className="type-body-md text-hisabi-error mb-hisabi-md" role="alert">
            {tErr('MISSING_EMAIL')}
          </p>
        ) : null}

        {formError ? (
          <p className="type-body-md text-hisabi-error mb-hisabi-md" role="alert">
            {formError}
          </p>
        ) : null}

        <form className="space-y-hisabi-lg" onSubmit={handleSubmit}>
          <div className="space-y-hisabi-xs">
            <label
              className="type-label-md text-hisabi-on-surface-variant block"
              htmlFor="new-password"
            >
              {t('newPasswordLabel')}
            </label>
            <div className="relative">
              <input
                id="new-password"
                name="newPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('newPasswordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClassName}
              />
              <button
                type="button"
                className="text-hisabi-on-surface-variant/60 hover:text-hisabi-teal absolute top-1/2 end-4 -translate-y-1/2 cursor-pointer transition-all duration-150 active:scale-95"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword ? t('hidePassword') : t('showPassword')
                }
              >
                {showPassword ? (
                  <EyeOff className="size-5" />
                ) : (
                  <Eye className="size-5" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-hisabi-xs">
            <label
              className="type-label-md text-hisabi-on-surface-variant block"
              htmlFor="confirm-password"
            >
              {t('confirmPasswordLabel')}
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('confirmPasswordPlaceholder')}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={fieldClassName}
              />
              <button
                type="button"
                className="text-hisabi-on-surface-variant/60 hover:text-hisabi-teal absolute top-1/2 end-4 -translate-y-1/2 cursor-pointer transition-all duration-150 active:scale-95"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={
                  showConfirm ? t('hidePassword') : t('showPassword')
                }
              >
                {showConfirm ? (
                  <EyeOff className="size-5" />
                ) : (
                  <Eye className="size-5" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-hisabi-sm py-hisabi-sm">
            <div className="flex items-center gap-hisabi-sm transition-colors duration-150">
              {lengthOk ? (
                <CheckCircle2
                  className="size-[18px] shrink-0 text-hisabi-teal transition-colors duration-150"
                  aria-hidden
                />
              ) : (
                <Circle
                  className="size-[18px] shrink-0 text-hisabi-outline-variant transition-colors duration-150"
                  aria-hidden
                />
              )}
              <span
                className={
                  lengthOk
                    ? 'type-body-sm text-hisabi-on-surface-variant transition-colors duration-150'
                    : 'type-body-sm text-hisabi-outline-variant transition-colors duration-150'
                }
              >
                {t('ruleLength')}
              </span>
            </div>
            <div className="flex items-center gap-hisabi-sm transition-colors duration-150">
              {complexOk ? (
                <CheckCircle2
                  className="size-[18px] shrink-0 text-hisabi-teal transition-colors duration-150"
                  aria-hidden
                />
              ) : (
                <Circle
                  className="size-[18px] shrink-0 text-hisabi-outline-variant transition-colors duration-150"
                  aria-hidden
                />
              )}
              <span
                className={
                  complexOk
                    ? 'type-body-sm text-hisabi-on-surface-variant transition-colors duration-150'
                    : 'type-body-sm text-hisabi-outline-variant transition-colors duration-150'
                }
              >
                {t('ruleComplex')}
              </span>
            </div>
          </div>

          <AuthSubmitButton
            pending={resetMutation.isPending}
            disabled={!canSubmit}
          >
            {t('submit')}
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
