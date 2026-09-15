'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { AuthSplitShell } from '@/components/auth/auth-split-shell'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useRouter } from '@/i18n/navigation'
import { authGet, authPost } from '@/lib/api/auth-client'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import { useAuthStore } from '@/stores/auth-store'
import { hasNumberOrSpecial } from '@/lib/auth/password-rules'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

export function InviteAcceptPageClient() {
  const t = useTranslations('Invite')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ name: '', password: '' })

  const { data, isPending, isError } = useQuery({
    queryKey: ['invite-accept', token],
    queryFn: () =>
      authGet(`/hr/invitations/accept?token=${encodeURIComponent(token)}`),
    enabled: Boolean(token),
    retry: false,
  })

  const acceptMutation = useMutation({
    mutationFn: () =>
      authPost('/hr/invitations/accept', {
        token,
        ...(data?.requiresSignup
          ? {
              password,
              ...(data.requiresName ? { name: name.trim() } : {}),
            }
          : {}),
      }),
    onSuccess: (res) => {
      if (res?.user) {
        queryClient.setQueryData(['auth', 'me'], { user: res.user })
        setUser(res.user)
      }
      router.push(getPostAuthLandingPath(res?.user))
    },
    onError: (err) => {
      const code = err?.code
      if (code === 'WRONG_ACCOUNT' || code === 'UNAUTHORIZED') {
        router.push(
          `/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`,
        )
        return
      }
      setFormError(code && tErr.has(code) ? tErr(code) : t('inviteAcceptError'))
      toastAuthApiError(t, err)
    },
  })

  if (!token) {
    return (
      <AuthSplitShell namespace="Invite">
        <p className="type-body-md text-hisabi-error">{t('inviteInvalid')}</p>
      </AuthSplitShell>
    )
  }

  if (isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-hisabi-primary" aria-hidden />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <AuthSplitShell namespace="Invite">
        <p className="type-body-md text-hisabi-error">{t('inviteInvalid')}</p>
      </AuthSplitShell>
    )
  }

  return (
    <AuthSplitShell namespace="Invite">
      <div className="space-y-hisabi-lg">
        <p className="type-body-md text-hisabi-on-surface-variant">
          {t('inviteAcceptDescription', {
            company: data.companyName,
            role: data.roleName,
          })}
        </p>

        {formError ? (
          <p className="type-body-md text-hisabi-error" role="alert">
            {formError}
          </p>
        ) : null}

        {data.requiresSignup ? (
          <form
            className="space-y-hisabi-md"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              setFormError('')
              const next = { name: '', password: '' }
              if (data.requiresName && !name.trim()) {
                next.name = tErr('NAME_REQUIRED')
              }
              if (
                !password ||
                password.length < 8 ||
                !hasNumberOrSpecial(password)
              ) {
                next.password = tErr('WEAK_PASSWORD')
              }
              if (next.name || next.password) {
                setFieldErrors(next)
                scrollAfterFieldValidation()
                return
              }
              setFieldErrors({ name: '', password: '' })
              acceptMutation.mutate()
            }}
          >
            {data.requiresName ? (
              <div>
                <label
                  className="type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block"
                  htmlFor="invite-name"
                >
                  {t('nameLabel')}
                  <RequiredMark />
                </label>
                <input
                  id="invite-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (fieldErrors.name) {
                      setFieldErrors((prev) => ({ ...prev, name: '' }))
                    }
                  }}
                  className={cn(
                    fieldClass,
                    fieldErrors.name && 'border-hisabi-error',
                  )}
                  placeholder={t('namePlaceholder')}
                  aria-invalid={fieldErrors.name ? true : undefined}
                  aria-describedby={
                    fieldErrors.name ? 'invite-name-error' : undefined
                  }
                />
                {fieldErrors.name ? (
                  <p
                    id="invite-name-error"
                    className="type-body-sm text-hisabi-error mt-1"
                    role="alert"
                  >
                    {fieldErrors.name}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div>
              <label
                className="type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block"
                htmlFor="invite-password"
              >
                {t('passwordLabel')}
                <RequiredMark />
              </label>
              <div className="relative">
                <input
                  id="invite-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: '' }))
                    }
                  }}
                  className={cn(
                    fieldClass,
                    'pe-12',
                    fieldErrors.password && 'border-hisabi-error',
                  )}
                  placeholder={t('passwordPlaceholder')}
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={
                    fieldErrors.password ? 'invite-password-error' : undefined
                  }
                />
                <button
                  type="button"
                  className="text-hisabi-outline hover:text-hisabi-primary absolute top-1/2 end-3 -translate-y-1/2 cursor-pointer"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? t('hidePassword') : t('showPassword')
                  }
                >
                  {showPassword ? (
                    <EyeOff className="size-5" aria-hidden />
                  ) : (
                    <Eye className="size-5" aria-hidden />
                  )}
                </button>
              </div>
              {fieldErrors.password ? (
                <p
                  id="invite-password-error"
                  className="type-body-sm text-hisabi-error mt-1"
                  role="alert"
                >
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>
            <AuthSubmitButton type="submit" pending={acceptMutation.isPending}>
              {t('acceptInviteCta')}
            </AuthSubmitButton>
          </form>
            ) : (
              <div className="space-y-hisabi-md">
                {data.isLoggedIn &&
                data.loggedInEmail?.toLowerCase() === data.email?.toLowerCase() ? (
                  <AuthSubmitButton
                    type="button"
                    pending={acceptMutation.isPending}
                    onClick={() => {
                      setFormError('')
                      acceptMutation.mutate()
                    }}
                  >
                    {t('acceptInviteCta')}
                  </AuthSubmitButton>
                ) : (
                  <div className="space-y-hisabi-md">
                    <p className="type-body-md text-hisabi-on-surface-variant">
                      {t('inviteLoginRequired')}
                    </p>
                    <AuthSubmitButton
                      type="button"
                      onClick={() => {
                        router.push(
                          `/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`,
                        )
                      }}
                    >
                      {t('goToLoginCta')}
                    </AuthSubmitButton>
                  </div>
                )}
              </div>
            )}
      </div>
    </AuthSplitShell>
  )
}
