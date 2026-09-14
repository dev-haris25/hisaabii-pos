import { loadRbacForUser, primaryRoleName } from '@/lib/rbac/load-rbac-for-user'

/**
 * Prisma select for User + active restaurant + ZATCA device status + memberships.
 */
export const AUTH_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  emailVerified: true,
  preferredLocale: true,
  active: true,
  activeBusinessProfileId: true,
  productTourSeenAt: true,
  memberships: {
    select: {
      id: true,
      businessProfileId: true,
      createdAt: true,
      employeeRoles: {
        select: { role: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  },
  activeBusinessProfile: {
    select: {
      id: true,
      companyNameAr: true,
      ownerUserId: true,
      onboardingCompletedAt: true,
      zatcaOnboardingSkipped: true,
      zatcaEnvironment: true,
      zatcaDevice: {
        select: {
          productionCsid: true,
          onboardedAt: true,
        },
      },
    },
  },
}

/** @deprecated use AUTH_USER_SELECT */
export const AUTH_STAFF_SELECT = AUTH_USER_SELECT

/**
 * @param {{
 *   activeBusinessProfile?: {
 *     id: string
 *     companyNameAr: string
 *     onboardingCompletedAt: Date | null
 *     zatcaOnboardingSkipped: boolean
 *     zatcaEnvironment: string
 *     zatcaDevice: { productionCsid: string | null, onboardedAt: Date | null } | null
 *   } | null
 *   memberships?: Array<{ businessProfileId: string }>
 *   activeBusinessProfileId?: string | null
 * }} row
 */
function resolveProfileForAuth(row) {
  if (row.activeBusinessProfile) return row.activeBusinessProfile
  return null
}

/**
 * @param {any} row
 * @param {{
 *   abilityRules?: unknown[]
 *   roleNames?: string[]
 *   roleName?: string | null
 *   isRestaurantOwner?: boolean
 * }} [rbac]
 */
export function buildAuthUserFromRow(row, rbac = {}) {
  const memberships = Array.isArray(row.memberships) ? row.memberships : []
  const profile = resolveProfileForAuth(row)
  const hasCompletedRestaurantOnboarding = Boolean(profile?.onboardingCompletedAt)
  const hasProductionCsid = Boolean(profile?.zatcaDevice?.productionCsid)
  const zatcaSkipped = profile?.zatcaOnboardingSkipped === true

  const needsBusinessProfileOnboarding = !hasCompletedRestaurantOnboarding
  const needsZatcaOnboarding =
    hasCompletedRestaurantOnboarding &&
    !hasProductionCsid &&
    !zatcaSkipped

  const activeId =
    row.activeBusinessProfileId ??
    memberships[0]?.businessProfileId ??
    (hasCompletedRestaurantOnboarding ? profile?.id : null) ??
    null

  const roleNames =
    rbac.roleNames ??
    memberships.flatMap((m) =>
      (m.employeeRoles ?? []).map((er) => er.role?.name).filter(Boolean),
    )

  const isRestaurantOwner =
    typeof rbac.isRestaurantOwner === 'boolean'
      ? rbac.isRestaurantOwner
      : Boolean(profile?.ownerUserId && profile.ownerUserId === row.id)

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    preferredLocale: row.preferredLocale,
    /** Active restaurant id for API scoping. */
    businessProfileId: activeId,
    hasBusinessProfile: hasCompletedRestaurantOnboarding,
    needsBusinessProfileOnboarding,
    needsZatcaOnboarding,
    zatcaOnboardingSkippedEffective: zatcaSkipped,
    accessibleBusinessProfileCount: memberships.length,
    activeBusinessProfileId: hasCompletedRestaurantOnboarding ? activeId : null,
    abilityRules: rbac.abilityRules ?? [],
    roleNames,
    roleName: rbac.roleName ?? primaryRoleName(roleNames, isRestaurantOwner),
    isRestaurantOwner,
    productTourSeenAt:
      row.productTourSeenAt instanceof Date
        ? row.productTourSeenAt.toISOString()
        : row.productTourSeenAt ?? null,
  }
}

/**
 * @param {any} row
 */
export async function buildAuthUserFromRowAsync(row) {
  const memberships = Array.isArray(row.memberships) ? row.memberships : []
  const activeId =
    row.activeBusinessProfileId ?? memberships[0]?.businessProfileId ?? null
  const rbac = await loadRbacForUser(row.id, activeId)
  return buildAuthUserFromRow(row, rbac)
}

/**
 * @deprecated use buildAuthUserFromRow
 * @param {Parameters<typeof buildAuthUserFromRow>[0]} row
 */
export function buildAuthUserFromStaff(row) {
  return buildAuthUserFromRow(row)
}
