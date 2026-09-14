import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  companyLogoExtensionForMime,
  isAllowedCompanyLogoMime,
  MAX_COMPANY_LOGO_BYTES,
} from '@/lib/auth/company-logo'

/**
 * Persist restaurant logo under public/uploads and return web path + mime.
 * @param {string} businessProfileId
 * @param {string} logoBase64
 * @param {string} logoMimeType
 */
export async function saveBusinessLogoLocally(
  businessProfileId,
  logoBase64,
  logoMimeType,
) {
  if (!isAllowedCompanyLogoMime(logoMimeType)) {
    throw Object.assign(new Error('Unsupported logo type'), { code: 'LOGO_MIME' })
  }
  const buf = Buffer.from(logoBase64, 'base64')
  if (buf.length === 0 || buf.length > MAX_COMPANY_LOGO_BYTES) {
    throw Object.assign(new Error('Logo too large'), { code: 'LOGO_SIZE' })
  }
  const ext = companyLogoExtensionForMime(
    /** @type {import('@/lib/auth/company-logo').COMPANY_LOGO_MIME_TYPES[number]} */ (
      logoMimeType
    ),
  )
  const relDir = path.join('uploads', 'company-logos', businessProfileId)
  const absDir = path.join(process.cwd(), 'public', relDir)
  await mkdir(absDir, { recursive: true })
  const filename = `logo.${ext}`
  await writeFile(path.join(absDir, filename), buf)
  return {
    logoStoragePath: `/${relDir.replace(/\\/g, '/')}/${filename}`,
    logoMimeType,
  }
}
