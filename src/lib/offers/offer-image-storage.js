import {
  companyLogoExtensionForMime,
  isAllowedCompanyLogoMime,
  MAX_MENU_ITEM_IMAGE_BYTES,
} from '@/lib/auth/company-logo'
import {
  downloadFile,
  guessMimeFromStoragePath,
  removeFile,
  uploadFile,
} from '@/lib/storage/local-storage'

/**
 * @param {string} businessProfileId
 * @param {string} offerId
 * @param {'banner' | 'image'} kind
 * @param {string} mime
 */
function offerImageStoragePath(businessProfileId, offerId, kind, mime) {
  return `offers/${businessProfileId}/${offerId}/${kind}-${Date.now()}.${companyLogoExtensionForMime(mime)}`
}

/** @param {string | null | undefined} storagePath */
async function removeQuietly(storagePath) {
  if (!storagePath) return
  try {
    await removeFile(storagePath)
  } catch {
    // Best-effort cleanup — DB pointer is what matters.
  }
}

/**
 * Apply clear / replace for the offer's banner and product image.
 * Same upload rules as menu item images (PNG / JPEG / GIF / WebP, 10 MB).
 *
 * @param {string} businessProfileId
 * @param {string} offerId
 * @param {{ bannerImagePath?: string | null, imagePath?: string | null }} existing
 * @param {{
 *   bannerBase64?: string
 *   bannerMimeType?: string
 *   clearBanner?: boolean
 *   imageBase64?: string
 *   imageMimeType?: string
 *   clearImage?: boolean
 * }} d
 * @returns {Promise<{ bannerImagePath: string | null, imagePath: string | null }>}
 */
export async function resolveOfferImagesAfterUpsert(businessProfileId, offerId, existing, d) {
  /** @param {'banner' | 'image'} kind @param {string | null} current @param {string | undefined} b64 @param {string | undefined} mime @param {boolean | undefined} clear */
  async function apply(kind, current, b64, mime, clear) {
    let path = current ?? null
    if (clear) {
      await removeQuietly(path)
      path = null
    }
    const data = b64?.trim()
    if (data) {
      if (!mime || !isAllowedCompanyLogoMime(mime)) throw new Error('INVALID_IMAGE_MIME')
      const buf = Buffer.from(data, 'base64')
      if (!buf.length) throw new Error('INVALID_IMAGE')
      if (buf.length > MAX_MENU_ITEM_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE')
      const next = offerImageStoragePath(businessProfileId, offerId, kind, mime)
      await uploadFile(next, buf)
      await removeQuietly(path)
      path = next
    }
    return path
  }

  return {
    bannerImagePath: await apply(
      'banner',
      existing.bannerImagePath ?? null,
      d.bannerBase64,
      d.bannerMimeType,
      d.clearBanner,
    ),
    imagePath: await apply(
      'image',
      existing.imagePath ?? null,
      d.imageBase64,
      d.imageMimeType,
      d.clearImage,
    ),
  }
}

/**
 * @param {string} storagePath
 * @returns {Promise<{ data: Buffer, mimeType: string } | null>}
 */
export async function downloadOfferImage(storagePath) {
  try {
    const data = await downloadFile(storagePath)
    return { data, mimeType: guessMimeFromStoragePath(storagePath) }
  } catch {
    return null
  }
}

/**
 * Map image upload errors to API errors (human-readable, rules §5).
 * @param {unknown} err
 */
export function offerImageErrorResponse(err) {
  const msg = err instanceof Error ? err.message : ''
  if (msg === 'INVALID_IMAGE_MIME' || msg === 'INVALID_IMAGE') {
    return { status: 400, code: 'OFFER_IMAGE_INVALID', message: 'Upload a PNG, JPEG, GIF or WebP image' }
  }
  if (msg === 'IMAGE_TOO_LARGE') {
    return { status: 400, code: 'OFFER_IMAGE_TOO_LARGE', message: 'Image must be 10 MB or smaller' }
  }
  return null
}
