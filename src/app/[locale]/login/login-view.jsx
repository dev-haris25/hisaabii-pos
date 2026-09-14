'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AuthSplitShell } from '@/components/auth/auth-split-shell'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { hrefWithNext } from '@/lib/auth/safe-next-path'
import { Link, useRouter } from '@/i18n/navigation'
import { useAuthStore } from '@/stores/auth-store'

/** @param {{ nextPath?: string | null }} props */
export function LoginView({ nextPath = null }) {
  const t = useTranslations('Login')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const isRtl = useIsRtl()
  const [showPassword, setShowPassword] = useState(false)
  const SubmitArrow = isRtl ? ArrowLeft : ArrowRight

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [formError, setFormError] = useState('')

  const login = useMutation({
    mutationFn: () => authPost('/login', { email, password, remember }),
    onSuccess: (data) => {
      const user = data.user
      if (user) {
        queryClient.setQueryData(['auth', 'me'], { user })
        setUser(user)
      }
      router.push(getPostAuthLandingPath(user, nextPath))
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      if (code === 'EMAIL_NOT_VERIFIED') {
        router.push(
          hrefWithNext(
            `/register/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`,
            nextPath,
          ),
        )
        return
      }
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    login.mutate()
  }

  return (
    <AuthSplitShell namespace="Login">
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
            <div className="flex items-center justify-between">
              <label
                className="type-label-md text-hisabi-on-surface-variant block"
                htmlFor="password"
              >
                {t('passwordLabel')}
                <RequiredMark />
              </label>
              <Link
                href="/forgot-password"
                className="type-label-sm font-semibold text-hisabi-secondary hover:underline"
              >
                {t('forgotPassword')}
              </Link>
            </div>
            <div className="relative">
              <Lock
                className="text-hisabi-outline pointer-events-none absolute top-1/2 start-4 size-5 -translate-y-1/2"
                aria-hidden
              />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
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

          <div className="flex items-center gap-hisabi-sm">
            <input
              id="remember"
              name="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-hisabi-gold-muted size-5 cursor-pointer rounded border border-hisabi-outline-variant outline-none ring-0 transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            />
            <label
              htmlFor="remember"
              className="type-body-sm text-hisabi-on-surface-variant cursor-pointer select-none"
            >
              {t('rememberMe')}
            </label>
          </div>

          <AuthSubmitButton pending={login.isPending} className="mt-hisabi-xl">
            <>
              {t('submit')}
              <SubmitArrow className="size-5" aria-hidden />
            </>
          </AuthSubmitButton>
        </form>

        <div className="mt-hisabi-xxl pt-hisabi-xl text-center">
          <p className="type-body-md text-hisabi-on-surface-variant">
            {t('noAccount')}{' '}
            <Link
              href={hrefWithNext('/register', nextPath)}
              className="text-hisabi-teal ms-1 font-bold hover:text-hisabi-teal-container hover:underline"
            >
              {t('createAccount')}
            </Link>
          </p>
        </div>
      </>
    </AuthSplitShell>
  )
}
