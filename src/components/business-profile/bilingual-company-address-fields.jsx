'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useIsRtl } from '@/components/auth/use-is-rtl'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { useSuppressBrowserAutofillUntilFocus } from '@/hooks/use-suppress-browser-autofill-until-focus'
import { shouldEnableBilingualTranslate } from '@/lib/i18n/use-bilingual-field-origin'
import { cn } from '@/lib/utils'

/**
 * @param {{
 *   idPrefix?: string
 *   fieldClass: string
 *   streetEn: string
 *   streetAr: string
 *   districtEn: string
 *   districtAr: string
 *   cityEn: string
 *   cityAr: string
 *   buildingNumber: string
 *   secondaryNumber?: string
 *   postalCode: string
 *   shortAddress?: string
 *   onStreetEnChange: (v: string) => void
 *   onStreetArChange: (v: string) => void
 *   onDistrictEnChange: (v: string) => void
 *   onDistrictArChange: (v: string) => void
 *   onCityEnChange: (v: string) => void
 *   onCityArChange: (v: string) => void
 *   onBuildingNumberChange: (v: string) => void
 *   onSecondaryNumberChange?: (v: string) => void
 *   onPostalCodeChange: (v: string) => void
 *   onShortAddressChange?: (v: string) => void
 *   fieldErrors: {
 *     districtAr?: string
 *     cityAr?: string
 *     streetAr?: string
 *     postalCode?: string
 *     buildingNumber?: string
 *   }
 *   streetEnBaseline?: string
 *   districtEnBaseline?: string
 *   cityEnBaseline?: string
 *   onClearAddressFieldError?: (key: string) => void
 *   geminiSuggestionEnabled?: boolean
 *   fieldOrigin: ReturnType<typeof import('@/lib/i18n/use-bilingual-field-origin').useBilingualFieldOrigin>
 * }} props
 */
export function BilingualCompanyAddressFields({
  idPrefix = 'company',
  fieldClass,
  streetEn,
  streetAr,
  districtEn,
  districtAr,
  cityEn,
  cityAr,
  buildingNumber,
  secondaryNumber = '',
  postalCode,
  shortAddress = '',
  onStreetEnChange,
  onStreetArChange,
  onDistrictEnChange,
  onDistrictArChange,
  onCityEnChange,
  onCityArChange,
  onBuildingNumberChange,
  onSecondaryNumberChange,
  onPostalCodeChange,
  onShortAddressChange,
  fieldErrors,
  streetEnBaseline,
  districtEnBaseline,
  cityEnBaseline,
  onClearAddressFieldError,
  geminiSuggestionEnabled = true,
  fieldOrigin,
}) {
  const t = useTranslations('BilingualInvoiceCompany')
  const isRtl = useIsRtl()
  const alignInLtrShell = isRtl ? 'text-end' : 'text-start'
  const { origin, reportUserInput, markAutoFilled, consumeAutoFillSkip } =
    fieldOrigin

  const { loading: loadingStreetAr } = useGeminiArSuggestion(
    streetEn,
    (ar) => {
      markAutoFilled('ar', 'company.street', ar)
      onStreetArChange(ar)
    },
    {
      englishBaseline: streetEnBaseline,
      enabled:
        geminiSuggestionEnabled &&
        shouldEnableBilingualTranslate(origin, 'en', streetAr),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip('company.street', 'en', trimmed),
    },
  )
  const { loading: loadingStreetEn } = useGeminiEnSuggestion(
    streetAr,
    (en) => {
      markAutoFilled('en', 'company.street', en)
      onStreetEnChange(en)
    },
    {
      enabled:
        geminiSuggestionEnabled &&
        shouldEnableBilingualTranslate(origin, 'ar', streetEn),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip('company.street', 'ar', trimmed),
    },
  )
  const { loading: loadingDistrictAr } = useGeminiArSuggestion(
    districtEn,
    (ar) => {
      markAutoFilled('ar', 'company.district', ar)
      onDistrictArChange(ar)
    },
    {
      englishBaseline: districtEnBaseline,
      enabled:
        geminiSuggestionEnabled &&
        shouldEnableBilingualTranslate(origin, 'en', districtAr),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip('company.district', 'en', trimmed),
    },
  )
  const { loading: loadingDistrictEn } = useGeminiEnSuggestion(
    districtAr,
    (en) => {
      markAutoFilled('en', 'company.district', en)
      onDistrictEnChange(en)
    },
    {
      enabled:
        geminiSuggestionEnabled &&
        shouldEnableBilingualTranslate(origin, 'ar', districtEn),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip('company.district', 'ar', trimmed),
    },
  )
  const { loading: loadingCityAr } = useGeminiArSuggestion(
    cityEn,
    (ar) => {
      markAutoFilled('ar', 'company.city', ar)
      onCityArChange(ar)
    },
    {
      englishBaseline: cityEnBaseline,
      enabled:
        geminiSuggestionEnabled &&
        shouldEnableBilingualTranslate(origin, 'en', cityAr),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip('company.city', 'en', trimmed),
    },
  )
  const { loading: loadingCityEn } = useGeminiEnSuggestion(
    cityAr,
    (en) => {
      markAutoFilled('en', 'company.city', en)
      onCityEnChange(en)
    },
    {
      enabled:
        geminiSuggestionEnabled &&
        shouldEnableBilingualTranslate(origin, 'ar', cityEn),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip('company.city', 'ar', trimmed),
    },
  )

  const streetArAutofill = useSuppressBrowserAutofillUntilFocus()
  const districtArAutofill = useSuppressBrowserAutofillUntilFocus()
  const cityArAutofill = useSuppressBrowserAutofillUntilFocus()

  const invoiceAddressHasError = Boolean(
    fieldErrors.districtAr || fieldErrors.cityAr || fieldErrors.streetAr,
  )

  function clearAr(/** @type {string} */ key) {
    onClearAddressFieldError?.(key)
  }

  return (
    <div className="space-y-hisabi-md">
      <div
        dir="ltr"
        className="grid grid-cols-1 gap-hisabi-md md:grid-cols-2"
      >
        <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
          <label
            className={cn(
              'type-label-md text-hisabi-on-surface-variant flex flex-wrap items-center gap-hisabi-xs',
              alignInLtrShell,
              isRtl && 'justify-end',
            )}
            htmlFor={`${idPrefix}-district-en`}
          >
            {t('fieldDistrictEn')}
            {loadingDistrictEn ? (
              <Loader2
                className="text-hisabi-teal size-4 shrink-0 animate-spin"
                aria-label={t('translating')}
              />
            ) : null}
          </label>
          <input
            id={`${idPrefix}-district-en`}
            value={districtEn}
            onChange={(e) => {
              reportUserInput('en', 'company.district', {
                otherFieldEmpty: !districtAr.trim(),
              })
              onDistrictEnChange(e.target.value.slice(0, 200))
              clearAr('districtAr')
            }}
            className={fieldClass}
            dir="ltr"
            placeholder={t('placeholderDistrictEn')}
          />
        </div>
        <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
          <label
            className={cn(
              'type-label-md text-hisabi-on-surface-variant flex flex-wrap items-center gap-hisabi-xs',
              alignInLtrShell,
              isRtl && 'justify-end',
            )}
            htmlFor={`${idPrefix}-district-ar`}
          >
            {t('fieldDistrictAr')}
            <RequiredMark />
            {loadingDistrictAr ? (
              <Loader2
                className="text-hisabi-teal size-4 shrink-0 animate-spin"
                aria-label={t('translating')}
              />
            ) : null}
          </label>
          <input
            id={`${idPrefix}-district-ar`}
            value={districtAr}
            onChange={(e) => {
              reportUserInput('ar', 'company.district', {
                otherFieldEmpty: !districtEn.trim(),
              })
              onDistrictArChange(e.target.value.slice(0, 200))
              clearAr('districtAr')
            }}
            className={cn(
              fieldClass,
              invoiceAddressHasError &&
                'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
            )}
            dir="rtl"
            autoComplete="off"
            placeholder={t('placeholderDistrictAr')}
            aria-invalid={fieldErrors.districtAr ? true : undefined}
            {...districtArAutofill}
          />
          {fieldErrors.districtAr ? (
            <p className="type-body-sm text-hisabi-error" role="alert">
              {fieldErrors.districtAr}
            </p>
          ) : null}
        </div>
      </div>

      <div
        dir="ltr"
        className="grid grid-cols-1 gap-hisabi-md md:grid-cols-2"
      >
        <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
          <label
            className={cn(
              'type-label-md text-hisabi-on-surface-variant flex flex-wrap items-center gap-hisabi-xs',
              alignInLtrShell,
              isRtl && 'justify-end',
            )}
            htmlFor={`${idPrefix}-city-en`}
          >
            {t('fieldCityEn')}
            {loadingCityEn ? (
              <Loader2
                className="text-hisabi-teal size-4 shrink-0 animate-spin"
                aria-label={t('translating')}
              />
            ) : null}
          </label>
          <input
            id={`${idPrefix}-city-en`}
            value={cityEn}
            onChange={(e) => {
              reportUserInput('en', 'company.city', {
                otherFieldEmpty: !cityAr.trim(),
              })
              onCityEnChange(e.target.value.slice(0, 200))
              clearAr('cityAr')
            }}
            className={fieldClass}
            dir="ltr"
            placeholder={t('placeholderCityEn')}
          />
        </div>
        <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
          <label
            className={cn(
              'type-label-md text-hisabi-on-surface-variant flex flex-wrap items-center gap-hisabi-xs',
              alignInLtrShell,
              isRtl && 'justify-end',
            )}
            htmlFor={`${idPrefix}-city-ar`}
          >
            {t('fieldCityAr')}
            <RequiredMark />
            {loadingCityAr ? (
              <Loader2
                className="text-hisabi-teal size-4 shrink-0 animate-spin"
                aria-label={t('translating')}
              />
            ) : null}
          </label>
          <input
            id={`${idPrefix}-city-ar`}
            value={cityAr}
            onChange={(e) => {
              reportUserInput('ar', 'company.city', {
                otherFieldEmpty: !cityEn.trim(),
              })
              onCityArChange(e.target.value.slice(0, 200))
              clearAr('cityAr')
            }}
            className={cn(
              fieldClass,
              invoiceAddressHasError &&
                'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
            )}
            dir="rtl"
            autoComplete="off"
            placeholder={t('placeholderCityAr')}
            aria-invalid={fieldErrors.cityAr ? true : undefined}
            {...cityArAutofill}
          />
          {fieldErrors.cityAr ? (
            <p className="type-body-sm text-hisabi-error" role="alert">
              {fieldErrors.cityAr}
            </p>
          ) : null}
        </div>
      </div>

      <div
        dir="ltr"
        className="grid grid-cols-1 gap-hisabi-md md:grid-cols-2"
      >
        <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
          <label
            className={cn(
              'type-label-md text-hisabi-on-surface-variant flex flex-wrap items-center gap-hisabi-xs',
              alignInLtrShell,
              isRtl && 'justify-end',
            )}
            htmlFor={`${idPrefix}-street-en`}
          >
            {t('fieldStreetEn')}
            {loadingStreetEn ? (
              <Loader2
                className="text-hisabi-teal size-4 shrink-0 animate-spin"
                aria-label={t('translating')}
              />
            ) : null}
          </label>
          <input
            id={`${idPrefix}-street-en`}
            value={streetEn}
            onChange={(e) => {
              reportUserInput('en', 'company.street', {
                otherFieldEmpty: !streetAr.trim(),
              })
              onStreetEnChange(e.target.value.slice(0, 200))
              clearAr('streetAr')
            }}
            className={fieldClass}
            dir="ltr"
            placeholder={t('placeholderStreetEn')}
          />
        </div>
        <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
          <label
            className={cn(
              'type-label-md text-hisabi-on-surface-variant flex flex-wrap items-center gap-hisabi-xs',
              alignInLtrShell,
              isRtl && 'justify-end',
            )}
            htmlFor={`${idPrefix}-street-ar`}
          >
            {t('fieldStreetAr')}
            <RequiredMark />
            {loadingStreetAr ? (
              <Loader2
                className="text-hisabi-teal size-4 shrink-0 animate-spin"
                aria-label={t('translating')}
              />
            ) : null}
          </label>
          <input
            id={`${idPrefix}-street-ar`}
            value={streetAr}
            onChange={(e) => {
              reportUserInput('ar', 'company.street', {
                otherFieldEmpty: !streetEn.trim(),
              })
              onStreetArChange(e.target.value.slice(0, 200))
              clearAr('streetAr')
            }}
            className={cn(
              fieldClass,
              invoiceAddressHasError &&
                'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
            )}
            dir="rtl"
            autoComplete="off"
            placeholder={t('placeholderStreetAr')}
            aria-invalid={fieldErrors.streetAr ? true : undefined}
            {...streetArAutofill}
          />
          {fieldErrors.streetAr ? (
            <p className="type-body-sm text-hisabi-error" role="alert">
              {fieldErrors.streetAr}
            </p>
          ) : null}
        </div>
      </div>

      <div
        dir="ltr"
        className="grid grid-cols-1 gap-hisabi-md md:grid-cols-2"
      >
        <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
          <label
            className={cn(
              'type-label-md flex flex-wrap items-center gap-hisabi-xs text-hisabi-on-surface-variant',
              alignInLtrShell,
              isRtl && 'justify-end',
            )}
            htmlFor={`${idPrefix}-postal`}
          >
            {t('fieldPostalCode')}
            <RequiredMark />
          </label>
          <input
            id={`${idPrefix}-postal`}
            value={postalCode}
            onChange={(e) => {
              onPostalCodeChange(e.target.value.slice(0, 40))
              clearAr('postalCode')
            }}
            className={cn(
              fieldClass,
              fieldErrors.postalCode &&
                'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
            )}
            dir="ltr"
            placeholder={t('placeholderPostalCode')}
            aria-invalid={fieldErrors.postalCode ? true : undefined}
          />
          {fieldErrors.postalCode ? (
            <p className="type-body-sm text-hisabi-error" role="alert">
              {fieldErrors.postalCode}
            </p>
          ) : null}
        </div>
        <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
          <label
            className={cn(
              'type-label-md flex flex-wrap items-center gap-hisabi-xs text-hisabi-on-surface-variant',
              alignInLtrShell,
              isRtl && 'justify-end',
            )}
            htmlFor={`${idPrefix}-building`}
          >
            {t('fieldBuildingNumber')}
            <RequiredMark />
          </label>
          <input
            id={`${idPrefix}-building`}
            value={buildingNumber}
            onChange={(e) => {
              onBuildingNumberChange(e.target.value.slice(0, 80))
              clearAr('buildingNumber')
            }}
            className={cn(
              fieldClass,
              fieldErrors.buildingNumber &&
                'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
            )}
            dir="ltr"
            placeholder={t('placeholderBuildingNumber')}
            aria-invalid={fieldErrors.buildingNumber ? true : undefined}
          />
          {fieldErrors.buildingNumber ? (
            <p className="type-body-sm text-hisabi-error" role="alert">
              {fieldErrors.buildingNumber}
            </p>
          ) : null}
        </div>
      </div>

      {typeof onSecondaryNumberChange === 'function' ||
      typeof onShortAddressChange === 'function' ? (
        <div
          dir="ltr"
          className="grid grid-cols-1 gap-hisabi-md md:grid-cols-2"
        >
          {typeof onSecondaryNumberChange === 'function' ? (
            <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
              <label
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant block',
                  alignInLtrShell,
                  isRtl && 'justify-end',
                )}
                htmlFor={`${idPrefix}-secondary-number`}
              >
                {t('fieldSecondaryNumber')}
              </label>
              <input
                id={`${idPrefix}-secondary-number`}
                value={secondaryNumber}
                onChange={(e) =>
                  onSecondaryNumberChange(e.target.value.slice(0, 80))
                }
                className={fieldClass}
                dir="ltr"
                placeholder={t('placeholderSecondaryNumber')}
                autoComplete="off"
              />
            </div>
          ) : (
            <div />
          )}
          {typeof onShortAddressChange === 'function' ? (
            <div className={cn('space-y-hisabi-xs', alignInLtrShell)}>
              <label
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant block',
                  alignInLtrShell,
                  isRtl && 'justify-end',
                )}
                htmlFor={`${idPrefix}-short-address`}
              >
                {t('fieldShortAddress')}
              </label>
              <input
                id={`${idPrefix}-short-address`}
                value={shortAddress}
                onChange={(e) =>
                  onShortAddressChange(e.target.value.slice(0, 300))
                }
                className={fieldClass}
                dir="ltr"
                placeholder={t('placeholderShortAddress')}
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
