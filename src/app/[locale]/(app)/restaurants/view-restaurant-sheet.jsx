'use client'

import { CheckCircle2, Info, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { AppLoader } from '@/components/app-loader'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { authGet } from '@/lib/api/auth-client'
import { cn } from '@/lib/utils'
import { companyDisplayNameForLocale } from '@/lib/business-profile/company-display-name'

const SHEET_TRANSITION_MS = 300

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
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   profileId: string | null
 *   isActive?: boolean
 *   onRequestEdit?: () => void
 * }} props
 */
export function ViewRestaurantSheet({
  open,
  onOpenChange,
  profileId,
  isActive = false,
  onRequestEdit,
}) {
  const t = useTranslations('Restaurants')
  const tBp = useTranslations('BusinessProfile')
  const locale = useLocale()
  const titleId = useId()
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const [mounted, setMounted] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['auth', 'business-profile', profileId],
    queryFn: async () => {
      const d = await authGet(`/business-profiles/${profileId}`)
      return d.profile
    },
    enabled: open && typeof profileId === 'string' && profileId.length > 0,
    staleTime: 0,
  })

  function handleClose() {
    onOpenChange(false)
  }

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        setMounted(true)
        requestAnimationFrame(() => setAnimateIn(true))
      })
      return () => cancelAnimationFrame(id)
    }
    const id = requestAnimationFrame(() => setAnimateIn(false))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  useEffect(() => {
    if (!open || !animateIn) return
    const id = requestAnimationFrame(() => {
      const el = panelRef.current?.querySelector('[data-sheet-close]')
      if (el instanceof HTMLElement) el.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open, animateIn])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  /** @param {React.TransitionEvent<HTMLDivElement>} e */
  function handleSheetTransitionEnd(e) {
    if (e.propertyName !== 'transform') return
    if (open) return
    setMounted(false)
  }

  useEffect(() => {
    if (open || !mounted) return
    const id = window.setTimeout(
      () => setMounted(false),
      SHEET_TRANSITION_MS + 80,
    )
    return () => window.clearTimeout(id)
  }, [open, mounted])

  const profile = data
  const logoSrc =
    profile?.hasLogo && profile?.id
      ? `/api/auth/business-profiles/${profile.id}/logo?t=${encodeURIComponent(profile.updatedAt ?? '')}`
      : null

  if (!mounted || !profileId) return null

  function taxPresetLabel(preset) {
    if (preset === 'zero') return tBp('taxZeroTitle')
    if (preset === 'exempt') return tBp('taxExemptTitle')
    return tBp('taxStandardTitle')
  }

  const zatcaCompleted =
    typeof profile?.zatcaCompleted === 'boolean'
      ? profile.zatcaCompleted
      : !profile?.zatcaOnboardingSkipped

  const showFooter = Boolean(profile) && !isPending && !isError

  return (
    <div
      className="fixed inset-0 z-[110] flex justify-end"
      role="presentation"
    >
      <button
        type="button"
        className={cn(
          'absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity ease-out',
          animateIn ? 'opacity-100' : 'opacity-0',
        )}
        style={{ transitionDuration: `${SHEET_TRANSITION_MS}ms` }}
        aria-label={t('viewCloseAria')}
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'border-hisabi-outline-variant/30 relative z-10 flex h-full w-full max-w-[calc(600px*var(--hisabi-ui-scale))] flex-col overflow-hidden border-s bg-hisabi-surface-container-lowest shadow-2xl transition-transform ease-out',
          animateIn ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ transitionDuration: `${SHEET_TRANSITION_MS}ms` }}
        onTransitionEnd={handleSheetTransitionEnd}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-hisabi-outline-variant/20 flex shrink-0 items-start justify-between gap-hisabi-md border-b py-hisabi-xl px-hisabi-md sm:px-hisabi-lg md:px-hisabi-xl">
          <div>
            <h2 id={titleId} className="type-headline-md text-hisabi-on-surface">
              {t('viewSheetTitle')}
            </h2>
          </div>
          <button
            type="button"
            data-sheet-close
            onClick={handleClose}
            className="text-hisabi-outline hover:bg-hisabi-surface-container-low cursor-pointer rounded-full p-2 transition-colors"
            aria-label={t('viewCloseAria')}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto py-hisabi-xl px-hisabi-md sm:px-hisabi-lg md:px-hisabi-xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {isPending ? (
              <div className="flex min-h-[40vh] items-center justify-center py-hisabi-xxl">
                <AppLoader />
              </div>
            ) : isError ? (
              <div className="space-y-hisabi-md text-center">
                <p className="type-body-md text-hisabi-error" role="alert">
                  {t('loadDetailError')}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2.5 font-semibold transition-colors"
                >
                  {t('retryLoad')}
                </button>
              </div>
            ) : profile ? (
              <div className="space-y-hisabi-xxl">
                <section>
                  <div className="mb-hisabi-lg flex items-center gap-hisabi-sm">
                    <Info
                      className="size-5 shrink-0 text-hisabi-primary-container"
                      aria-hidden
                    />
                    <h3 className="type-label-md font-bold uppercase tracking-wider text-hisabi-primary-container">
                      {t('viewSectionGeneral')}
                    </h3>
                  </div>

                  <div className="mb-hisabi-xl flex flex-wrap items-center gap-hisabi-md">
                    {logoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element -- blob/API logo URLs; matches client patterns elsewhere
                      <img
                        src={logoSrc}
                        alt=""
                        className="size-16 shrink-0 rounded-xl border border-hisabi-outline-variant/30 object-cover"
                      />
                    ) : (
                      <div className="bg-hisabi-surface-container-high text-hisabi-primary flex size-16 shrink-0 items-center justify-center rounded-xl text-lg font-bold">
                        {companyInitials(
                          companyDisplayNameForLocale(profile, locale),
                        )}
                      </div>
                    )}
                    {isActive ? (
                      <span className="type-label-sm inline-flex items-center gap-1 rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-green-700">
                        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                        {t('badgeActiveRestaurant')}
                      </span>
                    ) : null}
                  </div>

                  <div
                    dir="ltr"
                    className="mb-hisabi-xl grid grid-cols-1 gap-x-hisabi-lg gap-y-hisabi-md min-[480px]:grid-cols-2"
                  >
                    <div className="min-w-0 space-y-hisabi-xs text-start">
                      <p className="type-label-sm uppercase tracking-wider text-slate-400">
                        {t('viewCompanyNameEnLabel')}
                      </p>
                      <p
                        className="type-body-md text-hisabi-on-surface"
                        dir="ltr"
                      >
                        {(profile.companyNameEn ?? '').trim() || '—'}
                      </p>
                    </div>
                    <div className="min-w-0 space-y-hisabi-xs text-left">
                      <p className="type-label-sm uppercase tracking-wider text-slate-400">
                        {t('viewCompanyNameArLabel')}
                      </p>
                      <p
                        className="type-body-md font-semibold text-hisabi-on-surface text-left"
                        dir="rtl"
                      >
                        {profile.companyNameAr}
                      </p>
                    </div>
                  </div>

                  <div
                    dir="ltr"
                    className="mb-hisabi-xl grid grid-cols-1 gap-x-hisabi-lg gap-y-hisabi-md min-[480px]:grid-cols-2"
                  >
                    <div className="min-w-0 space-y-hisabi-xs text-start">
                      <p className="type-label-sm uppercase tracking-wider text-slate-400">
                        {t('viewAddressEnLabel')}
                      </p>
                      <p
                        className="type-body-md text-hisabi-on-surface"
                        dir="ltr"
                      >
                        {(profile.addressEn ?? '').trim() || '—'}
                      </p>
                    </div>
                    <div className="min-w-0 space-y-hisabi-xs text-left">
                      <p className="type-label-sm uppercase tracking-wider text-slate-400">
                        {t('viewAddressArLabel')}
                      </p>
                      <p
                        className="type-body-md text-hisabi-on-surface text-left"
                        dir="rtl"
                      >
                        {profile.addressAr}
                      </p>
                    </div>
                  </div>

                  <div dir="ltr" className="mb-hisabi-xl space-y-hisabi-xs text-start">
                    <p className="type-label-sm uppercase tracking-wider text-slate-400">
                      {t('viewShortAddressLabel')}
                    </p>
                    <p className="type-body-md text-hisabi-on-surface" dir="ltr">
                      {(profile.shortAddress ?? '').trim() || '—'}
                    </p>
                  </div>

                  <div dir="ltr" className="mb-hisabi-xl space-y-hisabi-xs text-start">
                    <p className="type-label-sm uppercase tracking-wider text-slate-400">
                      {t('viewSecondaryNumberLabel')}
                    </p>
                    <p className="type-body-md text-hisabi-on-surface" dir="ltr">
                      {(profile.secondaryNumber ?? '').trim() || '—'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-x-hisabi-lg gap-y-hisabi-xl sm:grid-cols-2">
                    <div className="space-y-hisabi-xs">
                      <p className="type-label-sm uppercase tracking-wider text-slate-400">
                        {tBp('vatLabel')}
                      </p>
                      <p
                        dir="ltr"
                        className="type-body-md text-hisabi-on-surface inline-block"
                      >
                        {profile.vatNumber}
                      </p>
                    </div>
                    <div className="space-y-hisabi-xs">
                      <p className="type-label-sm uppercase tracking-wider text-slate-400">
                        {tBp('crLabel')}
                      </p>
                      <p
                        dir="ltr"
                        className="type-body-md text-hisabi-on-surface inline-block"
                      >
                        {profile.crNumber}
                      </p>
                    </div>
                    <div className="space-y-hisabi-xs sm:col-span-2">
                      <p className="type-label-sm uppercase tracking-wider text-slate-400">
                        {tBp('taxSettingsLabel')}
                      </p>
                      <p className="type-body-md text-hisabi-on-surface">
                        {taxPresetLabel(profile.defaultVatPreset)}
                      </p>
                    </div>
                    <div className="space-y-hisabi-xs sm:col-span-2">
                      <p className="type-label-sm uppercase tracking-wider text-slate-400">
                        {t('colZatca')}
                      </p>
                      <div>
                        <span
                          className={cn(
                            'type-label-sm inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest',
                            zatcaCompleted
                              ? 'border-green-100 bg-green-50 text-green-700'
                              : 'border-amber-200 bg-amber-50 text-amber-900',
                          )}
                        >
                          {zatcaCompleted
                            ? t('zatcaStatusCompleted')
                            : t('zatcaStatusPending')}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </div>

          {showFooter ? (
            <div
              className={cn(
                'flex shrink-0 flex-col-reverse gap-hisabi-md border-t border-slate-100 bg-slate-50 py-hisabi-xl px-hisabi-md sm:px-hisabi-lg md:px-hisabi-xl',
                onRequestEdit && 'min-[425px]:grid min-[425px]:grid-cols-2',
              )}
            >
              <button
                type="button"
                onClick={handleClose}
                className={cn(
                  'type-label-md border-hisabi-outline text-hisabi-on-surface-variant hover:bg-hisabi-surface-container-low inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-2 px-hisabi-lg font-semibold transition-all active:scale-[0.98]',
                )}
              >
                {t('closeSheet')}
              </button>
              {onRequestEdit ? (
                <AuthSubmitButton
                  type="button"
                  variant="gold"
                  className="min-h-0 w-full min-w-0 py-4"
                  onClick={() => onRequestEdit()}
                >
                  <span className="flex items-center justify-center gap-hisabi-sm">
                    {t('editRestaurant')}
                  </span>
                </AuthSubmitButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
