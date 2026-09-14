/** @param {Date | null | undefined} d */
function toIsoDate(d) {
  return d ? d.toISOString() : null
}

/**
 * @param {Record<string, any>} row
 * @param {{
 *   roleIds?: string[]
 *   roleNames?: string[]
 *   businessMembershipId?: string | null
 *   invitationPending?: boolean
 * }} [options]
 */
export function mapEmployeeToJson(row, options = {}) {
  const membershipRoles = row.businessMembership?.employeeRoles ?? []
  const derivedRoleIds = membershipRoles
    .map((er) => er.role?.id)
    .filter(Boolean)
  const derivedRoleNames = membershipRoles
    .map((er) => er.role?.name)
    .filter(Boolean)

  const base = `/api/auth/hr/employees/${row.id}`
  return {
    id: row.id,
    name: row.name,
    mobileOfficial: row.mobileOfficial ?? '',
    emailOfficial: row.emailOfficial ?? '',
    joiningDate: row.joiningDate.toISOString(),
    salary: row.salary ?? '0',
    higherEducation: row.higherEducation ?? '',
    experience: row.experience ?? '',
    resumeStoragePath: row.resumeStoragePath ?? null,
    resumeUrl: row.resumeStoragePath ? `${base}/document/resume` : null,
    appointmentLetterStoragePath: row.appointmentLetterStoragePath ?? null,
    appointmentLetterUrl: row.appointmentLetterStoragePath
      ? `${base}/document/appointment-letter`
      : null,
    reportingToId: row.reportingToId ?? null,
    reportingToName: row.reportingTo?.name ?? null,
    nationality: row.nationality ?? '',
    dateOfBirth: toIsoDate(row.dateOfBirth),
    mobilePersonal: row.mobilePersonal ?? '',
    emailPersonal: row.emailPersonal ?? '',
    emergencyContactName: row.emergencyContactName ?? '',
    emergencyContactNumber: row.emergencyContactNumber ?? '',
    address: row.address ?? '',
    shortAddress: row.shortAddress ?? '',
    bloodGroup: row.bloodGroup ?? '',
    gender: row.gender ?? 'unspecified',
    maritalStatus: row.maritalStatus ?? 'unspecified',
    idTypeId: row.idTypeId ?? null,
    idTypeName: row.idType?.name ?? null,
    idNumber: row.idNumber ?? '',
    idExpiry: toIsoDate(row.idExpiry),
    idDocumentStoragePath: row.idDocumentStoragePath ?? null,
    idDocumentUrl: row.idDocumentStoragePath ? `${base}/document/id-document` : null,
    photoStoragePath: row.photoStoragePath ?? null,
    photoUrl: row.photoStoragePath ? `${base}/photo` : null,
    bankAccountName: row.bankAccountName ?? '',
    bankAccountNumber: row.bankAccountNumber ?? '',
    bankName: row.bankName ?? '',
    bankIban: row.bankIban ?? '',
    bankBranch: row.bankBranch ?? '',
    passportNumber: row.passportNumber ?? '',
    passportExpiry: toIsoDate(row.passportExpiry),
    passportStoragePath: row.passportStoragePath ?? null,
    passportUrl: row.passportStoragePath ? `${base}/document/passport` : null,
    visaNumber: row.visaNumber ?? '',
    visaIssueDate: toIsoDate(row.visaIssueDate),
    visaEntryDate: toIsoDate(row.visaEntryDate),
    visaExpiry: toIsoDate(row.visaExpiry),
    visaStoragePath: row.visaStoragePath ?? null,
    visaUrl: row.visaStoragePath ? `${base}/document/visa` : null,
    remark: row.remark ?? '',
    status: row.status ?? 'active',
    businessMembershipId:
      options.businessMembershipId ?? row.businessMembershipId ?? null,
    roleIds: options.roleIds ?? derivedRoleIds,
    roleNames: options.roleNames ?? derivedRoleNames,
    invitationPending: options.invitationPending ?? false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * @param {Parameters<typeof mapEmployeeToJson>[0][]} rows
 */
export function mapEmployeesToJson(rows) {
  return rows.map((row) => mapEmployeeToJson(row))
}

