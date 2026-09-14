import { readFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

/** Typical printable width for 80mm ESC/POS receipts (dots). */
const RECEIPT_LOGO_MAX_WIDTH = 384

/**
 * Load the restaurant logo as PNG base64 for the print bridge.
 * Returns null when missing or unreadable (caller should print the name instead).
 *
 * @param {{
 *   logoStoragePath?: string | null
 * } | null | undefined} profile
 * @returns {Promise<string | null>}
 */
export async function loadReceiptLogoPngBase64(profile) {
  const storagePath = profile?.logoStoragePath?.trim()
  if (!storagePath) return null

  const abs = path.join(
    process.cwd(),
    'public',
    storagePath.replace(/^\//, ''),
  )

  try {
    const raw = await readFile(abs)
    const png = await sharp(raw)
      .resize({
        width: RECEIPT_LOGO_MAX_WIDTH,
        withoutEnlargement: true,
      })
      .png()
      .toBuffer()
    return png.toString('base64')
  } catch {
    return null
  }
}

/**
 * Authenticated logo URL for UI receipt previews, or null when no logo.
 *
 * @param {{
 *   id: string
 *   logoStoragePath?: string | null
 *   updatedAt?: Date | string | null
 * } | null | undefined} profile
 * @returns {string | null}
 */
export function restaurantLogoPreviewUrl(profile) {
  if (!profile?.id || !profile.logoStoragePath?.trim()) return null
  const stamp =
    profile.updatedAt instanceof Date
      ? profile.updatedAt.toISOString()
      : typeof profile.updatedAt === 'string'
        ? profile.updatedAt
        : ''
  const qs = stamp ? `?t=${encodeURIComponent(stamp)}` : ''
  return `/api/auth/business-profiles/${profile.id}/logo${qs}`
}
