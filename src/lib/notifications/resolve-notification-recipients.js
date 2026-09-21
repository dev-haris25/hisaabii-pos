import { prisma } from '@/lib/prisma'

/** Role names that receive each audience bucket (plus restaurant owner always). */
export const NOTIFICATION_AUDIENCE_ROLES = {
  zatca: ['Admin', 'Manager', 'Accountant'],
  hr: ['Admin', 'Manager', 'HR'],
  salesOps: ['Admin', 'Manager', 'Accountant'],
  team: ['Admin', 'Manager', 'HR'],
  /** High kitchen wastage: owner (always) + Admin only. */
  ownerAdmin: ['Admin'],
}

/**
 * Resolve user IDs for a restaurant who should receive a category of alerts.
 * Always includes the restaurant owner. Dedupes.
 *
 * @param {string} businessProfileId
 * @param {keyof typeof NOTIFICATION_AUDIENCE_ROLES} audience
 * @param {string[]} [extraUserIds]
 * @returns {Promise<string[]>}
 */
export async function resolveNotificationRecipients(
  businessProfileId,
  audience,
  extraUserIds = [],
) {
  const roleNames = NOTIFICATION_AUDIENCE_ROLES[audience] ?? []
  const profile = await prisma.businessProfile.findUnique({
    where: { id: businessProfileId },
    select: { ownerUserId: true },
  })

  const recipients = new Set(
    [profile?.ownerUserId, ...extraUserIds].filter(Boolean),
  )

  if (roleNames.length > 0) {
    const memberships = await prisma.businessMembership.findMany({
      where: {
        businessProfileId,
        user: { active: true },
        employeeRoles: {
          some: {
            role: { name: { in: roleNames } },
          },
        },
      },
      select: { userId: true },
    })
    for (const m of memberships) {
      if (m.userId) recipients.add(m.userId)
    }
  }

  return [...recipients]
}
