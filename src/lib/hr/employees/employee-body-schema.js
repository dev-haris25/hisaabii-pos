import { z } from 'zod'

/** @param {number} max */
function trimmedDefaultEmpty(max) {
  return z.preprocess((v) => {
    if (v == null) return ''
    return String(v).trim().slice(0, max)
  }, z.string().max(max))
}

const optionalNullableCuid = z.preprocess((v) => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}, z.union([z.string().cuid(), z.null()]))

const optionalNullableDateString = z.preprocess((v) => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}, z.union([z.string().min(1), z.null()]))

/** @param {string} fieldBase64 @param {string} fieldMime */
function optionalBase64Pair(fieldBase64, fieldMime) {
  return {
    [fieldBase64]: z.preprocess(
      (v) => (v == null || String(v).trim() === '' ? undefined : String(v)),
      z.string().min(1).optional(),
    ),
    [fieldMime]: z.preprocess(
      (v) => (v == null || String(v).trim() === '' ? undefined : String(v).trim()),
      z.string().optional(),
    ),
  }
}

/** Body for POST / PATCH /api/auth/hr/employees */
export const employeeUpsertBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  mobileOfficial: trimmedDefaultEmpty(40),
  emailOfficial: z
    .union([z.literal(''), z.string().trim().email().max(320)])
    .optional()
    .default(''),
  joiningDate: z.string().trim().min(1),
  salary: z.string().trim().min(1).max(50),
  higherEducation: trimmedDefaultEmpty(300),
  experience: trimmedDefaultEmpty(300),
  reportingToId: optionalNullableCuid.optional().default(null),
  nationality: trimmedDefaultEmpty(100),
  dateOfBirth: optionalNullableDateString.optional().default(null),
  mobilePersonal: trimmedDefaultEmpty(40),
  emailPersonal: z
    .union([z.literal(''), z.string().trim().email().max(320)])
    .optional()
    .default(''),
  emergencyContactName: trimmedDefaultEmpty(200),
  emergencyContactNumber: trimmedDefaultEmpty(40),
  address: trimmedDefaultEmpty(500),
  shortAddress: trimmedDefaultEmpty(300),
  bloodGroup: trimmedDefaultEmpty(20),
  gender: z.enum(['male', 'female', 'unspecified']).default('unspecified'),
  maritalStatus: z.enum(['single', 'married', 'other', 'unspecified']).default('unspecified'),
  idTypeId: optionalNullableCuid.optional().default(null),
  idNumber: trimmedDefaultEmpty(100),
  idExpiry: optionalNullableDateString.optional().default(null),
  bankAccountName: trimmedDefaultEmpty(200),
  bankAccountNumber: trimmedDefaultEmpty(100),
  bankName: trimmedDefaultEmpty(200),
  bankIban: trimmedDefaultEmpty(50),
  bankBranch: trimmedDefaultEmpty(200),
  passportNumber: trimmedDefaultEmpty(100),
  passportExpiry: optionalNullableDateString.optional().default(null),
  visaNumber: trimmedDefaultEmpty(100),
  visaIssueDate: optionalNullableDateString.optional().default(null),
  visaEntryDate: optionalNullableDateString.optional().default(null),
  visaExpiry: optionalNullableDateString.optional().default(null),
  remark: trimmedDefaultEmpty(2000),
  status: z.enum(['active', 'inactive']).default('active'),
  clearResume: z.coerce.boolean().default(false),
  clearAppointmentLetter: z.coerce.boolean().default(false),
  clearIdDocument: z.coerce.boolean().default(false),
  clearPhoto: z.coerce.boolean().default(false),
  clearPassport: z.coerce.boolean().default(false),
  clearVisa: z.coerce.boolean().default(false),
  ...optionalBase64Pair('resumeBase64', 'resumeMimeType'),
  ...optionalBase64Pair('appointmentLetterBase64', 'appointmentLetterMimeType'),
  ...optionalBase64Pair('idDocumentBase64', 'idDocumentMimeType'),
  ...optionalBase64Pair('photoBase64', 'photoMimeType'),
  ...optionalBase64Pair('passportBase64', 'passportMimeType'),
  ...optionalBase64Pair('visaBase64', 'visaMimeType'),
  roleIds: z.array(z.string().min(1)).optional().default([]),
  inviteEmail: z
    .union([z.literal(''), z.string().trim().email().max(320)])
    .optional()
    .default(''),
})
