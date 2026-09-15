import { jsonError } from '@/lib/api/json-response'

/**
 * Map image upload failures to JSON responses (Hisabi product parity).
 * @param {unknown} imgErr
 * @returns {Response | null} JSON error response, or null if not an image error.
 */
export function menuItemImageUploadErrorResponse(imgErr) {
  const msg = imgErr instanceof Error ? imgErr.message : String(imgErr)
  if (msg === 'INVALID_IMAGE_MIME' || msg === 'INVALID_LOGO_MIME') {
    return jsonError(400, 'INVALID_IMAGE_MIME', 'Unsupported image type')
  }
  if (msg === 'INVALID_IMAGE' || msg === 'INVALID_LOGO') {
    return jsonError(400, 'INVALID_IMAGE', 'Invalid image data')
  }
  if (msg === 'IMAGE_TOO_LARGE' || msg === 'LOGO_TOO_LARGE') {
    return jsonError(400, 'IMAGE_TOO_LARGE', 'Image must be 10MB or smaller')
  }
  if (msg === 'UPLOADS_DIR is not configured') {
    return jsonError(500, 'UPLOAD_FAILED', 'Uploads directory is not configured')
  }
  return null
}
