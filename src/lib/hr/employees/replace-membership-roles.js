/**
 * Replace all EmployeeRole rows for a membership.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/lib/prisma').prisma} tx
 * @param {string} businessMembershipId
 * @param {string[]} roleIds
 */
export async function replaceMembershipRoles(tx, businessMembershipId, roleIds) {
  await tx.employeeRole.deleteMany({ where: { businessMembershipId } })
  const unique = [...new Set(roleIds.filter(Boolean))]
  if (unique.length === 0) return
  await tx.employeeRole.createMany({
    data: unique.map((roleId) => ({
      businessMembershipId,
      roleId,
    })),
    skipDuplicates: true,
  })
}
