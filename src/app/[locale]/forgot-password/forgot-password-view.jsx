'use client'

import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AuthSplitShell } from '@/components/auth/auth-split-shell'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { setForgotPasswordPendingEmail } from '@/lib/auth/forgot-password-flow-storage'
import { Link, useRouter } from '@/i18n/navigation'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPasswordView() {
  const t = useTranslations('ResetPassword')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const isRtl = useIsRtl()
  const BackIcon = isRtl ? ArrowRight : ArrowLeft
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [emailError, setEmailError] = useState('')

  const forgotMutation = useMutation({
    mutationFn: () => authPost('/forgot-password', { email }),
    onSuccess: () => {
      setFormError('')
      setForgotPasswordPendingEmail(email)
      router.push('/forgot-password/verify')
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!email.trim()) {
      setEmailError(tErr('EMAIL_REQUIRED'))
      scrollAfterFieldValidation()
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(tErr('VALIDATION_ERROR'))
      scrollAfterFieldValidation()
      return
    }
    setEmailError('')
    forgotMutation.mutate()
  }

  return (
    <AuthSplitShell namespace="ResetPassword" showHeaderWordmark={false}>
      <>
        <form className="space-y-hisabi-lg" onSubmit={handleSubmit} noValidate>
          {formError ? (
            <p className="type-body-md text-hisabi-error mb-hisabi-md" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="space-y-hisabi-xs">
            <label
              className="type-label-md text-hisabi-on-surface-variant block"
              htmlFor="reset-email"
            >
              {t('emailLabel')}
            </label>
            <div className="relative">
              <Mail
                className="text-hisabi-outline pointer-events-none absolute top-1/2 start-4 size-5 -translate-y-1/2"
                aria-hidden
              />
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError('')
                }}
                className={cn(
                  'type-body-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest py-3 ps-12 pe-4 text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset',
                  emailError &&
                    'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error',
                )}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'reset-email-error' : undefined}
              />
            </div>
            {emailError ? (
              <p
                id="reset-email-error"
                className="type-body-sm text-hisabi-error"
                role="alert"
              >
                {emailError}
              </p>
            ) : null}
          </div>

          <AuthSubmitButton pending={forgotMutation.isPending}>
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
