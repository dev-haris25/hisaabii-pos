import { prisma } from '@/lib/prisma'

/**
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function getAccessibleBusinessProfileIds(userId) {
  const rows = await prisma.businessMembership.findMany({
    where: { userId },
    select: { businessProfileId: true },
  })
  return rows.map((r) => r.businessProfileId)
}

/**
 * @param {string} userId
 * @param {string} businessProfileId
 */
export async function userCanAccessBusinessProfile(userId, businessProfileId) {
  const membership = await prisma.businessMembership.findUnique({
    where: {
      userId_businessProfileId: { userId, businessProfileId },
    },
    select: { id: true },
  })
  return Boolean(membership)
}

/**
 * Role names assigned on a membership (may be empty).
 * @param {string} userId
 * @param {string} businessProfileId
 * @returns {Promise<string[]>}
 */
export async function getMembershipRoleNames(userId, businessProfileId) {
  const membership = await prisma.businessMembership.findUnique({
    where: {
      userId_businessProfileId: { userId, businessProfileId },
    },
    select: {
      employeeRoles: {
        select: { role: { select: { name: true } } },
      },
    },
  })
  return membership?.employeeRoles?.map((er) => er.role.name) ?? []
}
