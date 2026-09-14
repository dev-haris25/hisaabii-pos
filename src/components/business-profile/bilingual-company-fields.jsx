'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { BilingualCompanyAddressFields } from '@/components/business-profile/bilingual-company-address-fields'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { useSuppressBrowserAutofillUntilFocus } from '@/hooks/use-suppress-browser-autofill-until-focus'
import { shouldEnableBilingualTranslate } from '@/lib/i18n/use-bilingual-field-origin'
import { cn } from '@/lib/utils'

/**
 * @typedef {{
 *   companyNameEn: string
 *   companyNameAr: string
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
 *   onCompanyNameEnChange: (v: string) => void
 *   onCompanyNameArChange: (v: string) => void
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
 *     companyNameAr?: string
 *     districtAr?: string
 *     cityAr?: string
 *     streetAr?: string
 *     postalCode?: string
 *     buildingNumber?: string
 *   }
 *   fieldClass: string
 *   idPrefix?: string
 *   companyNameEnBaseline?: string
 *   streetEnBaseline?: string
 *   districtEnBaseline?: string
 *   cityEnBaseline?: string
 *   onClearAddressFieldError?: (key: string) => void
 *   geminiSuggestionEnabled?: boolean
 *   fieldOrigin: ReturnType<typeof import('@/lib/i18n/use-bilingual-field-origin').useBilingualFieldOrigin>
 * }} BilingualCompanyFieldsProps
 */

/**
 * @param {BilingualCompanyFieldsProps} props
 */
export function BilingualCompanyFields({
  companyNameEn,
  companyNameAr,
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
  onCompanyNameEnChange,
  onCompanyNameArChange,
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
  fieldClass,
  idPrefix = 'company',
  companyNameEnBaseline,
  streetEnBaseline,
  districtEnBaseline,
  cityEnBaseline,
  onClearAddressFieldError,
  geminiSuggestionEnabled = true,
  fieldOrigin,
}) {
  const t = useTranslations('BilingualInvoiceCompany')
  const { origin, reportUserInput, markAutoFilled, consumeAutoFillSkip } =
    fieldOrigin

  const { loading: loadingNameAr } = useGeminiArSuggestion(
    companyNameEn,
    (ar) => {
      markAutoFilled('ar', 'company.name', ar)
      onCompanyNameArChange(ar)
    },
    {
      englishBaseline: companyNameEnBaseline,
      enabled:
        geminiSuggestionEnabled &&
        shouldEnableBilingualTranslate(origin, 'en', companyNameAr),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip('company.name', 'en', trimmed),
    },
  )
  const { loading: loadingNameEn } = useGeminiEnSuggestion(
    companyNameAr,
    (en) => {
      markAutoFilled('en', 'company.name', en)
      onCompanyNameEnChange(en)
    },
    {
      enabled:
        geminiSuggestionEnabled &&
        shouldEnableBilingualTranslate(origin, 'ar', companyNameEn),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip('company.name', 'ar', trimmed),
    },
  )
  const companyNameArAutofill = useSuppressBrowserAutofillUntilFocus()

  return (
    <div className="space-y-hisabi-lg">
      <p
        className="type-body-sm text-hisabi-on-surface-variant rounded-xl border border-hisabi-outline-variant/60 bg-hisabi-surface-container-low px-hisabi-md py-hisabi-sm"
        role="note"
      >
        {t('arabicZatcaNotice')}
      </p>

      <div
        dir="ltr"
        className="grid grid-cols-1 gap-x-hisabi-lg gap-y-hisabi-md min-[480px]:grid-cols-2"
      >
          <div className="min-w-0 space-y-hisabi-xs text-start">
            <label
              className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
              htmlFor={`${idPrefix}-name-en`}
            >
              {t('companyNameEnglish')}
              {loadingNameEn ? (
                <Loader2
                  className="text-hisabi-teal size-4 shrink-0 animate-spin"
                  aria-label={t('translating')}
                />
              ) : null}
            </label>
            <input
              id={`${idPrefix}-name-en`}
              name="companyNameEn"
              type="text"
              autoComplete="organization"
              placeholder={t('companyNameEnglishPlaceholder')}
              value={companyNameEn}
              onChange={(e) => {
                reportUserInput('en', 'company.name', {
                  otherFieldEmpty: !companyNameAr.trim(),
                })
                onCompanyNameEnChange(e.target.value)
              }}
              className={fieldClass}
              dir="ltr"
            />
          </div>
          <div className="min-w-0 space-y-hisabi-xs text-left">
            <label
              className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
              htmlFor={`${idPrefix}-name-ar`}
            >
              {t('companyNameArabic')}
              <RequiredMark />
              {loadingNameAr ? (
                <Loader2
                  className="text-hisabi-teal size-4 shrink-0 animate-spin"
                  aria-label={t('translating')}
                />
              ) : null}
            </label>
            <input
              id={`${idPrefix}-name-ar`}
              name="companyNameAr"
              type="text"
              autoComplete="off"
              placeholder={t('companyNameArabicPlaceholder')}
              value={companyNameAr}
              onChange={(e) => {
                reportUserInput('ar', 'company.name', {
                  otherFieldEmpty: !companyNameEn.trim(),
                })
                onCompanyNameArChange(e.target.value)
                onClearAddressFieldError?.('companyNameAr')
              }}
              {...companyNameArAutofill}
              className={cn(
                fieldClass,
                fieldErrors.companyNameAr &&
                  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
              )}
              dir="rtl"
              aria-required="true"
              aria-invalid={fieldErrors.companyNameAr ? true : undefined}
              aria-describedby={
                fieldErrors.companyNameAr
                  ? `${idPrefix}-name-ar-error`
                  : undefined
              }
            />
            {fieldErrors.companyNameAr ? (
              <p
                id={`${idPrefix}-name-ar-error`}
                className="type-body-sm text-hisabi-error"
                role="alert"
              >
                {fieldErrors.companyNameAr}
              </p>
            ) : null}
          </div>
      </div>

      <BilingualCompanyAddressFields
        idPrefix={idPrefix}
        fieldClass={fieldClass}
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
        onStreetEnChange={onStreetEnChange}
        onStreetArChange={onStreetArChange}
        onDistrictEnChange={onDistrictEnChange}
        onDistrictArChange={onDistrictArChange}
        onCityEnChange={onCityEnChange}
        onCityArChange={onCityArChange}
        onBuildingNumberChange={onBuildingNumberChange}
        onSecondaryNumberChange={onSecondaryNumberChange}
        onPostalCodeChange={onPostalCodeChange}
        onShortAddressChange={onShortAddressChange}
        fieldErrors={fieldErrors}
        streetEnBaseline={streetEnBaseline}
        districtEnBaseline={districtEnBaseline}
        cityEnBaseline={cityEnBaseline}
        onClearAddressFieldError={onClearAddressFieldError}
        geminiSuggestionEnabled={geminiSuggestionEnabled}
        fieldOrigin={fieldOrigin}
      />
    </div>
  )
}
