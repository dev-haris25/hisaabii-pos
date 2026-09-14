import {
  normalizeZatcaBuildingNumber,
  normalizeZatcaPostalCode,
} from '@talha7k/zatca'

/**
 * Resolve a single street line from structured or composed address fields.
 *
 * @param {{
 *   street?: string | null
 *   streetAr?: string | null
 *   addressAr?: string | null
 * }} fields
 */
export function resolveStreetFromFields(fields) {
  return String(fields.street ?? fields.streetAr ?? fields.addressAr ?? '').trim()
}

/**
 * Build a ZATCA postal address from stored fields. Callers must validate first —
 * this function does not substitute placeholder literals.
 *
 * @param {{
 *   street?: string | null
 *   building?: string | null
 *   district?: string | null
 *   city?: string | null
 *   postalCode?: string | null
 *   countryCode?: string | null
 *   addressAr?: string | null
 *   streetAr?: string | null
 *   districtAr?: string | null
 *   cityAr?: string | null
 *   buildingNumber?: string | null
 * }} fields
 */
export function buildPostalAddressFromFields(fields) {
  const street = resolveStreetFromFields(fields)
  const building = String(fields.building ?? fields.buildingNumber ?? '').trim()
  const district = String(fields.district ?? fields.districtAr ?? '').trim()
  const city = String(fields.city ?? fields.cityAr ?? '').trim()
  const postalCode = String(fields.postalCode ?? '').trim()
  const countryCode = String(fields.countryCode ?? 'SA').trim() || 'SA'

  return {
    street,
    building: normalizeZatcaBuildingNumber(building),
    district,
    city,
    postalCode: normalizeZatcaPostalCode(postalCode),
    countryCode,
  }
}

/**
 * @param {string} partyLabel e.g. "Buyer" or "Seller"
 * @param {string} code e.g. BUYER_ADDRESS_INCOMPLETE
 * @param {string[]} missing
 */
function addressIncompleteError(partyLabel, code, missing) {
  const err = /** @type {const} */ ({
    code,
    message: `${partyLabel} address is incomplete (${missing.join(', ')})`,
  })
  throw Object.assign(new Error(err.message), err)
}

/**
 * @param {Parameters<typeof buildPostalAddressFromFields>[0]} fields
 * @param {{ partyLabel?: string, code?: string }} [opts]
 */
export function assertCompletePostalAddressFields(fields, opts = {}) {
  const partyLabel = opts.partyLabel ?? 'Party'
  const code = opts.code ?? 'ADDRESS_INCOMPLETE'

  /** @type {string[]} */
  const missing = []
  if (!resolveStreetFromFields(fields)) missing.push('street')
  if (!String(fields.district ?? fields.districtAr ?? '').trim()) missing.push('district')
  if (!String(fields.city ?? fields.cityAr ?? '').trim()) missing.push('city')
  if (!String(fields.building ?? fields.buildingNumber ?? '').trim()) {
    missing.push('building number')
  }
  if (!String(fields.postalCode ?? '').trim()) missing.push('postal code')

  if (missing.length > 0) {
    addressIncompleteError(partyLabel, code, missing)
  }
}
