import {
  COMPANY_LOGO_MIME_TYPES,
  MAX_COMPANY_LOGO_BYTES,
} from '@/lib/auth/company-logo'

/** @param {File} file */
export function mimeFromLogoFile(file) {
  const t = file?.type
  return COMPANY_LOGO_MIME_TYPES.includes(
    /** @type {(typeof COMPANY_LOGO_MIME_TYPES)[number]} */ (t),
  )
    ? /** @type {(typeof COMPANY_LOGO_MIME_TYPES)[number]} */ (t)
    : null
}

/**
 * @param {File} file
 * @param {{ maxBytes?: number }} [opts]
 * @returns {Promise<{ base64: string, mime: (typeof COMPANY_LOGO_MIME_TYPES)[number] }>}
 */
export function readLogoFileAsBase64(file, opts = {}) {
  const maxBytes = opts.maxBytes ?? MAX_COMPANY_LOGO_BYTES
  return new Promise((resolve, reject) => {
    const mime = mimeFromLogoFile(file)
    if (!mime) {
      reject(new Error('invalid logo type'))
      return
    }
    if (file.size > maxBytes) {
      reject(new Error('logo too large'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      const comma = dataUrl.indexOf(',')
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
      resolve({ base64, mime })
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}
