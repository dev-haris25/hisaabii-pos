'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, FileBadge } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'

import { BilingualCompanyFields } from '@/components/business-profile/bilingual-company-fields'
import { BilingualInvoiceFieldsConfirmModal } from '@/components/business-profile/bilingual-invoice-fields-confirm-modal'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { ProfileImageUploadField } from '@/components/settings/profile-image-upload-field'
import {
  SettingsSection,
  fieldClass,
} from '@/components/settings/settings-page-shell'
import { RequiredMark } from '@/components/ui/required-mark'
import { useCompanyInvoiceAddressFields } from '@/hooks/use-company-invoice-address-fields'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authGet, authPatch } from '@/lib/api/auth-client'
import {
  COMPANY_LOGO_MIME_TYPES,
  MAX_COMPANY_LOGO_BYTES,
} from '@/lib/auth/company-logo'
import {
  CR_NUMBER_MAX_DIGITS,
  VAT_NUMBER_MAX_DIGITS,
  digitsOnlyLimited,
  taxIdDigitsEqual,
} from '@/lib/business-registration-ids'
import {
  buildBusinessProfileApiBody,
  buildBusinessProfileConfirmSnapshot,
  validateBusinessProfileInvoiceFields,
} from '@/lib/business-profile/validate-business-profile-invoice'
import { useBilingualFieldOrigin } from '@/lib/i18n/use-bilingual-field-origin'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

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

/**
 * @param {{
 *   defaultVatPreset?: string | null
 * } | null | undefined} profile
 */
function vatStateFromProfile(profile) {
  const defaultVat =
    profile?.defaultVatPreset === 'zero' || profile?.defaultVatPreset === 'exempt'
      ? profile.defaultVatPreset
      : 'standard'
  return {
    defaultVat,
    useCustomRate: false,
    customVatPercent: '',
  }
}

export const SettingsRestaurantIdentitySection = forwardRef(
  /**
   * @param {{ onDirtyChange?: (dirty: boolean) => void }} props
   * @param {import('react').ForwardedRef<{
   *   requestSave: () => Promise<'saved' | 'skipped' | 'cancelled' | 'tax_cancelled' | 'invalid' | 'error' | 'redirected'>
   *   isPending: () => boolean
   *   canUpdate: () => boolean
   *   isVisible: () => boolean
   *   isDirty: () => boolean
   *   discardChanges: () => void
   * }>} ref
   */
  function SettingsRestaurantIdentitySection({ onDirtyChange }, ref) {
    const ability = useAppAbility()
    const canRead =
      hasFullAccess(ability) ||
      ability.can('read', 'BusinessProfile') ||
      ability.can('update', 'BusinessProfile')
    const canUpdate =
      hasFullAccess(ability) || ability.can('update', 'BusinessProfile')

    const t = useTranslations('Settings')
    const tBp = useTranslations('BusinessProfile')
    const tB = useTranslations('BilingualInvoiceCompany')
    const tRestaurants = useTranslations('Restaurants')
    const tErr = useTranslations('AuthErrors')
    const router = useRouter()
    const queryClient = useQueryClient()
    const setUser = useAuthStore((s) => s.setUser)
    const activeBusinessProfileId = useAuthStore(
      (s) => s.user?.activeBusinessProfileId ?? null,
    )

    const logoInputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
    const hydrateKeyRef = useRef(/** @type {string | null} */ (null))
    const taxConfirmAcceptedRef = useRef(false)
    /** @type {React.MutableRefObject<null | ((result: 'saved' | 'skipped' | 'cancelled' | 'tax_cancelled' | 'invalid' | 'error' | 'redirected') => void)>} */
    const saveFlowResolveRef = useRef(null)
    const onDirtyChangeRef = useRef(onDirtyChange)
    onDirtyChangeRef.current = onDirtyChange

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
    const [baselineCr, setBaselineCr] = useState('')
    const [baselineVat, setBaselineVat] = useState('')

    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmModalKey, setConfirmModalKey] = useState(0)
    const [confirmSnapshot, setConfirmSnapshot] = useState({
      companyNameEn: '',
      companyNameAr: '',
      addressEn: '',
      addressAr: '',
    })
    const [taxConfirmOpen, setTaxConfirmOpen] = useState(false)
    /** @type {React.MutableRefObject<null | { companyNameEn: string, companyNameAr: string, addressEn: string, addressAr: string }>} */
    const pendingInvoiceFieldsRef = useRef(null)

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

    const profileId =
      typeof activeBusinessProfileId === 'string' && activeBusinessProfileId.length > 0
        ? activeBusinessProfileId
        : null

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
      enabled: canRead && profileId != null,
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

    /**
     * @param {NonNullable<typeof savedProfile>} profile
     */
    function hydrateFromProfile(profile) {
      setCompanyNameEn(profile.companyNameEn ?? '')
      setCompanyNameAr(profile.companyNameAr ?? '')
      hydrateAddressFromProfile(profile)
      const nextCr = digitsOnlyLimited(
        String(profile.crNumber ?? ''),
        CR_NUMBER_MAX_DIGITS,
      )
      const nextVat = digitsOnlyLimited(
        String(profile.vatNumber ?? ''),
        VAT_NUMBER_MAX_DIGITS,
      )
      setCrNumber(nextCr)
      setVatNumber(nextVat)
      setBaselineCr(nextCr)
      setBaselineVat(nextVat)
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
      setConfirmOpen(false)
      setTaxConfirmOpen(false)
      pendingInvoiceFieldsRef.current = null
      bilingualFieldOrigin.resetOrigin()
      if (logoInputRef.current) {
        logoInputRef.current.value = ''
      }
    }

    useLayoutEffect(() => {
      if (!savedProfile?.id) return
      const key = `${savedProfile.id}:${savedProfile.updatedAt}`
      if (hydrateKeyRef.current === key) return
      hydrateKeyRef.current = key
      hydrateFromProfile(savedProfile)
      // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per saved profile version
    }, [savedProfile, hydrateAddressFromProfile])

    const showServerLogo =
      Boolean(savedProfile?.hasLogo) && !logoRemovedByUser && !logoFile

    const serverLogoSrc =
      savedProfile?.id != null
        ? `/api/auth/business-profiles/${savedProfile.id}/logo?t=${encodeURIComponent(savedProfile.updatedAt ?? '')}`
        : ''

    /**
     * @param {null | { companyNameEn: string, companyNameAr: string, addressEn: string, addressAr: string }} invoiceFields
     */
    async function patchProfile(invoiceFields) {
      if (!savedProfile?.id) throw new Error('missing profile')
      const vat = vatStateFromProfile(savedProfile)
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
        defaultVat: vat.defaultVat,
        useCustomRate: vat.useCustomRate,
        customVatPercent: vat.customVatPercent,
      })

      /** @type {Record<string, unknown>} */
      const imagePayload = {}

      if (logoFile) {
        const { base64, logoMimeType } = await readFileAsBase64(logoFile)
        Object.assign(imagePayload, {
          logoBase64: base64,
          logoMimeType,
          preserveLogo: false,
        })
      } else if (savedProfile.hasLogo && !logoRemovedByUser) {
        imagePayload.preserveLogo = true
      } else {
        Object.assign(imagePayload, {
          preserveLogo: false,
          logoBase64: null,
          logoMimeType: null,
        })
      }

      return authPatch(`/business-profiles/${savedProfile.id}`, {
        ...payload,
        ...imagePayload,
      })
    }

    const saveMutation = useMutation({
      /**
       * @param {{
       *   invoiceFields: null | { companyNameEn: string, companyNameAr: string, addressEn: string, addressAr: string }
       * }} vars
       */
      mutationFn: async ({ invoiceFields }) => patchProfile(invoiceFields),
      onSuccess: (data) => {
        const u = data?.user
        if (u) {
          queryClient.setQueryData(['auth', 'me'], { user: u })
          setUser(u)
        }
        if (data?.profile) {
          queryClient.setQueryData(
            ['auth', 'business-profile', profileId],
            data.profile,
          )
        }
        queryClient.invalidateQueries({ queryKey: ['auth', 'business-profiles'] })
        queryClient.invalidateQueries({
          queryKey: ['auth', 'business-profile', profileId],
        })
        queryClient.invalidateQueries({ queryKey: ['auth', 'business-profile'] })
        if (u?.needsZatcaOnboarding) {
          toast.message(t('zatcaNeedsReonboarding'))
          saveFlowResolveRef.current?.('redirected')
          saveFlowResolveRef.current = null
          router.push('/zatca-onboarding?from=settings')
          return
        }
        saveFlowResolveRef.current?.('saved')
        saveFlowResolveRef.current = null
      },
      onError: (err) => {
        const code = err instanceof AuthApiError ? err.code : undefined
        setSubmitError(code ? tErr(code) : tErr('generic'))
        toast.error(t('saveFailed'))
        saveFlowResolveRef.current?.('error')
        saveFlowResolveRef.current = null
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
      logoFile,
      logoRemovedByUser,
    ])

    useEffect(() => {
      onDirtyChangeRef.current?.(isDirty)
    }, [isDirty])

    const taxDigitsChanged =
      !taxIdDigitsEqual(crNumber, baselineCr) ||
      !taxIdDigitsEqual(vatNumber, baselineVat)

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

    /**
     * @param {null | { companyNameEn: string, companyNameAr: string, addressEn: string, addressAr: string }} invoiceFields
     */
    function proceedToSave(invoiceFields) {
      if (taxDigitsChanged) {
        pendingInvoiceFieldsRef.current = invoiceFields
        setTaxConfirmOpen(true)
        return
      }
      saveMutation.mutate({ invoiceFields })
    }

    function handleSubmit(e) {
      e.preventDefault()
      void startSaveFlow()
    }

    function discardChanges() {
      if (!savedProfile?.id) return
      if (saveFlowResolveRef.current) {
        saveFlowResolveRef.current('cancelled')
        saveFlowResolveRef.current = null
      }
      hydrateFromProfile(savedProfile)
    }

    /**
     * @returns {Promise<'saved' | 'skipped' | 'cancelled' | 'tax_cancelled' | 'invalid' | 'error' | 'redirected'>}
     */
    function startSaveFlow() {
      return new Promise((resolve) => {
        setSubmitError('')
        if (!canUpdate || saveMutation.isPending || !profileId || profileLoading) {
          resolve('skipped')
          return
        }
        if (!isDirty) {
          resolve('skipped')
          return
        }

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
            useCustomRate: false,
            requireTaxIds: true,
          },
          { tB, tTax: tBp },
        )
        if (!ok) {
          setFieldErrors(errors)
          scrollAfterFieldValidation()
          resolve('invalid')
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

        saveFlowResolveRef.current = resolve

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
        proceedToSave(null)
      })
    }

    useImperativeHandle(
      ref,
      () => ({
        requestSave: startSaveFlow,
        isPending: () => saveMutation.isPending,
        canUpdate: () => canUpdate,
        isVisible: () => canRead,
        isDirty: () => isDirty,
        discardChanges,
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps -- expose latest handlers via refs inside startSaveFlow closures
      [
        canRead,
        canUpdate,
        saveMutation.isPending,
        isDirty,
        profileId,
        profileLoading,
        savedProfile,
      ],
    )

    function handleConfirmBilingualSave(
      /** @type {import('@/components/business-profile/bilingual-invoice-fields-confirm-modal').BilingualSnapshot} */ next,
    ) {
      setCompanyNameEn(next.companyNameEn)
      setCompanyNameAr(next.companyNameAr)
      applyAddressFromConfirm(next)
      setConfirmOpen(false)
      proceedToSave(next)
    }

    function handleConfirmTaxChange() {
      taxConfirmAcceptedRef.current = true
      const invoiceFields = pendingInvoiceFieldsRef.current
      pendingInvoiceFieldsRef.current = null
      setTaxConfirmOpen(false)
      saveMutation.mutate({ invoiceFields })
    }

    function handleCancelTaxChange() {
      setCrNumber(baselineCr)
      setVatNumber(baselineVat)
      pendingInvoiceFieldsRef.current = null
      setTaxConfirmOpen(false)
      saveFlowResolveRef.current?.('tax_cancelled')
      saveFlowResolveRef.current = null
    }

    function handleTaxModalOpenChange(open) {
      if (open) {
        setTaxConfirmOpen(true)
        return
      }
      if (taxConfirmAcceptedRef.current) {
        taxConfirmAcceptedRef.current = false
        setTaxConfirmOpen(false)
        return
      }
      handleCancelTaxChange()
    }

    if (!canRead) return null

    const idPrefix = `settings-restaurant-identity-${profileId ?? 'none'}`

    return (
      <div className="space-y-hisabi-xl">
        {confirmOpen ? (
          <BilingualInvoiceFieldsConfirmModal
            remountKey={confirmModalKey}
            onClose={() => {
              setConfirmOpen(false)
              saveFlowResolveRef.current?.('cancelled')
              saveFlowResolveRef.current = null
            }}
            snapshot={confirmSnapshot}
            autoTranslatedPairs={bilingualFieldOrigin.autoTranslatedPairs}
            onConfirm={handleConfirmBilingualSave}
          />
        ) : null}

        <HisabiStatusModal
          open={taxConfirmOpen}
          onOpenChange={handleTaxModalOpenChange}
          variant="warning"
          title={t('taxChangeConfirmTitle')}
          description={t('taxChangeConfirmDescription')}
          primaryLabel={t('taxChangeConfirmPrimary')}
          primaryPending={saveMutation.isPending}
          onPrimary={handleConfirmTaxChange}
          secondaryLabel={t('taxChangeConfirmCancel')}
          onSecondary={handleCancelTaxChange}
        />

        <form onSubmit={handleSubmit} noValidate>
          <fieldset
            disabled={!canUpdate || saveMutation.isPending}
            className="min-w-0 space-y-hisabi-xl border-0 p-0"
          >
            {profileLoading && !savedProfile ? null : profileQueryError || !profileId ? (
              <SettingsSection title={t('sectionRestaurantInfo')} icon={Building2}>
                <div className="space-y-hisabi-md text-center">
                  <p className="type-body-md text-hisabi-error" role="alert">
                    {tRestaurants('loadDetailError')}
                  </p>
                  {profileId ? (
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2.5 font-semibold transition-colors"
                    >
                      {tRestaurants('retryLoad')}
                    </button>
                  ) : null}
                </div>
              </SettingsSection>
            ) : savedProfile ? (
              <>
                {submitError ? (
                  <p className="type-body-md text-hisabi-error" role="alert">
                    {submitError}
                  </p>
                ) : null}

                <SettingsSection title={t('sectionRestaurantInfo')} icon={Building2}>
                  <ProfileImageUploadField
                    id={`${idPrefix}-logo`}
                    label={tBp('logoLabel')}
                    hint={tBp('logoHint')}
                    inputRef={logoInputRef}
                    file={logoFile}
                    previewUrl={logoPreviewUrl}
                    showServerImage={showServerLogo}
                    serverSrc={serverLogoSrc}
                    uploadError={logoUploadError}
                    canUpdate={canUpdate}
                    tooLargeMessage={tBp('logoTooLarge')}
                    replaceLabel={tBp('logoReplace')}
                    removeLabel={tBp('logoRemove')}
                    onChange={handleLogoChange}
                    onRemove={handleRemoveLogo}
                  />

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
                    geminiSuggestionEnabled={!confirmOpen && canUpdate}
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
                </SettingsSection>

                <SettingsSection title={t('sectionTaxRegistration')} icon={FileBadge}>
                  <div className="grid grid-cols-1 gap-hisabi-lg md:grid-cols-2">
                    <div className="space-y-hisabi-xs">
                      <label
                        className="type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block"
                        htmlFor={`${idPrefix}-cr`}
                      >
                        {t('fieldCrNumber')}
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
                        className="type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block"
                        htmlFor={`${idPrefix}-vat`}
                      >
                        {t('fieldVatNumber')}
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
                </SettingsSection>
              </>
            ) : null}
          </fieldset>
        </form>
      </div>
    )
  },
)
