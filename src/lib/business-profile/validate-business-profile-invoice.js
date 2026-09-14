import {
  applyInvoiceAddressValidation,
  createInvoiceAddressFieldErrors,
} from '@/lib/invoices/validate-invoice-address-fields'

/**
 * @param {{
 *   companyNameAr: string
 *   companyNameEn: string
 *   composedInvoiceAddressAr: string
 *   composedInvoiceAddressEn: string
 *   streetAr: string
 *   districtAr: string
 *   cityAr: string
 *   streetEn: string
 *   districtEn: string
 *   cityEn: string
 *   buildingNumber: string
 *   postalCode: string
 *   crNumber?: string
 *   vatNumber?: string
 *   customVatPercent?: string
 *   useCustomRate?: boolean
 *   requireTaxIds?: boolean
 * }} input
 * @param {{
 *   tB: (key: string) => string
 *   tTax?: (key: string) => string
 *   tClients?: (key: string, values?: import('next-intl').TranslationValues) => string
 * }} translators
 */
export function validateBusinessProfileInvoiceFields(input, translators) {
  const { tB, tTax, tClients } = translators
  const tAddr = tClients ?? tB

  /** @type {Record<string, string>} */
  const nextErrors = {
    companyNameAr: '',
    crNumber: '',
    vatNumber: '',
    customVatPercent: '',
    ...createInvoiceAddressFieldErrors(),
  }

  if (!input.companyNameAr.trim()) {
    nextErrors.companyNameAr = tB('validationCompanyNameArRequired')
  }

  if (input.requireTaxIds && tTax) {
    if (!String(input.crNumber ?? '').replace(/\D/g, '')) {
      nextErrors.crNumber = tTax('validationCrRequired')
    }
    if (!String(input.vatNumber ?? '').replace(/\D/g, '')) {
      nextErrors.vatNumber = tTax('validationVatRequired')
    }
  }

  applyInvoiceAddressValidation(
    nextErrors,
    {
      streetAr: input.streetAr,
      districtAr: input.districtAr,
      cityAr: input.cityAr,
      streetEn: input.streetEn,
      districtEn: input.districtEn,
      cityEn: input.cityEn,
      buildingNumber: input.buildingNumber,
      postalCode: input.postalCode,
      composedInvoiceAddressAr: input.composedInvoiceAddressAr,
      composedInvoiceAddressEn: input.composedInvoiceAddressEn,
    },
    tAddr,
    tClients ? 'Clients' : 'BilingualInvoiceCompany',
  )

  if (
    input.useCustomRate &&
    input.customVatPercent != null &&
    tTax
  ) {
    const v = input.customVatPercent.trim()
    const invalid =
      !v ||
      v === '.' ||
      Number.isNaN(Number.parseFloat(v)) ||
      Number.parseFloat(v) < 0 ||
      Number.parseFloat(v) > 100
    if (invalid) {
      nextErrors.customVatPercent = tTax('validationCustomVatRequired')
    }
  }

  const hasError = Object.values(nextErrors).some(Boolean)
  return { ok: !hasError, errors: nextErrors }
}

/**
 * @param {{
 *   companyNameEn: string
 *   companyNameAr: string
 *   streetEn: string
 *   streetAr: string
 *   districtEn: string
 *   districtAr: string
 *   cityEn: string
 *   cityAr: string
 *   buildingNumber: string
 *   postalCode: string
 *   composedInvoiceAddressAr: string
 *   composedInvoiceAddressEn: string
 * }} state
 */
export function buildBusinessProfileConfirmSnapshot(state) {
  return {
    companyNameEn: state.companyNameEn,
    companyNameAr: state.companyNameAr,
    addressEn: state.composedInvoiceAddressEn,
    addressAr: state.composedInvoiceAddressAr,
    streetEn: state.streetEn,
    streetAr: state.streetAr,
    districtEn: state.districtEn,
    districtAr: state.districtAr,
    cityEn: state.cityEn,
    cityAr: state.cityAr,
  }
}

/**
 * @param {null | {
 *   companyNameEn: string
 *   companyNameAr: string
 *   addressEn: string
 *   addressAr: string
 *   streetEn?: string
 *   streetAr?: string
 *   districtEn?: string
 *   districtAr?: string
 *   cityEn?: string
 *   cityAr?: string
 * }} invoiceFields
 * @param {{
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
 *   composedInvoiceAddressAr: string
 *   composedInvoiceAddressEn: string
 *   crNumber: string
 *   vatNumber: string
 *   defaultVat: string
 *   useCustomRate: boolean
 *   customVatPercent: string
 * }} state
 */
export function buildBusinessProfileApiBody(invoiceFields, state) {
  const cnAr = (invoiceFields?.companyNameAr ?? state.companyNameAr).trim()
  const cnEn = (invoiceFields?.companyNameEn ?? state.companyNameEn).trim()

  const useStructured = invoiceFields && 'streetEn' in invoiceFields
  const streetEn = useStructured
    ? String(invoiceFields.streetEn ?? '')
    : state.streetEn
  const streetAr = useStructured
    ? String(invoiceFields.streetAr ?? '')
    : state.streetAr
  const districtEn = useStructured
    ? String(invoiceFields.districtEn ?? '')
    : state.districtEn
  const districtAr = useStructured
    ? String(invoiceFields.districtAr ?? '')
    : state.districtAr
  const cityEn = useStructured
    ? String(invoiceFields.cityEn ?? '')
    : state.cityEn
  const cityAr = useStructured
    ? String(invoiceFields.cityAr ?? '')
    : state.cityAr

  const adAr = (
    invoiceFields?.addressAr ?? state.composedInvoiceAddressAr
  ).trim()
  const adEn = (
    invoiceFields?.addressEn ?? state.composedInvoiceAddressEn
  ).trim()

  return {
    companyNameAr: cnAr,
    companyNameEn: cnEn === '' ? null : cnEn,
    crNumber: state.crNumber.trim(),
    vatNumber: state.vatNumber.trim(),
    addressAr: adAr,
    addressEn: adEn === '' ? null : adEn,
    streetAr,
    streetEn,
    districtAr,
    districtEn,
    cityAr,
    cityEn,
    buildingNumber: state.buildingNumber,
    secondaryNumber: String(state.secondaryNumber ?? '').trim(),
    postalCode: state.postalCode,
    shortAddress: String(state.shortAddress ?? '').trim(),
    defaultVatPreset: state.defaultVat,
    useCustomVatRate: state.useCustomRate,
    customVatPercent: state.useCustomRate ? state.customVatPercent : null,
  }
}
