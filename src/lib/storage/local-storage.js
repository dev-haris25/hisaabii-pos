import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Absolute root for uploaded files (outside the app tree). Required for all I/O.
 * @returns {string}
 */
export function getUploadsDir() {
  const dir = process.env.UPLOADS_DIR?.trim()
  if (!dir) {
    throw new Error('UPLOADS_DIR is not configured')
  }
  return dir
}

/**
 * Resolve a relative storage key under UPLOADS_DIR, rejecting path traversal.
 *
 * @param {string} storagePath
 * @returns {string} absolute filesystem path
 */
export function resolveStoragePath(storagePath) {
  if (typeof storagePath !== 'string' || !storagePath.trim()) {
    throw new Error('Invalid storage path')
  }
  const relative = storagePath.trim().replace(/\\/g, '/')
  if (path.isAbsolute(relative) || relative.includes('\0')) {
    throw new Error('Invalid storage path')
  }

  const root = path.resolve(getUploadsDir())
  const resolved = path.resolve(root, relative)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Invalid storage path')
  }
  return resolved
}

/** @param {string} storagePath */
export function guessMimeFromStoragePath(storagePath) {
  const ext = path.extname(storagePath).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.pdf':
      return 'application/pdf'
    case '.zip':
      return 'application/zip'
    default:
      return 'application/octet-stream'
  }
}

/**
 * @param {string} storagePath
 * @param {Buffer | Uint8Array} buffer
 * @returns {Promise<{ path: string }>}
 */
export async function uploadFile(storagePath, buffer) {
  const fullPath = resolveStoragePath(storagePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, buffer)
  return { path: storagePath }
}

/**
 * @param {string} storagePath
 * @returns {Promise<Buffer>}
 */
export async function downloadFile(storagePath) {
  const fullPath = resolveStoragePath(storagePath)
  return fs.readFile(fullPath)
}

/**
 * @param {string} storagePath
 * @returns {Promise<void>}
 */
export async function removeFile(storagePath) {
  const fullPath = resolveStoragePath(storagePath)
  await fs.rm(fullPath, { force: true })
}
