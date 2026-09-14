'use client'

/* eslint-disable @next/next/no-img-element -- company logo previews (blob + `/api/auth/.../logo`) */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Upload,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Suspense, useEffect, useRef, useState } from 'react'

import { ZatcaOnboardingView } from '@/app/[locale]/zatca-onboarding/zatca-onboarding-view'
import { useCompanyInvoiceAddressFields } from '@/hooks/use-company-invoice-address-fields'
import {
  buildBusinessProfileApiBody,
  buildBusinessProfileConfirmSnapshot,
  validateBusinessProfileInvoiceFields,
} from '@/lib/business-profile/validate-business-profile-invoice'

import { AppLoader } from '@/components/app-loader'
import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import { AuthPageFooter } from '@/components/auth/auth-page-footer'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { AuthApiError, authGet, authPatch, authPost } from '@/lib/api/auth-client'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import Image from 'next/image'
import {
  CR_NUMBER_MAX_DIGITS,
  VAT_NUMBER_MAX_DIGITS,
  digitsOnlyLimited,
} from '@/lib/business-registration-ids'
import { cn } from '@/lib/utils'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { parseSafeNextPath } from '@/lib/auth/safe-next-path'
import { useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import {
  COMPANY_LOGO_MIME_TYPES,
  MAX_COMPANY_LOGO_BYTES,
} from '@/lib/auth/company-logo'
import { useAuthStore } from '@/stores/auth-store'
import { BilingualCompanyFields } from '@/components/business-profile/bilingual-company-fields'
import { BilingualInvoiceFieldsConfirmModal } from '@/components/business-profile/bilingual-invoice-fields-confirm-modal'
import { RequiredMark } from '@/components/ui/required-mark'
import { useBilingualFieldOrigin } from '@/lib/i18n/use-bilingual-field-origin'

/**
 * @param {File} file
 */
function mimeFromLogoFile(file) {
  const t = file.type
  if (COMPANY_LOGO_MIME_TYPES.includes(t)) return t
  const n = file.name.toLowerCase()
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.gif')) return 'image/gif'
  if (n.endsWith('.webp')) return 'image/webp'
  return ''
}

/**
 * @param {File} file
 * @returns {Promise<{ base64: string, logoMimeType: typeof COMPANY_LOGO_MIME_TYPES[number] }>}
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const mime = mimeFromLogoFile(file)
    if (!mime) {
      reject(new Error('invalid logo type'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      const comma = dataUrl.indexOf(',')
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
      resolve({ base64, logoMimeType: mime })
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** Custom VAT % complete and in [0, 100]. */
function isValidCustomVatPercent(value) {
  const v = value.trim()
  if (!v || v === '.') return false
  const n = Number.parseFloat(v)
  if (Number.isNaN(n)) return false
  return n >= 0 && n <= 100
}

const fieldClass =
  'type-body-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset'

/**
 * @typedef {'standard' | 'zero' | 'exempt'} DefaultVatChoice
 */

/**
 * Tax preset tiles — Create Organization mock styling; `disabled` greys out presets when custom rate is on.
 */
function taxSettingCardClass(active, disabled) {
  return cn(
    'relative flex flex-col rounded-xl border-2 p-5 text-start transition-colors',
    disabled
      ? 'cursor-not-allowed border-hisabi-outline-variant/40 bg-hisabi-surface-container-lowest opacity-50'
      : cn(
          'cursor-pointer',
          active
            ? 'border-hisabi-teal bg-hisabi-teal-container/5'
            : 'hover:border-hisabi-teal-container/30 border-hisabi-outline-variant/40 bg-hisabi-surface-container-lowest',
        ),
  )
}

function taxOptionTitleClass(active) {
  return cn(
    'mb-1 text-sm font-bold',
    active ? 'text-hisabi-teal' : 'text-hisabi-on-surface',
  )
}

/**
 * @param {{ mode?: 'onboard' | 'create', embedded?: boolean }} [props]
 */
export function BusinessProfileView({ mode = 'onboard', embedded = false }) {
  const isCreateMode = mode === 'create'
  const t = useTranslations('BusinessProfile')
  const tB = useTranslations('BilingualInvoiceCompany')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = parseSafeNextPath(searchParams.get('next'))
  const fromZatca = searchParams.get('from') === 'zatca'
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const isRtl = useIsRtl()
  const ContinueIcon = isRtl ? ArrowLeft : ArrowRight
  const logoInputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const hydratedRef = useRef(false)

  const [flowPhase, setFlowPhase] = useState(
    /** @type {'organization' | 'zatca'} */ ('organization'),
  )
  const [draftBusinessProfileId, setDraftBusinessProfileId] = useState(
    /** @type {string | null} */ (null),
  )

  const {
    data: savedProfile,
    // Use isLoading (pending + fetching), not isPending — disabled create-mode
    // queries stay pending forever in TanStack Query v5.
    isLoading: profileLoading,
    isError: profileQueryError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ['auth', 'business-profile'],
    queryFn: async () => {
      const d = await authGet('/business-profile')
      return d.profile
    },
    enabled: !isCreateMode,
    /** Refetch when returning from create-organization / active profile changes */
    staleTime: 0,
  })

  const {
    data: fallbackProfile,
    isLoading: fallbackProfileLoading,
  } = useQuery({
    queryKey: ['auth', 'business-profile', activeBusinessProfileId],
    queryFn: async () => {
      const d = await authGet(`/business-profiles/${activeBusinessProfileId}`)
      return d.profile
    },
    enabled: Boolean(
      !isCreateMode && fromZatca && !savedProfile && activeBusinessProfileId,
    ),
    staleTime: 0,
  })

  const profileToHydrate = savedProfile ?? fallbackProfile
  const hydratingProfile =
    profileLoading || Boolean(fromZatca && !profileToHydrate && fallbackProfileLoading)

  const [submitError, setSubmitError] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({
    companyNameAr: '',
    crNumber: '',
    vatNumber: '',
    districtAr: '',
    cityAr: '',
    streetAr: '',
    postalCode: '',
    buildingNumber: '',
    customVatPercent: '',
  })

  const [companyNameEn, setCompanyNameEn] = useState('')
  const bilingualFieldOrigin = useBilingualFieldOrigin()
  const [companyNameAr, setCompanyNameAr] = useState('')
  const {
    streetEn,
    setStreetEn,
    streetAr,
    setStreetAr,
    districtEn,
    setDistrictEn,
    districtAr,
    setDistrictAr,
    cityEn,
    setCityEn,
    cityAr,
    setCityAr,
    buildingNumber,
    setBuildingNumber,
    secondaryNumber,
    setSecondaryNumber,
    postalCode,
    setPostalCode,
    shortAddress,
    setShortAddress,
    composedInvoiceAddressAr,
    composedInvoiceAddressEn,
    hydrateAddressFromProfile,
    applyAddressFromConfirm,
  } = useCompanyInvoiceAddressFields()
  const [crNumber, setCrNumber] = useState('')
  const [vatNumber, setVatNumber] = useState('')

  const [defaultVat, setDefaultVat] = useState(
    /** @type {DefaultVatChoice} */ ('standard'),
  )
  const useCustomRate = false
  const customVatPercent = ''

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmModalKey, setConfirmModalKey] = useState(0)
  const [confirmSnapshot, setConfirmSnapshot] = useState({
    companyNameEn: '',
    companyNameAr: '',
    addressEn: '',
    addressAr: '',
  })
  const [logoFile, setLogoFile] = useState(/** @type {File | null} */ (null))
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(
    /** @type {string | null} */ (null),
  )
  const [logoUploadError, setLogoUploadError] = useState(false)
  const [logoRemovedByUser, setLogoRemovedByUser] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect -- createObjectURL/revoke lifecycle; preview must clear when file is removed */
  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(logoFile)
    setLogoPreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [logoFile])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- one-time form init when react-query profile resolves */
  useEffect(() => {
    if (hydratingProfile) return
    if (hydratedRef.current) return
    const p = profileToHydrate
    if (p) {
      setCompanyNameEn(p.companyNameEn ?? '')
      setCompanyNameAr(p.companyNameAr ?? '')
      hydrateAddressFromProfile(p)
      setCrNumber(digitsOnlyLimited(String(p.crNumber ?? ''), CR_NUMBER_MAX_DIGITS))
      setVatNumber(digitsOnlyLimited(String(p.vatNumber ?? ''), VAT_NUMBER_MAX_DIGITS))
      setDefaultVat(
        p.defaultVatPreset === 'zero' || p.defaultVatPreset === 'exempt'
          ? p.defaultVatPreset
          : 'standard',
      )
      hydratedRef.current = true
      return
    }
    // Back-from-ZATCA must wait for the saved restaurant — do not lock an empty form.
    if (fromZatca) return
    hydratedRef.current = true
  }, [
    fromZatca,
    hydratingProfile,
    profileToHydrate,
    hydrateAddressFromProfile,
  ])
  /* eslint-enable react-hooks/set-state-in-effect */

  const presetsDisabled = false

  const showServerLogo =
    Boolean(profileToHydrate?.hasLogo) && !logoRemovedByUser && !logoFile

  const serverLogoSrc =
    profileToHydrate?.id != null
      ? `/api/auth/business-profiles/${profileToHydrate.id}/logo?t=${encodeURIComponent(profileToHydrate.updatedAt ?? '')}`
      : '/api/auth/business-profile/logo'

  const saveMutation = useMutation({
    /**
     * @param {null | { companyNameEn: string, companyNameAr: string, addressEn: string, addressAr: string }} invoiceFields
     */
    mutationFn: async (invoiceFields) => {
      const payload = buildBusinessProfileApiBody(invoiceFields, {
        companyNameEn,
        companyNameAr,
        streetEn,
        streetAr,
        districtEn,
        districtAr,
        cityEn,
        cityAr,
        buildingNumber,
        secondaryNumber,
        postalCode,
        shortAddress,
        composedInvoiceAddressAr,
        composedInvoiceAddressEn,
        crNumber,
        vatNumber,
        defaultVat,
        useCustomRate,
        customVatPercent,
      })

      /** @type {Record<string, unknown>} */
      let body = { ...payload }
      if (logoFile) {
        const { base64, logoMimeType } = await readFileAsBase64(logoFile)
        body = {
          ...payload,
          logoBase64: base64,
          logoMimeType,
          preserveLogo: false,
        }
      } else if (
        (profileToHydrate?.hasLogo || Boolean(draftBusinessProfileId)) &&
        !logoRemovedByUser
      ) {
        body = { ...payload, preserveLogo: true }
      } else {
        body = {
          ...payload,
          preserveLogo: false,
          logoBase64: null,
          logoMimeType: null,
        }
      }

      // Create-another-restaurant: first save POSTs create; back-from-ZATCA
      // edits PATCH the restaurant already created.
      if (isCreateMode && draftBusinessProfileId) {
        return authPatch(`/business-profiles/${draftBusinessProfileId}`, body)
      }
      if (isCreateMode) {
        return authPost('/business-profiles/create', body)
      }
      return authPost('/business-profiles', body)
    },
    onSuccess: (data) => {
      const u = data?.user
      if (u) {
        queryClient.setQueryData(['auth', 'me'], { user: u })
        setUser(u)
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'business-profile'] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'business-profiles'] })

      // Hisabi multi-company pattern: stay in app shell and show ZATCA phase.
      if (isCreateMode) {
        if (typeof data?.profileId === 'string') {
          setDraftBusinessProfileId(data.profileId)
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setFlowPhase('zatca')
        return
      }

      setRedirecting(true)
      window.scrollTo(0, 0)
      router.push(getPostAuthLandingPath(u, nextPath))
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setSubmitError(code ? tErr(code) : tErr('generic'))
    },
  })

  const submitPending = saveMutation.isPending

  function handleLogoChange(e) {
    const f = e.target.files?.[0]
    setLogoUploadError(false)
    if (!f) {
      setLogoFile(null)
      return
    }
    const okType =
      COMPANY_LOGO_MIME_TYPES.includes(f.type) ||
      /\.(png|jpe?g|gif|webp)$/i.test(f.name)
    if (!okType || f.size > MAX_COMPANY_LOGO_BYTES) {
      setLogoFile(null)
      setLogoUploadError(true)
      e.target.value = ''
      return
    }
    setLogoRemovedByUser(false)
    setLogoFile(f)
  }

  function handleRemoveLogo() {
    setLogoFile(null)
    setLogoRemovedByUser(true)
    setLogoUploadError(false)
    if (logoInputRef.current) {
      logoInputRef.current.value = ''
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    if (submitPending) return

    const { ok, errors } = validateBusinessProfileInvoiceFields(
      {
        companyNameAr,
        companyNameEn,
        composedInvoiceAddressAr,
        composedInvoiceAddressEn,
        streetAr,
        districtAr,
        cityAr,
        streetEn,
        districtEn,
        cityEn,
        buildingNumber,
        postalCode,
        crNumber,
        vatNumber,
        useCustomRate,
        customVatPercent,
        requireTaxIds: true,
      },
      { tB, tTax: t },
    )
    if (!ok) {
      setFieldErrors(errors)
      scrollAfterFieldValidation()
      return
    }
    setFieldErrors({
      companyNameAr: '',
      crNumber: '',
      vatNumber: '',
      districtAr: '',
      cityAr: '',
      streetAr: '',
      postalCode: '',
      buildingNumber: '',
      customVatPercent: '',
    })

    if (bilingualFieldOrigin.autoTranslatedPairs.length > 0) {
      setConfirmModalKey((k) => k + 1)
      setConfirmSnapshot(
        buildBusinessProfileConfirmSnapshot({
          companyNameEn,
          companyNameAr,
          streetEn,
          streetAr,
          districtEn,
          districtAr,
          cityEn,
          cityAr,
          buildingNumber,
          postalCode,
          composedInvoiceAddressAr,
          composedInvoiceAddressEn,
        }),
      )
      setConfirmOpen(true)
      return
    }
    saveMutation.mutate(null)
  }

  function handleConfirmModalSave(
    /** @type {import('@/components/business-profile/bilingual-invoice-fields-confirm-modal').BilingualSnapshot} */ next,
  ) {
    setCompanyNameEn(next.companyNameEn)
    setCompanyNameAr(next.companyNameAr)
    applyAddressFromConfirm(next)
    setConfirmOpen(false)
    saveMutation.mutate(next)
  }

  const shellClass = embedded
    ? 'type-body-md text-hisabi-on-surface mx-auto flex w-full max-w-hisabi-container flex-col'
    : 'type-body-md text-hisabi-on-surface flex min-h-dvh flex-col bg-hisabi-background'

  const mainClass = embedded
    ? 'flex w-full flex-1 flex-col items-center py-hisabi-md'
    : 'flex flex-1 flex-col items-center justify-center px-hisabi-margin-mobile py-hisabi-xxl md:px-hisabi-margin-desktop'

  if (isCreateMode && flowPhase === 'zatca') {
    return (
      <div className={shellClass}>
        <main className={mainClass}>
          <Suspense
            fallback={
              <div className="flex min-h-[50vh] w-full items-center justify-center py-hisabi-xxl">
                <AppLoader />
              </div>
            }
          >
            <ZatcaOnboardingView
              variant="embedded"
              targetBusinessProfileId={draftBusinessProfileId}
              successHref="/restaurants"
              onBack={() => {
                setFlowPhase('organization')
              }}
            />
          </Suspense>
        </main>
      </div>
    )
  }

  return (
    <div className={shellClass}>
      {!embedded ? (
        <header className="border-hisabi-outline-variant/30 sticky top-0 z-50 border-b bg-hisabi-surface-container-lowest shadow-sm">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-hisabi-sm px-hisabi-md py-hisabi-md md:px-hisabi-lg">
            <div aria-hidden />
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
        {hydratingProfile ? (
          <div className="flex min-h-[50vh] w-full max-w-[772px] items-center justify-center py-hisabi-xxl">
            <AppLoader />
          </div>
        ) : profileQueryError ? (
          <div className="border-hisabi-outline-variant/40 w-full max-w-[772px] space-y-hisabi-md rounded-xl border bg-hisabi-surface-container-lowest p-hisabi-xl text-center shadow-sm">
            <p className="type-body-md text-hisabi-error" role="alert">
              {t('loadError')}
            </p>
            <button
              type="button"
              onClick={() => refetchProfile()}
              className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2.5 font-semibold transition-colors"
            >
              {t('tryAgain')}
            </button>
          </div>
        ) : (
        <div className="border-hisabi-outline-variant/40 w-full max-w-[772px] rounded-xl border bg-hisabi-surface-container-lowest p-hisabi-xl shadow-sm">
          <div className="mb-hisabi-xl text-center">
            <h1 className="type-headline-lg text-hisabi-teal mb-hisabi-xs">
              {isCreateMode ? t('createTitle') : t('title')}
            </h1>
            <p className="type-body-md text-hisabi-outline">
              {isCreateMode ? t('createSubtitle') : t('subtitle')}
            </p>
          </div>

          {submitError ? (
            <p
              className="type-body-md text-hisabi-error mb-hisabi-md"
              role="alert"
            >
              {submitError}
            </p>
          ) : null}

          <form className="space-y-hisabi-lg" onSubmit={handleSubmit} noValidate>
            {confirmOpen ? (
              <BilingualInvoiceFieldsConfirmModal
                remountKey={confirmModalKey}
                onClose={() => setConfirmOpen(false)}
                snapshot={confirmSnapshot}
                autoTranslatedPairs={bilingualFieldOrigin.autoTranslatedPairs}
                onConfirm={handleConfirmModalSave}
              />
            ) : null}
            <div className="space-y-hisabi-xs">
              <label
                className="type-label-md text-hisabi-on-surface-variant block"
                htmlFor="company-logo-file"
              >
                {t('logoLabel')}
              </label>
              <input
                id="company-logo-file"
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
                className="sr-only"
                onChange={handleLogoChange}
              />
              {logoPreviewUrl && logoFile ? (
                <div className="border-hisabi-outline-variant flex w-full flex-col items-center gap-hisabi-md rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-xl">
                  <div className="border-hisabi-outline-variant relative flex min-h-[160px] w-full max-w-xs flex-1 items-center justify-center overflow-hidden rounded-xl border bg-hisabi-surface-container p-hisabi-sm shadow-sm">
                    <img
                      src={logoPreviewUrl}
                      alt=""
                      className="max-h-52 w-auto max-w-full object-contain"
                    />
                  </div>
                  <p className="type-body-sm text-hisabi-teal max-w-full truncate text-center">
                    {t('logoSelected', { name: logoFile.name })}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-hisabi-sm">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2.5 font-semibold transition-colors"
                    >
                      {t('logoReplace')}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="type-label-md text-hisabi-outline hover:text-hisabi-error rounded-xl border-2 border-transparent px-hisabi-lg py-2.5 font-semibold transition-colors"
                    >
                      {t('logoRemove')}
                    </button>
                  </div>
                </div>
              ) : showServerLogo ? (
                <div className="border-hisabi-outline-variant flex w-full flex-col items-center gap-hisabi-md rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-xl">
                  <div className="border-hisabi-outline-variant relative flex min-h-[160px] w-full max-w-xs flex-1 items-center justify-center overflow-hidden rounded-xl border bg-hisabi-surface-container p-hisabi-sm shadow-sm">
                    <img
                      src={serverLogoSrc}
                      alt=""
                      className="max-h-52 w-auto max-w-full object-contain"
                    />
                  </div>
                  <p className="type-body-sm text-hisabi-teal text-center">
                    {t('logoCurrent')}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-hisabi-sm">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2.5 font-semibold transition-colors"
                    >
                      {t('logoReplace')}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="type-label-md text-hisabi-outline hover:text-hisabi-error rounded-xl border-2 border-transparent px-hisabi-lg py-2.5 font-semibold transition-colors"
                    >
                      {t('logoRemove')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="border-hisabi-outline-variant hover:border-hisabi-teal-container group flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-xl transition-colors"
                >
                  <div className="mb-hisabi-md flex size-16 items-center justify-center rounded-full bg-hisabi-surface-container transition-colors group-hover:bg-hisabi-primary-fixed/40">
                    <Upload
                      className="size-8 text-hisabi-teal"
                      aria-hidden
                    />
                  </div>
                  <p className="type-label-md text-hisabi-on-surface-variant">
                    {t('logoHint')}
                  </p>
                  <p className="type-body-sm text-hisabi-outline mt-1">
                    {t('logoFormats')}
                  </p>
                </button>
              )}
              {logoUploadError ? (
                <p className="type-body-sm text-hisabi-error" role="alert">
                  {t('logoTooLarge')}
                </p>
              ) : null}
            </div>

            <BilingualCompanyFields
              companyNameEn={companyNameEn}
              companyNameAr={companyNameAr}
              streetEn={streetEn}
              streetAr={streetAr}
              districtEn={districtEn}
              districtAr={districtAr}
              cityEn={cityEn}
              cityAr={cityAr}
              buildingNumber={buildingNumber}
              secondaryNumber={secondaryNumber}
              postalCode={postalCode}
              shortAddress={shortAddress}
              companyNameEnBaseline={
                profileToHydrate != null ? (profileToHydrate.companyNameEn ?? '') : ''
              }
              streetEnBaseline={
                profileToHydrate != null ? (profileToHydrate.streetEn ?? '') : ''
              }
              districtEnBaseline={
                profileToHydrate != null ? (profileToHydrate.districtEn ?? '') : ''
              }
              cityEnBaseline={
                profileToHydrate != null ? (profileToHydrate.cityEn ?? '') : ''
              }
              onCompanyNameEnChange={setCompanyNameEn}
              onCompanyNameArChange={setCompanyNameAr}
              onStreetEnChange={setStreetEn}
              onStreetArChange={setStreetAr}
              onDistrictEnChange={setDistrictEn}
              onDistrictArChange={setDistrictAr}
              onCityEnChange={setCityEn}
              onCityArChange={setCityAr}
              onBuildingNumberChange={setBuildingNumber}
              onSecondaryNumberChange={setSecondaryNumber}
              onPostalCodeChange={setPostalCode}
              onShortAddressChange={setShortAddress}
              onClearAddressFieldError={(key) =>
                setFieldErrors((prev) =>
                  prev[key] ? { ...prev, [key]: '' } : prev,
                )
              }
              geminiSuggestionEnabled={!confirmOpen}
              fieldOrigin={bilingualFieldOrigin}
              fieldErrors={{
                companyNameAr: fieldErrors.companyNameAr,
                districtAr: fieldErrors.districtAr,
                cityAr: fieldErrors.cityAr,
                streetAr: fieldErrors.streetAr,
                postalCode: fieldErrors.postalCode,
                buildingNumber: fieldErrors.buildingNumber,
              }}
              fieldClass={fieldClass}
            />

            <div className="grid grid-cols-1 gap-hisabi-lg md:grid-cols-2">
              <div className="space-y-hisabi-xs">
                <label
                  className="type-label-md text-hisabi-on-surface-variant block"
                  htmlFor="cr-number"
                >
                  {t('crLabel')}
                  <RequiredMark />
                </label>
                <input
                  id="cr-number"
                  name="crNumber"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={CR_NUMBER_MAX_DIGITS}
                  placeholder={t('crPlaceholder')}
                  value={crNumber}
                  onChange={(e) => {
                    setCrNumber(
                      digitsOnlyLimited(e.target.value, CR_NUMBER_MAX_DIGITS),
                    )
                    setFieldErrors((prev) =>
                      prev.crNumber ? { ...prev, crNumber: '' } : prev,
                    )
                  }}
                  className={cn(
                    fieldClass,
                    fieldErrors.crNumber &&
                      'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                  )}
                  aria-required="true"
                  aria-invalid={fieldErrors.crNumber ? true : undefined}
                  aria-describedby={
                    fieldErrors.crNumber ? 'cr-number-error' : undefined
                  }
                />
                {fieldErrors.crNumber ? (
                  <p
                    id="cr-number-error"
                    className="type-body-sm text-hisabi-error"
                    role="alert"
                  >
                    {fieldErrors.crNumber}
                  </p>
                ) : null}
              </div>
              <div className="space-y-hisabi-xs">
                <label
                  className="type-label-md text-hisabi-on-surface-variant block"
                  htmlFor="vat-number"
                >
                  {t('vatLabel')}
                  <RequiredMark />
                </label>
                <input
                  id="vat-number"
                  name="vatNumber"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={VAT_NUMBER_MAX_DIGITS}
                  placeholder={t('vatPlaceholder')}
                  value={vatNumber}
                  onChange={(e) => {
                    setVatNumber(
                      digitsOnlyLimited(e.target.value, VAT_NUMBER_MAX_DIGITS),
                    )
                    setFieldErrors((prev) =>
                      prev.vatNumber ? { ...prev, vatNumber: '' } : prev,
                    )
                  }}
                  className={cn(
                    fieldClass,
                    fieldErrors.vatNumber &&
                      'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                  )}
                  aria-required="true"
                  aria-invalid={fieldErrors.vatNumber ? true : undefined}
                  aria-describedby={
                    fieldErrors.vatNumber ? 'vat-number-error' : undefined
                  }
                />
                {fieldErrors.vatNumber ? (
                  <p
                    id="vat-number-error"
                    className="type-body-sm text-hisabi-error"
                    role="alert"
                  >
                    {fieldErrors.vatNumber}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-hisabi-md pt-hisabi-md">
              <span className="type-label-md text-hisabi-on-surface-variant block">
                {t('taxSettingsLabel')}
              </span>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <button
                  type="button"
                  disabled={presetsDisabled}
                  onClick={() => setDefaultVat('standard')}
                  aria-pressed={!presetsDisabled && defaultVat === 'standard'}
                  aria-disabled={presetsDisabled}
                  className={taxSettingCardClass(
                    !presetsDisabled && defaultVat === 'standard',
                    presetsDisabled,
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-hisabi-sm">
                    {!presetsDisabled && defaultVat === 'standard' ? (
                      <CheckCircle2
                        className="size-6 shrink-0 text-hisabi-teal"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        className="size-6 shrink-0 text-hisabi-outline-variant/70"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    )}
                    <span className="rounded bg-hisabi-gold-muted px-2 py-0.5 text-[10px] font-bold text-hisabi-on-secondary-container">
                      {t('taxRecommendedBadge')}
                    </span>
                  </div>
                  <span
                    className={taxOptionTitleClass(
                      !presetsDisabled && defaultVat === 'standard',
                    )}
                  >
                    {t('taxStandardTitle')}
                  </span>
                  <p className="text-xs leading-relaxed text-hisabi-outline">
                    {t('taxStandardDesc')}
                  </p>
                </button>

                <button
                  type="button"
                  disabled={presetsDisabled}
                  onClick={() => setDefaultVat('zero')}
                  aria-pressed={!presetsDisabled && defaultVat === 'zero'}
                  aria-disabled={presetsDisabled}
                  className={taxSettingCardClass(
                    !presetsDisabled && defaultVat === 'zero',
                    presetsDisabled,
                  )}
                >
                  <div className="mb-3 flex items-start justify-start gap-hisabi-sm">
                    {!presetsDisabled && defaultVat === 'zero' ? (
                      <CheckCircle2
                        className="size-6 shrink-0 text-hisabi-teal"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        className="size-6 shrink-0 text-hisabi-outline-variant/70"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    )}
                  </div>
                  <span
                    className={taxOptionTitleClass(
                      !presetsDisabled && defaultVat === 'zero',
                    )}
                  >
                    {t('taxZeroTitle')}
                  </span>
                  <p className="text-xs leading-relaxed text-hisabi-outline">
                    {t('taxZeroDesc')}
                  </p>
                </button>

                <button
                  type="button"
                  disabled={presetsDisabled}
                  onClick={() => setDefaultVat('exempt')}
                  aria-pressed={!presetsDisabled && defaultVat === 'exempt'}
                  aria-disabled={presetsDisabled}
                  className={taxSettingCardClass(
                    !presetsDisabled && defaultVat === 'exempt',
                    presetsDisabled,
                  )}
                >
                  <div className="mb-3 flex items-start justify-start gap-hisabi-sm">
                    {!presetsDisabled && defaultVat === 'exempt' ? (
                      <CheckCircle2
                        className="size-6 shrink-0 text-hisabi-teal"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        className="size-6 shrink-0 text-hisabi-outline-variant/70"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    )}
                  </div>
                  <span
                    className={taxOptionTitleClass(
                      !presetsDisabled && defaultVat === 'exempt',
                    )}
                  >
                    {t('taxExemptTitle')}
                  </span>
                  <p className="text-xs leading-relaxed text-hisabi-outline">
                    {t('taxExemptDesc')}
                  </p>
                </button>

              </div>

              {/* Custom VAT rates are not supported in Hisabi POS (standard|zero|exempt only). */}
            </div>

            <div className="space-y-hisabi-md pt-hisabi-xl">
              <AuthSubmitButton pending={submitPending}>
                <>
                  {t('continue')}
                  <ContinueIcon className="size-5 shrink-0" aria-hidden />
                </>
              </AuthSubmitButton>
            </div>
          </form>
        </div>
        )}
      </main>

      {!embedded ? (
        <div className="mt-auto shrink-0 px-hisabi-margin-mobile pb-hisabi-xl md:px-hisabi-margin-desktop">
          <AuthPageFooter />
        </div>
      ) : null}

      {redirecting ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-hisabi-background"
          role="status"
          aria-live="polite"
        >
          <AppLoader />
        </div>
      ) : null}
    </div>
  )
}
