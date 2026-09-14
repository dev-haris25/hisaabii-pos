'use client'

/* eslint-disable @next/next/no-img-element -- restaurant logo previews (blob + `/api/auth/.../logo`) */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Circle,
  Save,
  Upload,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { AppLoader } from '@/components/app-loader'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { AuthApiError, authGet, authPatch } from '@/lib/api/auth-client'
import {
  CR_NUMBER_MAX_DIGITS,
  VAT_NUMBER_MAX_DIGITS,
  digitsOnlyLimited,
} from '@/lib/business-registration-ids'
import {
  COMPANY_LOGO_MIME_TYPES,
  MAX_COMPANY_LOGO_BYTES,
} from '@/lib/auth/company-logo'
import { cn } from '@/lib/utils'
import { scrollFirstInvalidFieldIntoView } from '@/lib/ui/scroll-first-invalid-field'
import { useAuthStore } from '@/stores/auth-store'
import { BilingualCompanyFields } from '@/components/business-profile/bilingual-company-fields'
import { BilingualInvoiceFieldsConfirmModal } from '@/components/business-profile/bilingual-invoice-fields-confirm-modal'
import { RequiredMark } from '@/components/ui/required-mark'
import { useCompanyInvoiceAddressFields } from '@/hooks/use-company-invoice-address-fields'
import { useBilingualFieldOrigin } from '@/lib/i18n/use-bilingual-field-origin'
import {
  buildBusinessProfileApiBody,
  buildBusinessProfileConfirmSnapshot,
  validateBusinessProfileInvoiceFields,
} from '@/lib/business-profile/validate-business-profile-invoice'

const SHEET_TRANSITION_MS = 300

/**
 * @param {File} file
 */
function mimeFromLogoFile(file) {
  const ty = file.type
  if (COMPANY_LOGO_MIME_TYPES.includes(ty)) return ty
  const n = file.name.toLowerCase()
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.gif')) return 'image/gif'
  if (n.endsWith('.webp')) return 'image/webp'
  return ''
}

/**
 * @param {File} file
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

const fieldClass =
  'type-body-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset'

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
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   profileId: string | null
 *   onSaved?: () => void
 * }} props
 */
export function EditRestaurantSheet({
  open,
  onOpenChange,
  profileId,
  onSaved,
}) {
  const t = useTranslations('Restaurants')
  const tBp = useTranslations('BusinessProfile')
  const tB = useTranslations('BilingualInvoiceCompany')
  const tErr = useTranslations('AuthErrors')
  const titleId = useId()
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const logoInputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const openedHydrateKeyRef = useRef(/** @type {string | null} */ (null))
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)

  const [mounted, setMounted] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmModalKey, setConfirmModalKey] = useState(0)
  const [confirmSnapshot, setConfirmSnapshot] = useState({
    companyNameEn: '',
    companyNameAr: '',
    addressEn: '',
    addressAr: '',
  })
  const [defaultVat, setDefaultVat] = useState(
    /** @type {'standard' | 'zero' | 'exempt'} */ ('standard'),
  )
  /** POS supports standard|zero|exempt only — custom rates disabled. */
  const useCustomRate = false
  const customVatPercent = ''
  const [logoFile, setLogoFile] = useState(/** @type {File | null} */ (null))
  const [logoUploadError, setLogoUploadError] = useState(false)
  const [logoRemovedByUser, setLogoRemovedByUser] = useState(false)

  const [submitError, setSubmitError] = useState('')
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

  const {
    data: savedProfile,
    isPending: profileLoading,
    isError: profileQueryError,
    refetch,
  } = useQuery({
    queryKey: ['auth', 'business-profile', profileId],
    queryFn: async () => {
      const d = await authGet(`/business-profiles/${profileId}`)
      return d.profile
    },
    enabled:
      open && typeof profileId === 'string' && profileId.length > 0,
    staleTime: 0,
  })

  const logoPreviewUrl = useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : null),
    [logoFile],
  )

  useEffect(() => {
    if (!logoPreviewUrl) return
    return () => URL.revokeObjectURL(logoPreviewUrl)
  }, [logoPreviewUrl])

  useLayoutEffect(() => {
    if (!open) return
    if (!savedProfile?.id) return
    const key = `${savedProfile.id}:${savedProfile.updatedAt}`
    if (openedHydrateKeyRef.current === key) return
    openedHydrateKeyRef.current = key
    setCompanyNameEn(savedProfile.companyNameEn ?? '')
    setCompanyNameAr(savedProfile.companyNameAr ?? '')
    hydrateAddressFromProfile(savedProfile)
    setCrNumber(
      digitsOnlyLimited(String(savedProfile.crNumber ?? ''), CR_NUMBER_MAX_DIGITS),
    )
    setVatNumber(
      digitsOnlyLimited(String(savedProfile.vatNumber ?? ''), VAT_NUMBER_MAX_DIGITS),
    )
    setDefaultVat(
      savedProfile.defaultVatPreset === 'zero' ||
        savedProfile.defaultVatPreset === 'exempt'
        ? savedProfile.defaultVatPreset
        : 'standard',
    )
    setLogoFile(null)
    setLogoRemovedByUser(false)
    setLogoUploadError(false)
    setSubmitError('')
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
  }, [open, savedProfile, hydrateAddressFromProfile])

  useEffect(() => {
    if (!open) {
      openedHydrateKeyRef.current = null
    }
  }, [open])

  const presetsDisabled = false
  const showServerLogo =
    Boolean(savedProfile?.hasLogo) && !logoRemovedByUser && !logoFile

  const serverLogoSrc =
    savedProfile?.id != null
      ? `/api/auth/business-profiles/${savedProfile.id}/logo?t=${encodeURIComponent(savedProfile.updatedAt ?? '')}`
      : ''

  const saveMutation = useMutation({
    /**
     * @param {null | { companyNameEn: string, companyNameAr: string, addressEn: string, addressAr: string }} invoiceFields
     */
    mutationFn: async (invoiceFields) => {
      if (!savedProfile?.id) throw new Error('missing profile')
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

      if (logoFile) {
        const { base64, logoMimeType } = await readFileAsBase64(logoFile)
        return authPatch(`/business-profiles/${savedProfile.id}`, {
          ...payload,
          logoBase64: base64,
          logoMimeType,
          preserveLogo: false,
        })
      }

      if (savedProfile.hasLogo && !logoRemovedByUser) {
        return authPatch(`/business-profiles/${savedProfile.id}`, {
          ...payload,
          preserveLogo: true,
        })
      }

      return authPatch(`/business-profiles/${savedProfile.id}`, {
        ...payload,
        preserveLogo: false,
        logoBase64: null,
        logoMimeType: null,
      })
    },
    onSuccess: (data) => {
      const u = data?.user
      if (u) {
        queryClient.setQueryData(['auth', 'me'], { user: u })
        setUser(u)
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'business-profiles'] })
      queryClient.invalidateQueries({
        queryKey: ['auth', 'business-profile', profileId],
      })
      queryClient.invalidateQueries({ queryKey: ['auth', 'business-profile'] })
      onOpenChange(false)
      onSaved?.()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setSubmitError(code ? tErr(code) : tErr('generic'))
    },
  })

  const isDirty = useMemo(() => {
    if (!savedProfile?.id) return false
    const p = savedProfile
    const trimStr = (v) => String(v ?? '').trim()

    if (trimStr(companyNameEn) !== trimStr(p.companyNameEn)) return true
    if (trimStr(companyNameAr) !== trimStr(p.companyNameAr)) return true
    if (trimStr(streetEn) !== trimStr(p.streetEn)) return true
    if (trimStr(streetAr) !== trimStr(p.streetAr)) return true
    if (trimStr(districtEn) !== trimStr(p.districtEn)) return true
    if (trimStr(districtAr) !== trimStr(p.districtAr)) return true
    if (trimStr(cityEn) !== trimStr(p.cityEn)) return true
    if (trimStr(cityAr) !== trimStr(p.cityAr)) return true
    if (trimStr(buildingNumber) !== trimStr(p.buildingNumber)) return true
    if (trimStr(secondaryNumber) !== trimStr(p.secondaryNumber)) return true
    if (trimStr(postalCode) !== trimStr(p.postalCode)) return true
    if (trimStr(shortAddress) !== trimStr(p.shortAddress)) return true

    if (
      digitsOnlyLimited(crNumber, CR_NUMBER_MAX_DIGITS) !==
      digitsOnlyLimited(String(p.crNumber ?? ''), CR_NUMBER_MAX_DIGITS)
    ) {
      return true
    }
    if (
      digitsOnlyLimited(vatNumber, VAT_NUMBER_MAX_DIGITS) !==
      digitsOnlyLimited(String(p.vatNumber ?? ''), VAT_NUMBER_MAX_DIGITS)
    ) {
      return true
    }

    const savedPreset =
      p.defaultVatPreset === 'zero' || p.defaultVatPreset === 'exempt'
        ? p.defaultVatPreset
        : 'standard'
    if (defaultVat !== savedPreset) return true

    if (logoFile != null) return true
    if (logoRemovedByUser && p.hasLogo) return true

    return false
  }, [
    savedProfile,
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
    crNumber,
    vatNumber,
    defaultVat,
    logoFile,
    logoRemovedByUser,
  ])

  function handleClose() {
    onOpenChange(false)
  }

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
    if (saveMutation.isPending) return
    if (!isDirty) return

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
      { tB, tTax: tBp },
    )
    if (!ok) {
      setFieldErrors(errors)
      scrollFirstInvalidFieldIntoView()
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

  function handleConfirmEditSave(
    /** @type {import('@/components/business-profile/bilingual-invoice-fields-confirm-modal').BilingualSnapshot} */ next,
  ) {
    setCompanyNameEn(next.companyNameEn)
    setCompanyNameAr(next.companyNameAr)
    applyAddressFromConfirm(next)
    setConfirmOpen(false)
    saveMutation.mutate(next)
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

  if (!mounted || !profileId) return null

  const idPrefix = `edit-restaurant-${profileId}`

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
        aria-label={t('editCloseAria')}
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'border-hisabi-outline-variant/30 relative z-10 flex h-full w-full max-w-[min(var(--width-hisabi-overlay-2xl),calc(100vw-0.5rem))] flex-col overflow-hidden border-s bg-hisabi-surface-container-lowest shadow-2xl transition-transform ease-out',
          animateIn ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ transitionDuration: `${SHEET_TRANSITION_MS}ms` }}
        onTransitionEnd={handleSheetTransitionEnd}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-hisabi-outline-variant/20 flex shrink-0 items-start justify-between gap-hisabi-md border-b py-hisabi-xl px-hisabi-md sm:px-hisabi-lg md:px-hisabi-xl">
          <div className="min-w-0 space-y-1">
            <h2
              id={titleId}
              className="type-headline-md text-hisabi-on-surface truncate"
            >
              {t('editSheetTitle')}
            </h2>
            <p className="type-body-sm text-hisabi-on-surface-variant">
              {t('editSheetSubtitle')}
            </p>
          </div>
          <button
            type="button"
            data-sheet-close
            onClick={handleClose}
            className="text-hisabi-outline hover:bg-hisabi-surface-container-low cursor-pointer rounded-full p-2 transition-colors"
            aria-label={t('editCloseAria')}
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={handleSubmit}
          noValidate
        >
          {confirmOpen ? (
            <BilingualInvoiceFieldsConfirmModal
              remountKey={confirmModalKey}
              onClose={() => setConfirmOpen(false)}
              snapshot={confirmSnapshot}
              autoTranslatedPairs={bilingualFieldOrigin.autoTranslatedPairs}
              onConfirm={handleConfirmEditSave}
            />
          ) : null}
          <div className="min-h-0 flex-1 space-y-hisabi-lg overflow-y-auto px-hisabi-md py-hisabi-xl sm:px-hisabi-lg md:px-hisabi-xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {profileLoading ? (
              <div className="flex min-h-[40vh] items-center justify-center py-hisabi-xxl">
                <AppLoader />
              </div>
            ) : profileQueryError ? (
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
            ) : savedProfile ? (
              <>
                {submitError ? (
                  <p
                    className="type-body-md text-hisabi-error"
                    role="alert"
                  >
                    {submitError}
                  </p>
                ) : null}

                <div className="space-y-hisabi-xs">
                  <label
                    className="type-label-md text-hisabi-on-surface-variant block"
                    htmlFor={`${idPrefix}-logo`}
                  >
                    {tBp('logoLabel')}
                  </label>
                  <input
                    id={`${idPrefix}-logo`}
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
                    className="sr-only"
                    onChange={handleLogoChange}
                  />
                  {logoPreviewUrl && logoFile ? (
                    <div className="border-hisabi-outline-variant flex w-full flex-col items-center gap-hisabi-md rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-xl">
                      <div className="border-hisabi-outline-variant relative flex min-h-[120px] w-full max-w-xs flex-1 items-center justify-center overflow-hidden rounded-xl border bg-hisabi-surface-container p-hisabi-sm shadow-sm">
                        <img
                          src={logoPreviewUrl}
                          alt=""
                          className="max-h-40 w-auto max-w-full object-contain"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-hisabi-sm">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2 font-semibold transition-colors"
                        >
                          {tBp('logoReplace')}
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="type-label-md text-hisabi-outline hover:text-hisabi-error rounded-xl border-2 border-transparent px-hisabi-lg py-2 font-semibold transition-colors"
                        >
                          {tBp('logoRemove')}
                        </button>
                      </div>
                    </div>
                  ) : showServerLogo ? (
                    <div className="border-hisabi-outline-variant flex w-full flex-col items-center gap-hisabi-md rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-xl">
                      <div className="border-hisabi-outline-variant relative flex min-h-[120px] w-full max-w-xs flex-1 items-center justify-center overflow-hidden rounded-xl border bg-hisabi-surface-container p-hisabi-sm shadow-sm">
                        <img
                          src={serverLogoSrc}
                          alt=""
                          className="max-h-40 w-auto max-w-full object-contain"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-hisabi-sm">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2 font-semibold transition-colors"
                        >
                          {tBp('logoReplace')}
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="type-label-md text-hisabi-outline hover:text-hisabi-error rounded-xl border-2 border-transparent px-hisabi-lg py-2 font-semibold transition-colors"
                        >
                          {tBp('logoRemove')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="border-hisabi-outline-variant hover:border-hisabi-teal-container group flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-xl transition-colors"
                    >
                      <div className="mb-hisabi-md flex size-14 items-center justify-center rounded-full bg-hisabi-surface-container transition-colors group-hover:bg-hisabi-primary-fixed/40">
                        <Upload
                          className="size-7 text-hisabi-teal"
                          aria-hidden
                        />
                      </div>
                      <p className="type-label-md text-hisabi-on-surface-variant">
                        {tBp('logoHint')}
                      </p>
                    </button>
                  )}
                  {logoUploadError ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {tBp('logoTooLarge')}
                    </p>
                  ) : null}
                </div>

                <BilingualCompanyFields
                  idPrefix={idPrefix}
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
                  companyNameEnBaseline={savedProfile.companyNameEn ?? ''}
                  streetEnBaseline={savedProfile.streetEn ?? ''}
                  districtEnBaseline={savedProfile.districtEn ?? ''}
                  cityEnBaseline={savedProfile.cityEn ?? ''}
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
                      htmlFor={`${idPrefix}-cr`}
                    >
                      {tBp('crLabel')}
                      <RequiredMark />
                    </label>
                    <input
                      id={`${idPrefix}-cr`}
                      type="text"
                      inputMode="numeric"
                      maxLength={CR_NUMBER_MAX_DIGITS}
                      placeholder={tBp('crPlaceholder')}
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
                      aria-invalid={fieldErrors.crNumber ? true : undefined}
                    />
                    {fieldErrors.crNumber ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {fieldErrors.crNumber}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-hisabi-xs">
                    <label
                      className="type-label-md text-hisabi-on-surface-variant block"
                      htmlFor={`${idPrefix}-vat`}
                    >
                      {tBp('vatLabel')}
                      <RequiredMark />
                    </label>
                    <input
                      id={`${idPrefix}-vat`}
                      type="text"
                      inputMode="numeric"
                      maxLength={VAT_NUMBER_MAX_DIGITS}
                      placeholder={tBp('vatPlaceholder')}
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
                      aria-invalid={fieldErrors.vatNumber ? true : undefined}
                    />
                    {fieldErrors.vatNumber ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {fieldErrors.vatNumber}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-hisabi-md pt-hisabi-md">
                  <span className="type-label-md text-hisabi-on-surface-variant block">
                    {tBp('taxSettingsLabel')}
                  </span>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <button
                      type="button"
                      disabled={presetsDisabled}
                      onClick={() => setDefaultVat('standard')}
                      aria-pressed={!presetsDisabled && defaultVat === 'standard'}
                      className={taxSettingCardClass(
                        !presetsDisabled && defaultVat === 'standard',
                        presetsDisabled,
                      )}
                    >
                      <div className="mb-3 flex items-start justify-between gap-hisabi-sm">
                        {!presetsDisabled && defaultVat === 'standard' ? (
                          <CheckCircle2 className="size-6 shrink-0 text-hisabi-teal" aria-hidden />
                        ) : (
                          <Circle className="size-6 shrink-0 text-hisabi-outline-variant/70" strokeWidth={1.75} aria-hidden />
                        )}
                        <span className="rounded bg-hisabi-gold-muted px-2 py-0.5 text-[10px] font-bold text-hisabi-on-secondary-container">
                          {tBp('taxRecommendedBadge')}
                        </span>
                      </div>
                      <span className={taxOptionTitleClass(!presetsDisabled && defaultVat === 'standard')}>
                        {tBp('taxStandardTitle')}
                      </span>
                      <p className="text-xs leading-relaxed text-hisabi-outline">
                        {tBp('taxStandardDesc')}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={presetsDisabled}
                      onClick={() => setDefaultVat('zero')}
                      aria-pressed={!presetsDisabled && defaultVat === 'zero'}
                      className={taxSettingCardClass(
                        !presetsDisabled && defaultVat === 'zero',
                        presetsDisabled,
                      )}
                    >
                      <div className="mb-3 flex items-start justify-start gap-hisabi-sm">
                        {!presetsDisabled && defaultVat === 'zero' ? (
                          <CheckCircle2 className="size-6 shrink-0 text-hisabi-teal" aria-hidden />
                        ) : (
                          <Circle className="size-6 shrink-0 text-hisabi-outline-variant/70" strokeWidth={1.75} aria-hidden />
                        )}
                      </div>
                      <span className={taxOptionTitleClass(!presetsDisabled && defaultVat === 'zero')}>
                        {tBp('taxZeroTitle')}
                      </span>
                      <p className="text-xs leading-relaxed text-hisabi-outline">
                        {tBp('taxZeroDesc')}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={presetsDisabled}
                      onClick={() => setDefaultVat('exempt')}
                      aria-pressed={!presetsDisabled && defaultVat === 'exempt'}
                      className={taxSettingCardClass(
                        !presetsDisabled && defaultVat === 'exempt',
                        presetsDisabled,
                      )}
                    >
                      <div className="mb-3 flex items-start justify-start gap-hisabi-sm">
                        {!presetsDisabled && defaultVat === 'exempt' ? (
                          <CheckCircle2 className="size-6 shrink-0 text-hisabi-teal" aria-hidden />
                        ) : (
                          <Circle className="size-6 shrink-0 text-hisabi-outline-variant/70" strokeWidth={1.75} aria-hidden />
                        )}
                      </div>
                      <span className={taxOptionTitleClass(!presetsDisabled && defaultVat === 'exempt')}>
                        {tBp('taxExemptTitle')}
                      </span>
                      <p className="text-xs leading-relaxed text-hisabi-outline">
                        {tBp('taxExemptDesc')}
                      </p>
                    </button>
                  </div>
                  {/* Custom VAT rates are not supported in Hisabi POS (standard|zero|exempt only). */}
                </div>
              </>
            ) : null}
          </div>

          {savedProfile && !profileLoading && !profileQueryError ? (
            <div className="flex shrink-0 flex-col-reverse gap-hisabi-md border-t border-slate-100 bg-slate-50 py-hisabi-xl px-hisabi-md sm:px-hisabi-lg md:px-hisabi-xl min-[425px]:grid min-[425px]:grid-cols-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={saveMutation.isPending}
                className={cn(
                  'type-label-md border-hisabi-outline text-hisabi-on-surface-variant hover:bg-hisabi-surface-container-low inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-2 px-hisabi-lg font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {t('cancelClose')}
              </button>
              <AuthSubmitButton
                type="submit"
                variant="gold"
                pending={saveMutation.isPending}
                disabled={!isDirty}
                className="min-h-0 w-full min-w-0 py-4"
              >
                <span className="flex items-center justify-center gap-hisabi-sm">
                  <Save className="size-5 shrink-0" aria-hidden />
                  {t('saveRestaurant')}
                </span>
              </AuthSubmitButton>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  )
}
