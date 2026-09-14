/**
 * Saudi national address one-liner order:
 * building number → street → district → city → postal code → secondary number
 *
 * @param {{
 *   streetAr: string
 *   districtAr: string
 *   cityAr: string
 *   buildingNumber: string
 *   secondaryNumber?: string
 *   postalCode: string
 * }} p
 * @param {number} [maxLen]
 */
export function joinInvoiceAddressAr(p, maxLen = 300) {
  const bits = [
    String(p.buildingNumber ?? '').trim(),
    String(p.streetAr ?? '').trim(),
    String(p.districtAr ?? '').trim(),
    String(p.cityAr ?? '').trim(),
    String(p.postalCode ?? '').trim(),
    String(p.secondaryNumber ?? '').trim(),
  ].filter(Boolean)
  return bits.join('، ').slice(0, maxLen)
}

/**
 * Saudi national address one-liner order:
 * building number → street → district → city → postal code → secondary number
 *
 * @param {{
 *   streetEn: string
 *   districtEn: string
 *   cityEn: string
 *   buildingNumber: string
 *   secondaryNumber?: string
 *   postalCode: string
 * }} p
 * @param {number} [maxLen]
 */
export function joinInvoiceAddressEn(p, maxLen = 300) {
  const bits = [
    String(p.buildingNumber ?? '').trim(),
    String(p.streetEn ?? '').trim(),
    String(p.districtEn ?? '').trim(),
    String(p.cityEn ?? '').trim(),
    String(p.postalCode ?? '').trim(),
    String(p.secondaryNumber ?? '').trim(),
  ].filter(Boolean)
  return bits.join(', ').slice(0, maxLen)
}
