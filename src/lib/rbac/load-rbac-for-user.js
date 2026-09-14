import { getAbilityForMembership, serializeAbilityRules } from '@/lib/rbac/get-ability'
import { ADMIN_ROLE_NAME } from '@/lib/rbac/permission-registry'
import { prisma } from '@/lib/prisma'

/**
 * Loads CASL rules + role names for the user's active business profile.
 *
 * @param {string} userId
 * @param {string | null | undefined} activeBusinessProfileId
 */
export async function loadRbacForUser(userId, activeBusinessProfileId) {
  if (!activeBusinessProfileId) {
    return {
      abilityRules: [],
      roleNames: [],
      roleName: null,
      isRestaurantOwner: false,
    }
  }

  const [ability, profile, membership] = await Promise.all([
    getAbilityForMembership(userId, activeBusinessProfileId),
    prisma.businessProfile.findUnique({
      where: { id: activeBusinessProfileId },
      select: { ownerUserId: true },
    }),
    prisma.businessMembership.findUnique({
      where: {
        userId_businessProfileId: {
          userId,
          businessProfileId: activeBusinessProfileId,
        },
      },
      select: {
        employeeRoles: {
          select: { role: { select: { name: true } } },
        },
      },
    }),
  ])

  const abilityRules = serializeAbilityRules(ability)
  const roleNames =
    membership?.employeeRoles?.map((er) => er.role.name).filter(Boolean) ?? []
  const isRestaurantOwner = profile?.ownerUserId === userId

  return {
    abilityRules,
    roleNames,
    roleName: primaryRoleName(roleNames, isRestaurantOwner),
    isRestaurantOwner,
  }
}

/**
 * @param {string[]} roleNames
 * @param {boolean} [isRestaurantOwner]
 */
export function primaryRoleName(roleNames, isRestaurantOwner = false) {
  if (isRestaurantOwner) return 'Owner'
  if (!roleNames?.length) return null
  if (roleNames.includes(ADMIN_ROLE_NAME)) return ADMIN_ROLE_NAME
  return roleNames[0]
}
