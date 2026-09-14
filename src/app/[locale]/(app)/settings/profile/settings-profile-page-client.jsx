'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Eye, EyeOff, Loader2, Lock, Map, User } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { applyDocumentLocale } from '@/components/document-locale-sync'
import { useOptionalProductTour } from '@/components/product-tour/product-tour-provider'
import {
  SettingsField,
  SettingsFormFooter,
  SettingsPageShell,
  SettingsSection,
  fieldClass,
} from '@/components/settings/settings-page-shell'
import { RequiredMark } from '@/components/ui/required-mark'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authGet, authPatch, authPost } from '@/lib/api/auth-client'
import { hasNumberOrSpecial } from '@/lib/auth/password-rules'
import { useAuthStore } from '@/stores/auth-store'

const PROFILE_QUERY_KEY = ['account', 'profile']

const NOTIFY_TOGGLES = [
  'notifyZatca',
  'notifyHr',
  'notifySalesOps',
  'notifyTeam',
]

function defaultToggleState() {
  return Object.fromEntries(NOTIFY_TOGGLES.map((key) => [key, true]))
}

export function SettingsProfilePageClient() {
  const t = useTranslations('Settings')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const productTour = useOptionalProductTour()

  const { data, isPending } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => authGet('/account/profile'),
  })

  const profile = data?.profile

  const [name, setName] = useState('')
  const [preferredLocale, setPreferredLocale] = useState('en')
  const [toggles, setToggles] = useState(defaultToggleState)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    if (!profile) return
    setName(profile.name ?? '')
    setPreferredLocale(profile.preferredLocale ?? locale)
    setToggles(
      Object.fromEntries(
        NOTIFY_TOGGLES.map((key) => [key, profile[key] !== false]),
      ),
    )
  }, [profile, locale])

  const saveMutation = useMutation({
    mutationFn: () =>
      authPatch('/account/profile', {
        name: name.trim(),
        preferredLocale,
        ...toggles,
      }),
    onSuccess: (res) => {
      toast.success(t('saved'))
      queryClient.setQueryData(PROFILE_QUERY_KEY, res)
      if (res.user) setUser(res.user)
      if (preferredLocale !== locale) {
        applyDocumentLocale(preferredLocale)
        router.replace('/settings/profile', { locale: preferredLocale })
      }
    },
    onError: () => toast.error(t('saveFailed')),
  })

  const passwordMutation = useMutation({
    mutationFn: () =>
      authPost('/change-password', {
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      toast.success(t('passwordChanged'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordError('')
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setPasswordError(code ? tErr(code) : tErr('generic'))
    },
  })

  const lengthOk = newPassword.length >= 8
  const complexOk = hasNumberOrSpecial(newPassword)
  const matchOk = newPassword.length > 0 && newPassword === confirmPassword
  const canChangePassword =
    currentPassword.length > 0 && lengthOk && complexOk && matchOk

  if (isPending && !profile) {
    return (
      <SettingsPageShell title={t('profileTitle')} subtitle={t('profileSubtitle')}>
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-hisabi-primary" />
        </div>
      </SettingsPageShell>
    )
  }

  return (
    <SettingsPageShell title={t('profileTitle')} subtitle={t('profileSubtitle')}>
      <SettingsSection title={t('sectionAccount')} icon={User}>
        <SettingsField
          label={
            <>
              {t('fieldName')}
              <RequiredMark />
            </>
          }
        >
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('fieldNamePlaceholder')}
          />
        </SettingsField>
        <SettingsField label={t('fieldEmail')}>
          <input className={fieldClass} value={profile?.email ?? ''} disabled readOnly />
        </SettingsField>
        <SettingsField label={t('fieldPreferredLanguage')}>
          <select
            className={fieldClass}
            value={preferredLocale}
            onChange={(e) => setPreferredLocale(e.target.value)}
          >
            <option value="en">{t('languageEn')}</option>
            <option value="ar">{t('languageAr')}</option>
          </select>
        </SettingsField>
        <SettingsFormFooter>
          <AuthSubmitButton
            type="button"
            pending={saveMutation.isPending}
            disabled={!name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('save')}
          </AuthSubmitButton>
        </SettingsFormFooter>
      </SettingsSection>

      <SettingsSection title={t('sectionPassword')} icon={Lock}>
        <SettingsField
          label={
            <>
              {t('fieldCurrentPassword')}
              <RequiredMark />
            </>
          }
        >
          <div className="relative">
            <input
              className={`${fieldClass} pe-12`}
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('fieldCurrentPasswordPlaceholder')}
            />
            <button
              type="button"
              className="absolute end-3 top-1/2 -translate-y-1/2 text-hisabi-on-surface-variant"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide' : 'Show'}
            >
              {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </SettingsField>
        <SettingsField
          label={
            <>
              {t('fieldNewPassword')}
              <RequiredMark />
            </>
          }
        >
          <div className="relative">
            <input
              className={`${fieldClass} pe-12`}
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('fieldNewPasswordPlaceholder')}
            />
            <button
              type="button"
              className="absolute end-3 top-1/2 -translate-y-1/2 text-hisabi-on-surface-variant"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide' : 'Show'}
            >
              {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </SettingsField>
        <SettingsField
          label={
            <>
              {t('fieldConfirmPassword')}
              <RequiredMark />
            </>
          }
        >
          <div className="relative">
            <input
              className={`${fieldClass} pe-12`}
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('fieldConfirmPasswordPlaceholder')}
            />
            <button
              type="button"
              className="absolute end-3 top-1/2 -translate-y-1/2 text-hisabi-on-surface-variant"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? 'Hide' : 'Show'}
            >
              {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </SettingsField>
        {passwordError ? (
          <p className="type-body-sm text-hisabi-error">{passwordError}</p>
        ) : null}
        <SettingsFormFooter>
          <AuthSubmitButton
            type="button"
            pending={passwordMutation.isPending}
            disabled={!canChangePassword || passwordMutation.isPending}
            onClick={() => passwordMutation.mutate()}
          >
            {t('changePassword')}
          </AuthSubmitButton>
        </SettingsFormFooter>
      </SettingsSection>

      <SettingsSection
        title={t('sectionProductTour')}
        icon={Map}
        actions={
          <AuthSubmitButton
            type="button"
            variant="gold"
            className="w-auto px-hisabi-lg"
            disabled={!productTour}
            onClick={() => productTour?.startTour()}
          >
            {t('viewTutorial')}
          </AuthSubmitButton>
        }
      >
        <p className="type-body-md text-hisabi-on-surface-variant">
          {t('productTourHint')}
        </p>
      </SettingsSection>

      <SettingsSection title={t('sectionNotifications')} icon={Bell}>
        <ul className="space-y-hisabi-md">
          {NOTIFY_TOGGLES.map((key) => (
            <li key={key} className="flex items-center justify-between gap-hisabi-md">
              <label htmlFor={key} className="type-body-md text-hisabi-on-surface">
                {t(key)}
              </label>
              <input
                id={key}
                type="checkbox"
                className="size-5 accent-hisabi-primary"
                checked={toggles[key] !== false}
                onChange={(e) =>
                  setToggles((prev) => ({ ...prev, [key]: e.target.checked }))
                }
              />
            </li>
          ))}
        </ul>
        <SettingsFormFooter>
          <AuthSubmitButton
            type="button"
            pending={saveMutation.isPending}
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('save')}
          </AuthSubmitButton>
        </SettingsFormFooter>
      </SettingsSection>
    </SettingsPageShell>
  )
}
