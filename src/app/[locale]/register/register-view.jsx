'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AuthSplitShell } from '@/components/auth/auth-split-shell'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { LegalDocumentModal } from '@/components/legal/legal-document-modal'
import { RequiredMark } from '@/components/ui/required-mark'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { hasNumberOrSpecial } from '@/lib/auth/password-rules'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import {
  PRIVACY_SECTION_IDS,
  TERMS_SECTION_IDS,
} from '@/lib/legal/legal-section-ids'
import { hrefWithNext } from '@/lib/auth/safe-next-path'
import { Link, useRouter } from '@/i18n/navigation'

/**
 * @param {{ nextPath?: string | null }} [props]
 */
export function RegisterView({ nextPath = null }) {
  const t = useTranslations('Register')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const queryClient = useQueryClient()
  const isRtl = useIsRtl()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const SubmitArrow = isRtl ? ArrowLeft : ArrowRight

  const [name, setName] = useState('')
  const [legalDoc, setLegalDoc] = useState(
    /** @type {null | 'privacy' | 'terms'} */ (null),
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [formError, setFormError] = useState('')

  const lengthOk = password.length >= 8
  const complexOk = hasNumberOrSpecial(password)
  const matchOk = password.length > 0 && password === confirmPassword
  const showMismatch =
    confirmPassword.length > 0 && password !== confirmPassword
  const passwordOk = lengthOk && complexOk && matchOk

  const registerMutation = useMutation({
    mutationFn: () =>
      authPost('/register', {
        name,
        email,
        password,
        confirmPassword,
        termsAccepted,
      }),
    onSuccess: (data) => {
      queryClient.removeQueries({ queryKey: ['auth', 'me'] })
      const nextEmail = typeof data.email === 'string' ? data.email : email
      router.push(
        hrefWithNext(
          `/register/verify?email=${encodeURIComponent(nextEmail)}`,
          nextPath,
        ),
      )
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!termsAccepted) {
      setFormError(tErr('TERMS_REQUIRED'))
      return
    }
    if (!passwordOk) return
    registerMutation.mutate()
  }

  return (
    <>
    <AuthSplitShell namespace="Register">
      <>
        {formError ? (
          <p className="type-body-md text-hisabi-error mb-hisabi-md" role="alert">
            {formError}
          </p>
        ) : null}

        <form className="space-y-hisabi-lg" onSubmit={handleSubmit}>
          <div className="space-y-hisabi-xs">
            <label
              className="type-label-md text-hisabi-on-surface-variant block"
              htmlFor="fullName"
            >
              {t('fullNameLabel')}
              <RequiredMark />
            </label>
            <div className="relative">
              <User
                className="text-hisabi-outline pointer-events-none absolute top-1/2 start-4 size-5 -translate-y-1/2"
                aria-hidden
              />
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                placeholder={t('fullNamePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="type-body-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest py-3 ps-12 pe-4 text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset"
              />
            </div>
          </div>

          <div className="space-y-hisabi-xs">
            <label
              className="type-label-md text-hisabi-on-surface-variant block"
              htmlFor="email"
            >
              {t('emailLabel')}
              <RequiredMark />
            </label>
            <div className="relative">
              <Mail
                className="text-hisabi-outline pointer-events-none absolute top-1/2 start-4 size-5 -translate-y-1/2"
                aria-hidden
              />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="type-body-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest py-3 ps-12 pe-4 text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset"
              />
            </div>
          </div>

          <div className="space-y-hisabi-xs">
            <label
              className="type-label-md text-hisabi-on-surface-variant block"
              htmlFor="password"
            >
              {t('passwordLabel')}
              <RequiredMark />
            </label>
            <div className="relative">
              <Lock
                className="text-hisabi-outline pointer-events-none absolute top-1/2 start-4 size-5 -translate-y-1/2"
                aria-hidden
              />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="type-body-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest py-3 ps-12 pe-12 text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset"
              />
              <button
                type="button"
                className="text-hisabi-outline hover:text-hisabi-teal absolute top-1/2 end-4 -translate-y-1/2 cursor-pointer"
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
              htmlFor="confirmPassword"
            >
              {t('confirmPasswordLabel')}
              <RequiredMark />
            </label>
            <div className="relative">
              <Lock
                className="text-hisabi-outline pointer-events-none absolute top-1/2 start-4 size-5 -translate-y-1/2"
                aria-hidden
              />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('confirmPasswordPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                aria-invalid={showMismatch}
                aria-describedby={showMismatch ? 'confirmPassword-error' : undefined}
                className={
                  showMismatch
                    ? 'type-body-md focus:border-hisabi-error focus:ring-hisabi-error w-full rounded-xl border border-hisabi-error bg-hisabi-surface-container-lowest py-3 ps-12 pe-12 text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset'
                    : 'type-body-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest py-3 ps-12 pe-12 text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset'
                }
              />
              <button
                type="button"
                className="text-hisabi-outline hover:text-hisabi-teal absolute top-1/2 end-4 -translate-y-1/2 cursor-pointer"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={
                  showConfirmPassword ? t('hidePassword') : t('showPassword')
                }
              >
                {showConfirmPassword ? (
                  <EyeOff className="size-5" />
                ) : (
                  <Eye className="size-5" />
                )}
              </button>
            </div>
            {showMismatch ? (
              <p
                id="confirmPassword-error"
                className="type-body-sm text-hisabi-error"
                role="alert"
              >
                {tErr('PASSWORD_MISMATCH')}
              </p>
            ) : null}
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
            <div className="flex items-center gap-hisabi-sm transition-colors duration-150">
              {matchOk ? (
                <CheckCircle2
                  className="size-[18px] shrink-0 text-hisabi-teal transition-colors duration-150"
                  aria-hidden
                />
              ) : (
                <Circle
                  className={
                    showMismatch
                      ? 'size-[18px] shrink-0 text-hisabi-error transition-colors duration-150'
                      : 'size-[18px] shrink-0 text-hisabi-outline-variant transition-colors duration-150'
                  }
                  aria-hidden
                />
              )}
              <span
                className={
                  matchOk
                    ? 'type-body-sm text-hisabi-on-surface-variant transition-colors duration-150'
                    : showMismatch
                      ? 'type-body-sm text-hisabi-error transition-colors duration-150'
                      : 'type-body-sm text-hisabi-outline-variant transition-colors duration-150'
                }
              >
                {t('ruleMatch')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-hisabi-sm">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="accent-hisabi-gold-muted size-5 cursor-pointer rounded border border-hisabi-outline-variant outline-none ring-0 transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            />
            <label
              htmlFor="terms"
              className="type-body-sm text-hisabi-on-surface-variant cursor-pointer select-none"
            >
              {t.rich('termsAgree', {
                terms: (chunks) => (
                  <button
                    type="button"
                    className="text-hisabi-teal font-bold hover:underline"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setLegalDoc('terms')
                    }}
                  >
                    {chunks}
                  </button>
                ),
                privacy: (chunks) => (
                  <button
                    type="button"
                    className="text-hisabi-teal font-bold hover:underline"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setLegalDoc('privacy')
                    }}
                  >
                    {chunks}
                  </button>
                ),
              })}
            </label>
          </div>

          <AuthSubmitButton
            pending={registerMutation.isPending}
            disabled={!passwordOk}
            className="mt-hisabi-xl"
          >
            <>
              {t('submit')}
              <SubmitArrow className="size-5" aria-hidden />
            </>
          </AuthSubmitButton>
        </form>

        <div className="mt-hisabi-xxl pt-hisabi-xl text-center">
          <p className="type-body-md text-hisabi-on-surface-variant">
            {t('hasAccount')}{' '}
            <Link
              href={hrefWithNext('/login', nextPath)}
              className="text-hisabi-teal ms-1 font-bold hover:text-hisabi-teal-container hover:underline"
            >
              {t('signIn')}
            </Link>
          </p>
        </div>
      </>
    </AuthSplitShell>

      <LegalDocumentModal
        open={legalDoc === 'terms'}
        onOpenChange={(open) => {
          if (!open) setLegalDoc(null)
        }}
        namespace="TermsOfService"
        sectionIds={TERMS_SECTION_IDS}
      />
      <LegalDocumentModal
        open={legalDoc === 'privacy'}
        onOpenChange={(open) => {
          if (!open) setLegalDoc(null)
        }}
        namespace="PrivacyPolicy"
        sectionIds={PRIVACY_SECTION_IDS}
      />
    </>
  )
}
