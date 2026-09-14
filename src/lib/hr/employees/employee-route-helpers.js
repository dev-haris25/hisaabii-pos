/**
 * @param {import('zod').infer<typeof import('@/lib/hr/employees/employee-body-schema').employeeUpsertBodySchema>} d
 */
export function employeePrismaDataFromParsed(d) {
  return {
    name: d.name,
    mobileOfficial: d.mobileOfficial || null,
    emailOfficial: d.emailOfficial || null,
    joiningDate: new Date(d.joiningDate),
    salary: d.salary,
    higherEducation: d.higherEducation || null,
    experience: d.experience || null,
    reportingToId: d.reportingToId || null,
    nationality: d.nationality || null,
    dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
    mobilePersonal: d.mobilePersonal || null,
    emailPersonal: d.emailPersonal || null,
    emergencyContactName: d.emergencyContactName || null,
    emergencyContactNumber: d.emergencyContactNumber || null,
    address: d.address || null,
    shortAddress: d.shortAddress || '',
    bloodGroup: d.bloodGroup || null,
    gender: d.gender,
    maritalStatus: d.maritalStatus,
    idTypeId: d.idTypeId || null,
    idNumber: d.idNumber || null,
    idExpiry: d.idExpiry ? new Date(d.idExpiry) : null,
    bankAccountName: d.bankAccountName || null,
    bankAccountNumber: d.bankAccountNumber || null,
    bankName: d.bankName || null,
    bankIban: d.bankIban || null,
    bankBranch: d.bankBranch || null,
    passportNumber: d.passportNumber || null,
    passportExpiry: d.passportExpiry ? new Date(d.passportExpiry) : null,
    visaNumber: d.visaNumber || null,
    visaIssueDate: d.visaIssueDate ? new Date(d.visaIssueDate) : null,
    visaEntryDate: d.visaEntryDate ? new Date(d.visaEntryDate) : null,
    visaExpiry: d.visaExpiry ? new Date(d.visaExpiry) : null,
    remark: d.remark || null,
    status: d.status,
  }
}

/** @param {import('@/lib/prisma').prisma} prisma @param {string} profileId @param {{ idTypeId?: string | null, reportingToId?: string | null, employeeId?: string }} data */
export async function assertEmployeeForeignKeys(prisma, profileId, data) {
  const notDeleted = { deletedAt: null }
  if (data.idTypeId) {
    const row = await prisma.idType.findFirst({
      where: { id: data.idTypeId, businessProfileId: profileId, ...notDeleted },
      select: { id: true },
    })
    if (!row) return { ok: false, field: 'idTypeId' }
  }
  if (data.reportingToId) {
    if (data.employeeId && data.reportingToId === data.employeeId) {
      return { ok: false, field: 'reportingToId' }
    }
    const row = await prisma.employee.findFirst({
      where: { id: data.reportingToId, businessProfileId: profileId, ...notDeleted },
      select: { id: true },
    })
    if (!row) return { ok: false, field: 'reportingToId' }
  }
  return { ok: true }
}

/** @param {unknown} err */
export function employeeDocumentStorageErrorResponse(err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === 'INVALID_DOCUMENT_MIME') {
    return { status: 400, code: 'INVALID_DOCUMENT_MIME', message: 'Invalid document type' }
  }
  if (msg === 'INVALID_DOCUMENT') {
    return { status: 400, code: 'INVALID_DOCUMENT', message: 'Invalid document data' }
  }
  if (msg === 'DOCUMENT_TOO_LARGE') {
    return { status: 400, code: 'DOCUMENT_TOO_LARGE', message: 'Document too large' }
  }
  return null
}

export const employeeListInclude = {
  businessMembership: {
    select: {
      id: true,
      userId: true,
      employeeRoles: {
        select: {
          role: { select: { id: true, name: true } },
        },
      },
    },
  },
}

export const employeeDetailInclude = {
  idType: { select: { id: true, name: true } },
  reportingTo: { select: { id: true, name: true } },
  businessMembership: {
    select: {
      id: true,
      userId: true,
      employeeRoles: {
        select: {
          role: { select: { id: true, name: true } },
        },
      },
    },
  },
}
