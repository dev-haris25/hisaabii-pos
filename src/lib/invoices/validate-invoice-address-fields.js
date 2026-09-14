/**
 * @param {Record<string, string>} target
 * @param {(key: string, values?: import('next-intl').TranslationValues) => string} t
 * @param {'Clients' | 'BilingualInvoiceCompany'} ns
 * @param {{ districtAr: string, cityAr: string, streetAr: string }} lines
 */
export function setArabicInvoiceLineRequiredErrors(
  target,
  t,
  ns,
  { districtAr, cityAr, streetAr },
) {
  const line = (labelKey) =>
    t('validationArabicInvoiceLineRequired', {
      field: t(labelKey),
    })

  const districtLabel =
    ns === 'Clients' ? 'invoiceArabicFieldDistrict' : 'fieldDistrictAr'
  const cityLabel =
    ns === 'Clients' ? 'invoiceArabicFieldCity' : 'fieldCityAr'
  const streetLabel =
    ns === 'Clients' ? 'invoiceArabicFieldStreet' : 'fieldStreetAr'

  if (!districtAr.trim()) target.districtAr = line(districtLabel)
  if (!cityAr.trim()) target.cityAr = line(cityLabel)
  if (!streetAr.trim()) target.streetAr = line(streetLabel)
}

/** @returns {Record<string, string>} */
export function createInvoiceAddressFieldErrors() {
  return {
    districtAr: '',
    cityAr: '',
    streetAr: '',
    postalCode: '',
    buildingNumber: '',
    addressAr: '',
  }
}

/**
 * Client-style ZATCA address validation (postal, building, Arabic lines when needed).
 *
 * @param {Record<string, string>} nextErrors
 * @param {{
 *   streetAr: string
 *   districtAr: string
 *   cityAr: string
 *   streetEn: string
 *   districtEn: string
 *   cityEn: string
 *   buildingNumber: string
 *   postalCode: string
 *   composedInvoiceAddressAr: string
 *   composedInvoiceAddressEn: string
 * }} fields
 * @param {(key: string, values?: import('next-intl').TranslationValues) => string} t
 * @param {'Clients' | 'BilingualInvoiceCompany'} ns
 */
export function applyInvoiceAddressValidation(
  nextErrors,
  fields,
  t,
  ns,
) {
  if (
    !fields.composedInvoiceAddressAr.trim() &&
    !fields.composedInvoiceAddressEn.trim()
  ) {
    setArabicInvoiceLineRequiredErrors(nextErrors, t, ns, {
      districtAr: fields.districtAr,
      cityAr: fields.cityAr,
      streetAr: fields.streetAr,
    })
  }

  if (!fields.postalCode.trim()) {
    nextErrors.postalCode =
      ns === 'Clients'
        ? t('validationPostalCodeRequired')
        : t('validationPostalCodeRequired')
  }
  if (!fields.buildingNumber.trim()) {
    nextErrors.buildingNumber =
      ns === 'Clients'
        ? t('validationBuildingNumberRequired')
        : t('validationBuildingNumberRequired')
  }
}
