import { parseSafeNextPath } from '@/lib/auth/safe-next-path'
import { createMongoAbility } from '@casl/ability'
import {
  CASHIER_ROLE_NAME,
  KITCHEN_BOARD_MANAGER_ROLE_NAME,
} from '@/lib/rbac/permission-registry'
import { getFirstAccessibleRouteFromAbility } from '@/lib/rbac/sidebar-permissions'

/**
 * Cashier-only accounts land on POS after login (no Dashboard).
 * @param {{ roleName?: string | null, roleNames?: string[] } | null | undefined} user
 */
export function isCashierOnlyUser(user) {
  const names = user?.roleNames?.filter(Boolean) ?? []
  if (names.length > 0) {
    return names.includes(CASHIER_ROLE_NAME) && names.every((n) => n === CASHIER_ROLE_NAME)
  }
  return user?.roleName === CASHIER_ROLE_NAME
}

/** @param {{ roleName?: string | null, roleNames?: string[] } | null | undefined} user */
export function roleNamesOf(user) {
  const names = user?.roleNames?.filter(Boolean) ?? []
  if (names.length > 0) return names
  return user?.roleName ? [user.roleName] : []
}

export function isKitchenBoardOnlyUser(user) {
  const names = roleNamesOf(user)
  return (
    names.length > 0 &&
    names.every((n) => n === KITCHEN_BOARD_MANAGER_ROLE_NAME)
  )
}

/** @deprecated Use isKitchenBoardOnlyUser */
export function isKitchenOrQueueDisplayUser(user) {
  return isKitchenBoardOnlyUser(user)
}

export const NO_MODULE_ACCESS_PATH = '/'

/**
 * @param {{
 *   abilityRules?: unknown[]
 *   needsBusinessProfileOnboarding?: boolean
 *   needsZatcaOnboarding?: boolean
 *   roleName?: string | null
 *   roleNames?: string[]
 * } | null | undefined} user
 * @param {unknown} [nextRaw]
 */
export function getPostAuthLandingPath(user, nextRaw) {
  if (!user) return '/login'

  const next = parseSafeNextPath(nextRaw)

  if (user.needsBusinessProfileOnboarding === true) {
    return next
      ? `/business-profile?next=${encodeURIComponent(next)}`
      : '/business-profile'
  }

  if (user.needsZatcaOnboarding === true) {
    return next
      ? `/zatca-onboarding?next=${encodeURIComponent(next)}`
      : '/zatca-onboarding'
  }

  if (next) return next

  if (isKitchenBoardOnlyUser(user)) return '/kitchen'

  if (isCashierOnlyUser(user)) return '/pos'

  const ability = createMongoAbility(user.abilityRules ?? [])
  return getFirstAccessibleRouteFromAbility(ability, {
    isRestaurantOwner: user.isRestaurantOwner === true,
  })
}
