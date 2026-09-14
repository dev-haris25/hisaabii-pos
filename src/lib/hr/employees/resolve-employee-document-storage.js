import { companyLogoExtensionForMime } from '@/lib/auth/company-logo'
import { removeFile, uploadFile } from '@/lib/storage/local-storage'

/** Max decoded employee document size (bytes). */
export const MAX_EMPLOYEE_DOCUMENT_BYTES = 15 * 1024 * 1024

/** Allowed upload MIME types for employee documents. */
export const EMPLOYEE_DOCUMENT_MIME_TYPES = /** @type {const} */ ([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
])

/** @param {string} mime */
export function isAllowedEmployeeDocumentMime(mime) {
  return EMPLOYEE_DOCUMENT_MIME_TYPES.includes(
    /** @type {typeof EMPLOYEE_DOCUMENT_MIME_TYPES[number]} */ (mime),
  )
}

/**
 * @param {string} mime
 * @returns {string}
 */
export function employeeDocumentExtensionForMime(mime) {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/jpeg') return 'jpg'
  return companyLogoExtensionForMime(
    /** @type {import('@/lib/auth/company-logo').COMPANY_LOGO_MIME_TYPES[number]} */ (mime),
  )
}

/**
 * @param {string} businessProfileId
 * @param {string} employeeId
 * @param {string} kind
 * @param {string} mime
 */
export function employeeDocumentStoragePath(businessProfileId, employeeId, kind, mime) {
  const ext = employeeDocumentExtensionForMime(mime)
  return `employees/${businessProfileId}/${employeeId}/${kind}.${ext}`
}

/**
 * @param {string} path
 * @param {Buffer} buffer
 * @param {string | null | undefined} previousPath
 */
async function uploadBytes(path, buffer, previousPath) {
  if (previousPath && previousPath !== path) {
    try {
      await removeFile(previousPath)
    } catch (rmErr) {
      console.error('[hisabi-pos:employee-documents] remove(previous) failed', rmErr)
    }
  }

  await uploadFile(path, buffer)
  return path
}

/** @param {string | null | undefined} storagePath */
async function removeStored(storagePath) {
  if (!storagePath) return
  try {
    await removeFile(storagePath)
  } catch (err) {
    console.error('[hisabi-pos:employee-documents] remove failed', err)
  }
}

/** @type {Record<string, string>} */
export const EMPLOYEE_DOCUMENT_STORAGE_FIELDS = {
  resume: 'resumeStoragePath',
  'appointment-letter': 'appointmentLetterStoragePath',
  'id-document': 'idDocumentStoragePath',
  photo: 'photoStoragePath',
  passport: 'passportStoragePath',
  visa: 'visaStoragePath',
}

/** @type {Record<string, { base64: string, mime: string, clear: string }>} */
const DOCUMENT_BODY_KEYS = {
  resume: {
    base64: 'resumeBase64',
    mime: 'resumeMimeType',
    clear: 'clearResume',
  },
  'appointment-letter': {
    base64: 'appointmentLetterBase64',
    mime: 'appointmentLetterMimeType',
    clear: 'clearAppointmentLetter',
  },
  'id-document': {
    base64: 'idDocumentBase64',
    mime: 'idDocumentMimeType',
    clear: 'clearIdDocument',
  },
  photo: {
    base64: 'photoBase64',
    mime: 'photoMimeType',
    clear: 'clearPhoto',
  },
  passport: {
    base64: 'passportBase64',
    mime: 'passportMimeType',
    clear: 'clearPassport',
  },
  visa: {
    base64: 'visaBase64',
    mime: 'visaMimeType',
    clear: 'clearVisa',
  },
}

/**
 * @param {string} businessProfileId
 * @param {string} employeeId
 * @param {Record<string, string | null | undefined>} existingPaths
 * @param {Record<string, unknown>} body
 * @returns {Promise<Record<string, string | null>>}
 */
export async function resolveEmployeeDocumentStorageAfterUpsert(
  businessProfileId,
  employeeId,
  existingPaths,
  body,
) {
  /** @type {Record<string, string | null>} */
  const result = {}

  for (const [kind, keys] of Object.entries(DOCUMENT_BODY_KEYS)) {
    const field = EMPLOYEE_DOCUMENT_STORAGE_FIELDS[kind]
    let storagePath = existingPaths[field] ?? null

    if (body[keys.clear]) {
      await removeStored(storagePath)
      storagePath = null
    }

    const b64 = typeof body[keys.base64] === 'string' ? body[keys.base64].trim() : ''
    const mime = typeof body[keys.mime] === 'string' ? body[keys.mime].trim() : ''
    if (b64) {
      if (!mime || !isAllowedEmployeeDocumentMime(mime)) {
        throw new Error('INVALID_DOCUMENT_MIME')
      }
      let buf
      try {
        buf = Buffer.from(b64, 'base64')
      } catch {
        throw new Error('INVALID_DOCUMENT')
      }
      if (!buf.length) throw new Error('INVALID_DOCUMENT')
      if (buf.length > MAX_EMPLOYEE_DOCUMENT_BYTES) throw new Error('DOCUMENT_TOO_LARGE')

      const path = employeeDocumentStoragePath(businessProfileId, employeeId, kind, mime)
      storagePath = await uploadBytes(path, buf, storagePath)
    }

    result[field] = storagePath
  }

  return result
}
