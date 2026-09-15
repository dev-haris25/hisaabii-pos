/** Max decoded logo file size (bytes). */
export const MAX_COMPANY_LOGO_BYTES = 1024 * 1024

/** Allowed upload MIME types for company logos (Supabase Storage + API). */
export const COMPANY_LOGO_MIME_TYPES = /** @type {const} */ ([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

/** @param {string} mime */
export function isAllowedCompanyLogoMime(mime) {
  return COMPANY_LOGO_MIME_TYPES.includes(/** @type {typeof COMPANY_LOGO_MIME_TYPES[number]} */ (mime))
}

/**
 * @param {typeof COMPANY_LOGO_MIME_TYPES[number]} mime
 * @returns {string} File extension (no dot).
 */
export function companyLogoExtensionForMime(mime) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/webp') return 'webp'
  return 'bin'
}

/**
 * Object key inside the `company_logos` bucket.
 * @param {string} userId
 * @param {string} businessProfileId
 * @param {string} mime Allowed logo MIME (validated before upload).
 */
export function companyLogoStoragePath(userId, businessProfileId, mime) {
  const ext = companyLogoExtensionForMime(
    /** @type {typeof COMPANY_LOGO_MIME_TYPES[number]} */ (mime),
  )
  return `${userId}/${businessProfileId}/logo.${ext}`
}

/**
 * @param {string} userId
 * @param {string} businessProfileId
 * @param {string} mime
 */
export function companyStampStoragePath(userId, businessProfileId, mime) {
  const ext = companyLogoExtensionForMime(
    /** @type {typeof COMPANY_LOGO_MIME_TYPES[number]} */ (mime),
  )
  return `${userId}/${businessProfileId}/stamp.${ext}`
}

/**
 * @param {string} userId
 * @param {string} businessProfileId
 * @param {string} mime
 */
export function companySignatureStoragePath(userId, businessProfileId, mime) {
  const ext = companyLogoExtensionForMime(
    /** @type {typeof COMPANY_LOGO_MIME_TYPES[number]} */ (mime),
  )
  return `${userId}/${businessProfileId}/signature.${ext}`
}

/**
 * Personal user signature (Prepared By) — scoped to the user account, not a company.
 * @param {string} userId
 * @param {string} mime
 */
export function userSignatureStoragePath(userId, mime) {
  const ext = companyLogoExtensionForMime(
    /** @type {typeof COMPANY_LOGO_MIME_TYPES[number]} */ (mime),
  )
  return `${userId}/signature.${ext}`
}

/**
 * Object key inside the same `company_logos` bucket as organization logos.
 *
 * @param {string} businessProfileId
 * @param {string} clientId
 * @param {'profile' | 'company-logo'} kind
 * @param {string} mime Allowed image MIME (validated before upload).
 */
export function clientImageStoragePath(businessProfileId, clientId, kind, mime) {
  const ext = companyLogoExtensionForMime(
    /** @type {typeof COMPANY_LOGO_MIME_TYPES[number]} */ (mime),
  )
  const base = kind === 'profile' ? 'profile' : 'company-logo'
  return `clients/${businessProfileId}/${clientId}/${base}.${ext}`
}

/** Max decoded product downloadable file (bytes). */
export const MAX_PRODUCT_FILE_BYTES = 15 * 1024 * 1024

/** Max decoded menu item / product image (bytes). */
export const MAX_MENU_ITEM_IMAGE_BYTES = 10 * 1024 * 1024

/**
 * Relative key under UPLOADS_DIR for a menu item image.
 * @param {string} businessProfileId
 * @param {string} menuItemId
 * @param {string} mime
 */
export function menuItemImageStoragePath(businessProfileId, menuItemId, mime) {
  const ext = companyLogoExtensionForMime(
    /** @type {typeof COMPANY_LOGO_MIME_TYPES[number]} */ (mime),
  )
  return `menu-items/${businessProfileId}/${menuItemId}/image.${ext}`
}

/**
 * @param {string} businessProfileId
 * @param {string} productId
 * @param {'image' | 'file'} kind
 * @param {string} mime
 * @param {string} [fileBaseName] Used for downloadable files (sanitized).
 */
export function productAssetStoragePath(
  businessProfileId,
  productId,
  kind,
  mime,
  fileBaseName,
) {
  if (kind === 'image') {
    const ext = companyLogoExtensionForMime(
      /** @type {typeof COMPANY_LOGO_MIME_TYPES[number]} */ (mime),
    )
    return `products/${businessProfileId}/${productId}/image.${ext}`
  }
  const safe =
    String(fileBaseName ?? 'file')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80) || 'file'
  // Prefer MIME→extension so Content-Type can be inferred from the path if
  // fileMimeType is ever missing. Unknown types keep a neutral `.bin`.
  let ext = 'bin'
  if (mime.includes('pdf')) ext = 'pdf'
  else if (mime.includes('zip')) ext = 'zip'
  else if (isAllowedCompanyLogoMime(mime)) {
    ext = companyLogoExtensionForMime(
      /** @type {typeof COMPANY_LOGO_MIME_TYPES[number]} */ (mime),
    )
  }
  return `products/${businessProfileId}/${productId}/files/${safe}.${ext}`
}
