import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  companyLogoExtensionForMime,
  isAllowedCompanyLogoMime,
  MAX_COMPANY_LOGO_BYTES,
} from '@/lib/auth/company-logo'
import { downloadFile, uploadFile } from '@/lib/storage/local-storage'

function uploadsDirConfigured() {
  return Boolean(process.env.UPLOADS_DIR?.trim())
}

/**
 * Storage key under UPLOADS_DIR (preferred on live).
 * @param {string} businessProfileId
 * @param {string} ext
 */
export function companyLogoUploadsKey(businessProfileId, ext) {
  return `company-logos/${businessProfileId}/logo.${ext}`
}

/**
 * Keys to try in UPLOADS_DIR for a DB path (new + legacy public/ paths).
 * @param {string} logoStoragePath
 * @returns {string[]}
 */
export function companyLogoUploadsCandidates(logoStoragePath) {
  const normalized = String(logoStoragePath ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\//, '')
  if (!normalized) return []
  const keys = [normalized]
  if (normalized.startsWith('uploads/')) {
    keys.push(normalized.slice('uploads/'.length))
  }
  return [...new Set(keys)]
}

/**
 * Persist restaurant logo. Uses UPLOADS_DIR when set (survives deploys);
 * otherwise writes under public/uploads for local dev.
 *
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

  if (uploadsDirConfigured()) {
    const logoStoragePath = companyLogoUploadsKey(businessProfileId, ext)
    await uploadFile(logoStoragePath, buf)
    return { logoStoragePath, logoMimeType }
  }

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

/**
 * @param {string | null | undefined} logoStoragePath
 * @returns {Promise<Buffer>}
 */
export async function readBusinessLogoFile(logoStoragePath) {
  const raw = String(logoStoragePath ?? '').trim()
  if (!raw) {
    throw new Error('Logo file missing')
  }

  if (uploadsDirConfigured()) {
    for (const key of companyLogoUploadsCandidates(raw)) {
      try {
        return await downloadFile(key)
      } catch {
        // try next candidate / public fallback
      }
    }
  }

  const rel = raw.replace(/^\//, '')
  return readFile(path.join(process.cwd(), 'public', rel))
}
