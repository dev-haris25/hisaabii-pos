/**
 * Prisma where fragment: always hide the owner's employee row from HR lists/detail.
 * Ownership is fixed (no transfer); the owner is never an employee list entry.
 *
 * @param {{ ownerUserId: string }} profile
 */
export function employeeExcludeOwnerWhere(profile) {
  if (!profile?.ownerUserId) return {}
  return {
    NOT: {
      businessMembership: { userId: profile.ownerUserId },
    },
  }
}
