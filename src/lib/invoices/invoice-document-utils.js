/** @param {string} name */
export function companyInitialsForName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase() || '?'
}

/**
 * @param {string} businessProfileId
 * @param {string | Date} updatedAt
 * @param {boolean | string | null | undefined} hasLogo
 * @param {string} [logoUrlBase]
 */
export function sellerLogoUrlForInvoice(
  businessProfileId,
  updatedAt,
  hasLogo,
  logoUrlBase = '/api/auth/business-profiles',
) {
  if (!businessProfileId || !hasLogo) return null
  const t =
    updatedAt instanceof Date
      ? updatedAt.toISOString()
      : String(updatedAt ?? '')
  return `${logoUrlBase}/${businessProfileId}/logo?t=${encodeURIComponent(t)}`
}

/**
 * @param {string} documentId
 * @param {string | Date | null | undefined} updatedAt
 * @param {boolean | string | null | undefined} hasSignature
 * @param {string} urlBase
 */
export function preparedBySignatureUrlForDocument(
  documentId,
  updatedAt,
  hasSignature,
  urlBase,
) {
  if (!documentId || !hasSignature || !urlBase) return null
  const t =
    updatedAt instanceof Date
      ? updatedAt.toISOString()
      : String(updatedAt ?? '')
  return `${urlBase}/${documentId}/prepared-by-signature?t=${encodeURIComponent(t)}`
}

/** @param {string | number | null | undefined} s */
export function parseInvoiceMoney(s) {
  const n = Number.parseFloat(String(s ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}
