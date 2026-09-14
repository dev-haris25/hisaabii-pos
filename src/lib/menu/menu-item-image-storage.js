import {
  isAllowedCompanyLogoMime,
  MAX_COMPANY_LOGO_BYTES,
  menuItemImageStoragePath,
} from '@/lib/auth/company-logo'
import {
  downloadFile,
  guessMimeFromStoragePath,
  removeFile,
  uploadFile,
} from '@/lib/storage/local-storage'

/**
 * @param {string} path
 * @param {Buffer} buffer
 * @param {string | null | undefined} previousPath
 */
async function uploadBytes(path, buffer, previousPath) {
  if (previousPath && previousPath !== path) {
    try {
      await removeFile(previousPath)
    } catch {
      // Continue — new file still written; orphan cleanup is best-effort.
    }
  }
  await uploadFile(path, buffer)
  return path
}

/**
 * @param {string} businessProfileId
 * @param {string} menuItemId
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string | null | undefined} previousPath
 */
export async function uploadMenuItemImageToStorage(
  businessProfileId,
  menuItemId,
  buffer,
  mimeType,
  previousPath,
) {
  if (!isAllowedCompanyLogoMime(mimeType)) {
    throw new Error('INVALID_IMAGE_MIME')
  }
  const path = menuItemImageStoragePath(businessProfileId, menuItemId, mimeType)
  return uploadBytes(path, buffer, previousPath)
}

/** @param {string | null | undefined} storagePath */
export async function removeMenuItemImageFromStorage(storagePath) {
  if (!storagePath) return
  try {
    await removeFile(storagePath)
  } catch {
    // DB clear still proceeds.
  }
}

/**
 * @param {string} storagePath
 * @returns {Promise<{ data: Buffer, mimeType: string } | null>}
 */
export async function downloadMenuItemImageFromStorage(storagePath) {
  try {
    const data = await downloadFile(storagePath)
    return { data, mimeType: guessMimeFromStoragePath(storagePath) }
  } catch {
    return null
  }
}

/**
 * Apply clear / replace image after menu item create or update.
 * `imageUrl` in DB stores the relative UPLOADS_DIR key (same role as Hisabi imageStoragePath).
 *
 * @param {string} businessProfileId
 * @param {string} menuItemId
 * @param {{ imageUrl?: string | null }} existing
 * @param {{
 *   clearImage?: boolean
 *   imageBase64?: string
 *   imageMimeType?: string
 * }} d
 * @returns {Promise<{ imageUrl: string | null }>}
 */
export async function resolveMenuItemImageAfterUpsert(
  businessProfileId,
  menuItemId,
  existing,
  d,
) {
  let imageUrl = existing.imageUrl ?? null

  if (d.clearImage) {
    await removeMenuItemImageFromStorage(imageUrl)
    imageUrl = null
  }

  const b64Img = d.imageBase64?.trim()
  const mimeImg = d.imageMimeType?.trim()
  if (b64Img) {
    if (!mimeImg || !isAllowedCompanyLogoMime(mimeImg)) {
      throw new Error('INVALID_IMAGE_MIME')
    }
    const buf = Buffer.from(b64Img, 'base64')
    if (!buf.length) throw new Error('INVALID_IMAGE')
    if (buf.length > MAX_COMPANY_LOGO_BYTES) throw new Error('IMAGE_TOO_LARGE')
    imageUrl = await uploadMenuItemImageToStorage(
      businessProfileId,
      menuItemId,
      buf,
      mimeImg,
      imageUrl,
    )
  }

  return { imageUrl }
}
