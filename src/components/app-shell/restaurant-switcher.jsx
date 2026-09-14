'use client'

/* eslint-disable @next/next/no-img-element -- `/api/auth/.../logo` URLs; not a static import suitable for next/image without a custom loader */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronUp, PlusCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

import { authGet, authPatch } from '@/lib/api/auth-client'
import { companyDisplayNameForLocale } from '@/lib/business-profile/company-display-name'
import { cn } from '@/lib/utils'
import { Link, useRouter } from '@/i18n/navigation'
import { registerRestaurantSwitcherOpener } from '@/lib/product-tour/product-tour-ui-bridge'
import { useAuthStore } from '@/stores/auth-store'

function companyInitials(name) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase() || '?'
}

/**
 * @param {{
 *   profile: { id: string, companyNameAr: string, companyNameEn?: string | null, updatedAt: string, hasLogo?: boolean }
 *   listLabel: string
 * }} props
 */
function SwitcherRowAvatar({ profile, listLabel }) {
  const [broken, setBroken] = useState(false)
  const logoSrc =
    profile.hasLogo === true && !broken
      ? `/api/auth/business-profiles/${profile.id}/logo?t=${encodeURIComponent(profile.updatedAt)}`
      : null

  if (!logoSrc) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-hisabi-primary-container/15 text-[10px] font-bold text-hisabi-teal">
        {companyInitials(listLabel)}
      </span>
    )
  }

  return (
    <img
      src={logoSrc}
      alt=""
      className="size-8 shrink-0 rounded-md object-cover"
      onError={() => setBroken(true)}
    />
  )
}

/**
 * @param {{
 *   profile: { id: string, companyNameAr: string, companyNameEn?: string | null, updatedAt: string, hasLogo?: boolean }
 *   avatarLetters: string
 * }} props
 */
function SwitcherTriggerLogo({ profile, avatarLetters }) {
  const [broken, setBroken] = useState(false)
  const logoSrc =
    profile.hasLogo === true && !broken
      ? `/api/auth/business-profiles/${profile.id}/logo?t=${encodeURIComponent(profile.updatedAt)}`
      : null

  if (!logoSrc) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-hisabi-gold-muted text-[10px] font-bold text-hisabi-on-secondary-container">
        {avatarLetters}
      </div>
    )
  }

  return (
    <img
      src={logoSrc}
      alt=""
      className="size-8 shrink-0 rounded-lg object-cover"
      onError={() => setBroken(true)}
    />
  )
}

/**
 * Sidebar restaurant switcher (Hisabi BusinessProfileSwitcher pattern).
 *
 * @param {{
 *   userEmail: string
 *   userName: string
 *   hasBusinessProfile: boolean
 *   canCreateRestaurant?: boolean
 * }} props
 */
export function RestaurantSwitcher({
  userEmail,
  userName,
  hasBusinessProfile,
  canCreateRestaurant = false,
}) {
  const t = useTranslations('AppShell')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const storeUser = useAuthStore((s) => s.user)

  const shellUser =
    storeUser != null &&
    typeof storeUser.email === 'string' &&
    storeUser.email.toLowerCase() === userEmail.toLowerCase()
      ? storeUser
      : null

  const [open, setOpen] = useState(false)
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  const { data, isPending, isError } = useQuery({
    queryKey: ['auth', 'business-profiles'],
    queryFn: () => authGet('/business-profiles'),
    enabled: hasBusinessProfile === true,
  })

  const profiles = useMemo(
    () => (Array.isArray(data?.profiles) ? data.profiles : []),
    [data],
  )

  const activeBusinessProfileId =
    shellUser?.activeBusinessProfileId ??
    profiles.find((p) => p.isActive)?.id ??
    null

  const switchMutation = useMutation({
    mutationFn: (businessProfileId) =>
      authPatch('/business-profiles/active', { businessProfileId }),
    onSuccess: (res) => {
      const u = res?.user
      if (u) {
        queryClient.setQueryData(['auth', 'me'], { user: u })
        setUser(u)
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'business-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'business-profile'] })
      queryClient.invalidateQueries({ queryKey: ['menu'] })
      queryClient.invalidateQueries({ queryKey: ['pos'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setOpen(false)
      router.refresh()
    },
  })

  useEffect(() => {
    if (!open) return
    function handlePointerDown(/** @type {PointerEvent} */ e) {
      const el = rootRef.current
      if (el && !el.contains(/** @type {Node} */ (e.target))) {
        setOpen(false)
      }
    }
    function handleKeyDown(/** @type {KeyboardEvent} */ e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    registerRestaurantSwitcherOpener(() => setOpen(true))
    return () => registerRestaurantSwitcherOpener(null)
  }, [])

  const activeProfile = useMemo(() => {
    const byId = profiles.find((p) => p.id === activeBusinessProfileId)
    if (byId) return byId
    return profiles[0] ?? null
  }, [profiles, activeBusinessProfileId])

  const displayName = activeProfile
    ? companyDisplayNameForLocale(activeProfile, locale) || t('orgPlaceholder')
    : t('orgPlaceholder')
  const avatarLetters = useMemo(
    () =>
      activeProfile
        ? companyInitials(companyDisplayNameForLocale(activeProfile, locale))
        : companyInitials(userName),
    [activeProfile, userName, locale],
  )

  if (!hasBusinessProfile) {
    return null
  }

  if (isPending && profiles.length === 0) {
    return (
      <div className="flex w-full items-center justify-between rounded-xl border border-hisabi-on-primary/12 bg-hisabi-on-primary/6 px-hisabi-md py-3 text-hisabi-on-primary">
        <div className="flex min-w-0 items-center gap-hisabi-sm">
          <div className="bg-hisabi-on-primary/15 size-8 shrink-0 animate-pulse rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="bg-hisabi-on-primary/15 h-3 w-24 animate-pulse rounded" />
            <div className="bg-hisabi-on-primary/12 h-2 w-16 animate-pulse rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || profiles.length === 0) {
    return (
      <button
        type="button"
        disabled
        className="flex w-full cursor-not-allowed items-center justify-between rounded-xl border border-hisabi-on-primary/12 bg-hisabi-on-primary/6 px-hisabi-md py-3 text-start text-hisabi-on-primary opacity-95"
      >
        <div className="flex min-w-0 items-center gap-hisabi-sm">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-hisabi-gold-muted text-[10px] font-bold text-hisabi-on-secondary-container">
            {avatarLetters}
          </div>
          <div className="min-w-0 text-start">
            <p
              className="truncate text-xs font-bold leading-tight"
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
            >
              {displayName}
            </p>
            <p className="mt-0.5 text-[10px] text-hisabi-on-primary/60">
              {t('orgSwitcherLoadError')}
            </p>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-tour="restaurants-switcher"
        onClick={() => setOpen((o) => !o)}
        disabled={switchMutation.isPending}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('orgSwitcherAria')}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between rounded-xl border border-hisabi-on-primary/12 bg-hisabi-on-primary/6 px-hisabi-md py-3 text-start text-hisabi-on-primary transition-colors',
          'hover:bg-hisabi-on-primary/10',
          switchMutation.isPending && 'cursor-wait opacity-80',
        )}
      >
        <div className="flex min-w-0 items-center gap-hisabi-sm">
          {activeProfile ? (
            <SwitcherTriggerLogo
              key={activeProfile.id}
              profile={activeProfile}
              avatarLetters={avatarLetters}
            />
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-hisabi-gold-muted text-[10px] font-bold text-hisabi-on-secondary-container">
              {avatarLetters}
            </div>
          )}
          <div className="min-w-0 text-start">
            <p
              className="truncate text-xs font-bold leading-tight"
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
            >
              {displayName}
            </p>
            <p className="mt-0.5 text-[10px] text-hisabi-on-primary/60">
              {t('orgSwitcherSubtitle')}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-hisabi-on-primary/55" aria-hidden />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-hisabi-on-primary/55" aria-hidden />
        )}
      </button>

      {open ? (
        <div
          className="border-hisabi-on-primary/15 absolute start-0 top-[calc(100%+4px)] z-50 max-h-[min(320px,70vh)] w-full overflow-y-auto rounded-xl border bg-hisabi-surface-container-lowest py-1 shadow-hisabi-2 ring-1 ring-black/5"
          role="listbox"
          aria-label={t('orgSwitcherAria')}
        >
          {profiles.map((p) => {
            const selected =
              p.id === activeBusinessProfileId ||
              (activeBusinessProfileId == null && p.id === activeProfile?.id)
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={switchMutation.isPending}
                onClick={() => {
                  if (p.id === activeBusinessProfileId) {
                    setOpen(false)
                    return
                  }
                  switchMutation.mutate(p.id)
                }}
                className={cn(
                  'type-body-sm flex w-full cursor-pointer items-center gap-hisabi-sm px-hisabi-md py-2.5 text-start text-hisabi-on-surface transition-colors',
                  selected
                    ? 'bg-hisabi-teal-container/25 font-semibold text-hisabi-teal'
                    : 'hover:bg-hisabi-surface-container-high',
                  switchMutation.isPending && 'cursor-wait opacity-70',
                )}
              >
                <SwitcherRowAvatar
                  profile={p}
                  listLabel={companyDisplayNameForLocale(p, locale)}
                />
                <span
                  className="min-w-0 flex-1 truncate"
                  dir={locale === 'ar' ? 'rtl' : 'ltr'}
                >
                  {companyDisplayNameForLocale(p, locale) || t('orgPlaceholder')}
                </span>
                {selected ? (
                  <Check className="size-4 shrink-0 text-hisabi-teal" aria-hidden />
                ) : null}
              </button>
            )
          })}
          {canCreateRestaurant ? (
            <>
              <div className="border-hisabi-outline-variant/30 mx-hisabi-sm my-1 border-t" />
              <Link
                href="/restaurants/create"
                className="type-body-sm text-hisabi-teal hover:bg-hisabi-surface-container-high flex w-full items-center gap-hisabi-sm px-hisabi-md py-2.5 font-semibold transition-colors"
                onClick={() => setOpen(false)}
              >
                <PlusCircle className="size-5 shrink-0" aria-hidden />
                {t('navCreateRestaurant')}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
