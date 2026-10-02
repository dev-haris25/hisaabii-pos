'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, FileBadge, MapPin, Palette } from 'lucide-react'
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
import { DEFAULT_E_WAITER_BRAND_COLORS } from '@/lib/e-waiter/default-brand-colors'
import { useBilingualFieldOrigin } from '@/lib/i18n/use-bilingual-field-origin'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const BRAND_HEX_RE = /^#[0-9A-Fa-f]{6}$/

/** @param {unknown} v */
function isValidBrandHex(v) {
  return BRAND_HEX_RE.test(String(v ?? '').trim())
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function brandHexFromProfile(v) {
  const s = String(v ?? '').trim()
  return isValidBrandHex(s) ? s : ''
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function coordFromProfile(v) {
  if (v == null || v === '') return ''
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? String(n) : ''
}

/**
 * @param {unknown} a
 * @param {unknown} b
 */
function coordsEqual(a, b) {
  const sa = String(a ?? '').trim()
  const sb = String(b ?? '').trim()
  if (sa === '' && sb === '') return true
  if (sa === '' || sb === '') return false
  const na = Number(sa)
  const nb = Number(sb)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return sa === sb
}

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

    const [brandPrimaryColor, setBrandPrimaryColor] = useState('')
    const [brandSecondaryColor, setBrandSecondaryColor] = useState('')
    const [brandAccentColor, setBrandAccentColor] = useState('')
    const [brandBackgroundColor, setBrandBackgroundColor] = useState('')
    const [brandTextColor, setBrandTextColor] = useState('')
    const [locationLat, setLocationLat] = useState('')
    const [locationLng, setLocationLng] = useState('')
    const [locationRadiusMeters, setLocationRadiusMeters] = useState('')
    const [geoPending, setGeoPending] = useState(false)

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
      brandPrimaryColor: '',
      brandSecondaryColor: '',
      brandAccentColor: '',
      brandBackgroundColor: '',
      brandTextColor: '',
      locationLat: '',
      locationLng: '',
      locationRadiusMeters: '',
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
      setBrandPrimaryColor(brandHexFromProfile(profile.brandPrimaryColor))
      setBrandSecondaryColor(brandHexFromProfile(profile.brandSecondaryColor))
      setBrandAccentColor(brandHexFromProfile(profile.brandAccentColor))
      setBrandBackgroundColor(brandHexFromProfile(profile.brandBackgroundColor))
      setBrandTextColor(brandHexFromProfile(profile.brandTextColor))
      setLocationLat(coordFromProfile(profile.locationLat))
      setLocationLng(coordFromProfile(profile.locationLng))
      setLocationRadiusMeters(
        profile.locationRadiusMeters == null
          ? ''
          : String(profile.locationRadiusMeters),
      )
      setGeoPending(false)
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
        brandPrimaryColor: '',
        brandSecondaryColor: '',
        brandAccentColor: '',
        brandBackgroundColor: '',
        brandTextColor: '',
        locationLat: '',
        locationLng: '',
        locationRadiusMeters: '',
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
        brandPrimaryColor,
        brandSecondaryColor,
        brandAccentColor,
        brandBackgroundColor,
        brandTextColor,
        locationLat,
        locationLng,
        locationRadiusMeters,
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

      if (brandPrimaryColor.trim() !== brandHexFromProfile(p.brandPrimaryColor)) {
        return true
      }
      if (
        brandSecondaryColor.trim() !== brandHexFromProfile(p.brandSecondaryColor)
      ) {
        return true
      }
      if (brandAccentColor.trim() !== brandHexFromProfile(p.brandAccentColor)) {
        return true
      }
      if (
        brandBackgroundColor.trim() !==
        brandHexFromProfile(p.brandBackgroundColor)
      ) {
        return true
      }
      if (brandTextColor.trim() !== brandHexFromProfile(p.brandTextColor)) {
        return true
      }
      if (!coordsEqual(locationLat, p.locationLat)) return true
      if (!coordsEqual(locationLng, p.locationLng)) return true
      if (
        String(locationRadiusMeters).trim() !==
        (p.locationRadiusMeters == null ? '' : String(p.locationRadiusMeters))
      ) {
        return true
      }

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
      brandPrimaryColor,
      brandSecondaryColor,
      brandAccentColor,
      brandBackgroundColor,
      brandTextColor,
      locationLat,
      locationLng,
      locationRadiusMeters,
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

    function handleUseCurrentLocation() {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        toast.error(t('locationGeoUnavailable'))
        return
      }
      setGeoPending(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationLat(String(pos.coords.latitude))
          setLocationLng(String(pos.coords.longitude))
          setFieldErrors((prev) => ({
            ...prev,
            locationLat: '',
            locationLng: '',
          }))
          setGeoPending(false)
          toast.success(t('locationGeoFilled'))
        },
        () => {
          setGeoPending(false)
          toast.error(t('locationGeoDenied'))
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
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

        /** @type {typeof fieldErrors} */
        const nextFieldErrors = {
          companyNameAr: '',
          crNumber: '',
          vatNumber: '',
          districtAr: '',
          cityAr: '',
          streetAr: '',
          postalCode: '',
          buildingNumber: '',
          customVatPercent: '',
          brandPrimaryColor: '',
          brandSecondaryColor: '',
          brandAccentColor: '',
          brandBackgroundColor: '',
          brandTextColor: '',
          locationLat: '',
          locationLng: '',
          locationRadiusMeters: '',
        }

        /** @type {Array<[keyof typeof nextFieldErrors, string]>} */
        const brandEntries = [
          ['brandPrimaryColor', brandPrimaryColor],
          ['brandSecondaryColor', brandSecondaryColor],
          ['brandAccentColor', brandAccentColor],
          ['brandBackgroundColor', brandBackgroundColor],
          ['brandTextColor', brandTextColor],
        ]
        let brandOrGeoInvalid = false
        for (const [key, val] of brandEntries) {
          const s = val.trim()
          if (s && !isValidBrandHex(s)) {
            nextFieldErrors[key] = t('brandColorInvalid')
            brandOrGeoInvalid = true
          }
        }

        const latTrim = locationLat.trim()
        if (latTrim) {
          const latN = Number(latTrim)
          if (!Number.isFinite(latN) || latN < -90 || latN > 90) {
            nextFieldErrors.locationLat = t('locationLatInvalid')
            brandOrGeoInvalid = true
          }
        }
        const lngTrim = locationLng.trim()
        if (lngTrim) {
          const lngN = Number(lngTrim)
          if (!Number.isFinite(lngN) || lngN < -180 || lngN > 180) {
            nextFieldErrors.locationLng = t('locationLngInvalid')
            brandOrGeoInvalid = true
          }
        }
        const radiusTrim = locationRadiusMeters.trim()
        if (radiusTrim) {
          const radiusN = Number.parseInt(radiusTrim, 10)
          if (!Number.isFinite(radiusN) || radiusN < 1 || radiusN > 50000) {
            nextFieldErrors.locationRadiusMeters = t('locationRadiusInvalid')
            brandOrGeoInvalid = true
          }
        }

        if (brandOrGeoInvalid) {
          setFieldErrors(nextFieldErrors)
          scrollAfterFieldValidation()
          resolve('invalid')
          return
        }

        setFieldErrors(nextFieldErrors)

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

                <SettingsSection title={t('sectionBrandColors')} icon={Palette}>
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('brandColorsHint')}
                  </p>
                  <div className="grid grid-cols-1 gap-hisabi-lg md:grid-cols-2">
                    {(
                      /** @type {const} */ ([
                        [
                          'brandPrimaryColor',
                          brandPrimaryColor,
                          setBrandPrimaryColor,
                          DEFAULT_E_WAITER_BRAND_COLORS.primary,
                          'fieldBrandPrimary',
                        ],
                        [
                          'brandSecondaryColor',
                          brandSecondaryColor,
                          setBrandSecondaryColor,
                          DEFAULT_E_WAITER_BRAND_COLORS.secondary,
                          'fieldBrandSecondary',
                        ],
                        [
                          'brandAccentColor',
                          brandAccentColor,
                          setBrandAccentColor,
                          DEFAULT_E_WAITER_BRAND_COLORS.accent,
                          'fieldBrandAccent',
                        ],
                        [
                          'brandBackgroundColor',
                          brandBackgroundColor,
                          setBrandBackgroundColor,
                          DEFAULT_E_WAITER_BRAND_COLORS.background,
                          'fieldBrandBackground',
                        ],
                        [
                          'brandTextColor',
                          brandTextColor,
                          setBrandTextColor,
                          DEFAULT_E_WAITER_BRAND_COLORS.text,
                          'fieldBrandText',
                        ],
                      ])
                    ).map(([key, value, setValue, fallback, labelKey]) => {
                      const pickerValue = isValidBrandHex(value)
                        ? value.trim()
                        : fallback
                      const err = fieldErrors[key]
                      return (
                        <div key={key} className="space-y-hisabi-xs">
                          <label
                            className="type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block"
                            htmlFor={`${idPrefix}-${key}`}
                          >
                            {t(labelKey)}
                          </label>
                          <div className="flex items-center gap-hisabi-sm">
                            <input
                              id={`${idPrefix}-${key}-picker`}
                              type="color"
                              value={pickerValue}
                              disabled={!canUpdate}
                              aria-label={t(labelKey)}
                              onChange={(e) => {
                                setValue(e.target.value)
                                setFieldErrors((prev) =>
                                  prev[key] ? { ...prev, [key]: '' } : prev,
                                )
                              }}
                              className="border-hisabi-outline-variant h-11 w-12 shrink-0 cursor-pointer rounded-lg border bg-hisabi-surface-container-lowest p-1 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <input
                              id={`${idPrefix}-${key}`}
                              type="text"
                              inputMode="text"
                              maxLength={7}
                              placeholder={fallback}
                              value={value}
                              onChange={(e) => {
                                setValue(e.target.value)
                                setFieldErrors((prev) =>
                                  prev[key] ? { ...prev, [key]: '' } : prev,
                                )
                              }}
                              className={cn(
                                fieldClass,
                                err &&
                                  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                              )}
                              aria-invalid={err ? true : undefined}
                            />
                            {value.trim() ? (
                              <button
                                type="button"
                                className="type-label-md text-hisabi-on-surface-variant hover:text-hisabi-on-surface shrink-0 px-hisabi-sm py-2 underline-offset-2 hover:underline disabled:opacity-50"
                                disabled={!canUpdate}
                                onClick={() => {
                                  setValue('')
                                  setFieldErrors((prev) =>
                                    prev[key] ? { ...prev, [key]: '' } : prev,
                                  )
                                }}
                              >
                                {t('brandColorClear')}
                              </button>
                            ) : null}
                          </div>
                          {err ? (
                            <p
                              className="type-body-sm text-hisabi-error"
                              role="alert"
                            >
                              {err}
                            </p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </SettingsSection>

                <SettingsSection title={t('sectionRestaurantLocation')} icon={MapPin}>
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('restaurantLocationHint')}
                  </p>
                  <div className="flex flex-wrap gap-hisabi-sm">
                    <button
                      type="button"
                      disabled={!canUpdate || geoPending}
                      onClick={handleUseCurrentLocation}
                      className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 inline-flex items-center gap-hisabi-xs rounded-xl border-2 px-hisabi-lg py-2.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MapPin className="size-4 shrink-0" aria-hidden />
                      {geoPending
                        ? t('locationGeoPending')
                        : t('locationUseCurrent')}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-hisabi-lg md:grid-cols-2">
                    <div className="space-y-hisabi-xs">
                      <label
                        className="type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block"
                        htmlFor={`${idPrefix}-location-lat`}
                      >
                        {t('fieldLocationLat')}
                      </label>
                      <input
                        id={`${idPrefix}-location-lat`}
                        type="text"
                        inputMode="decimal"
                        placeholder={t('fieldLocationLatPlaceholder')}
                        value={locationLat}
                        onChange={(e) => {
                          setLocationLat(e.target.value)
                          setFieldErrors((prev) =>
                            prev.locationLat
                              ? { ...prev, locationLat: '' }
                              : prev,
                          )
                        }}
                        className={cn(
                          fieldClass,
                          fieldErrors.locationLat &&
                            'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                        )}
                        aria-invalid={
                          fieldErrors.locationLat ? true : undefined
                        }
                      />
                      {fieldErrors.locationLat ? (
                        <p
                          className="type-body-sm text-hisabi-error"
                          role="alert"
                        >
                          {fieldErrors.locationLat}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-hisabi-xs">
                      <label
                        className="type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block"
                        htmlFor={`${idPrefix}-location-lng`}
                      >
                        {t('fieldLocationLng')}
                      </label>
                      <input
                        id={`${idPrefix}-location-lng`}
                        type="text"
                        inputMode="decimal"
                        placeholder={t('fieldLocationLngPlaceholder')}
                        value={locationLng}
                        onChange={(e) => {
                          setLocationLng(e.target.value)
                          setFieldErrors((prev) =>
                            prev.locationLng
                              ? { ...prev, locationLng: '' }
                              : prev,
                          )
                        }}
                        className={cn(
                          fieldClass,
                          fieldErrors.locationLng &&
                            'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                        )}
                        aria-invalid={
                          fieldErrors.locationLng ? true : undefined
                        }
                      />
                      {fieldErrors.locationLng ? (
                        <p
                          className="type-body-sm text-hisabi-error"
                          role="alert"
                        >
                          {fieldErrors.locationLng}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-hisabi-xs md:col-span-2">
                      <label
                        className="type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block"
                        htmlFor={`${idPrefix}-location-radius`}
                      >
                        {t('fieldLocationRadius')}
                      </label>
                      <input
                        id={`${idPrefix}-location-radius`}
                        type="text"
                        inputMode="numeric"
                        placeholder={t('fieldLocationRadiusPlaceholder')}
                        value={locationRadiusMeters}
                        onChange={(e) => {
                          setLocationRadiusMeters(e.target.value)
                          setFieldErrors((prev) =>
                            prev.locationRadiusMeters
                              ? { ...prev, locationRadiusMeters: '' }
                              : prev,
                          )
                        }}
                        className={cn(
                          fieldClass,
                          'max-w-xs',
                          fieldErrors.locationRadiusMeters &&
                            'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                        )}
                        aria-invalid={
                          fieldErrors.locationRadiusMeters ? true : undefined
                        }
                      />
                      <p className="type-body-sm text-hisabi-on-surface-variant">
                        {t('fieldLocationRadiusHint')}
                      </p>
                      {fieldErrors.locationRadiusMeters ? (
                        <p
                          className="type-body-sm text-hisabi-error"
                          role="alert"
                        >
                          {fieldErrors.locationRadiusMeters}
                        </p>
                      ) : null}
                    </div>
                  </div>
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
