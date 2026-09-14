import { jsonError } from '@/lib/api/json-response'
import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { createMongoAbility } from '@casl/ability'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { CASHIER_ROLE_NAME, ADMIN_ROLE_NAME, MANAGER_ROLE_NAME, ACCOUNTANT_ROLE_NAME } from '@/lib/rbac/permission-registry'
import { isWithinCashierDocumentWindow } from '@/lib/rbac/cashier-invoice-window'

/**
 * True when the session is subject to the rolling 24h invoice/note window.
 * @param {{ roleNames?: string[], abilityRules?: unknown[], isRestaurantOwner?: boolean }} session
 */
export function sessionNeedsCashierDocumentWindow(session) {
  const names = session.roleNames ?? []
  if (
    session.isRestaurantOwner ||
    names.includes(ADMIN_ROLE_NAME) ||
    names.includes(MANAGER_ROLE_NAME) ||
    names.includes(ACCOUNTANT_ROLE_NAME)
  ) {
    return false
  }
  const ability = createMongoAbility(session.abilityRules ?? [])
  if (hasFullAccess(ability)) return false
  return names.includes(CASHIER_ROLE_NAME)
}

/**
 * Authenticated user with invoice mutation access.
 * @returns {Promise<
 *   | { error: import('next/server').NextResponse }
 *   | {
 *       session: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>
 *       profileId: string
 *       isCashier: boolean
 *       ability: import('@casl/ability').MongoAbility
 *     }
 * >}
 */
export async function requireInvoiceRestaurant() {
  const session = await getSessionUser()
  if (!session) {
    return { error: jsonError(401, 'UNAUTHORIZED', 'Not signed in') }
  }
  if (!session.active) {
    return { error: jsonError(403, 'ACCOUNT_DISABLED', 'Account is disabled') }
  }

  const ability = createMongoAbility(session.abilityRules ?? [])
  const canInvoice =
    hasFullAccess(ability) ||
    ability.can('read', 'Invoice') ||
    ability.can('update', 'Invoice') ||
    ability.can('create', 'Invoice') ||
    ability.can('delete', 'Invoice')

  if (!canInvoice) {
    return { error: jsonError(403, 'FORBIDDEN', 'Not allowed') }
  }

  const profile = await getResolvedActiveBusinessProfile(session.id)
  if (!profile?.onboardingCompletedAt) {
    return {
      error: jsonError(
        400,
        'BUSINESS_PROFILE_REQUIRED',
        'Complete restaurant profile first',
      ),
    }
  }
  if (
    (hasFullAccess(ability) || ability.can('update', 'BusinessProfile')) &&
    session.needsZatcaOnboarding
  ) {
    return {
      error: jsonError(403, 'ZATCA_NOT_ONBOARDED', 'Complete ZATCA onboarding first'),
    }
  }
  return {
    session,
    profileId: profile.id,
    isCashier: sessionNeedsCashierDocumentWindow(session),
    ability,
  }
}

/**
 * Cashiers may only touch documents from the last 24 hours.
 * @param {boolean} isCashier
 * @param {Date | string | null | undefined} documentDate
 * @returns {import('next/server').NextResponse | null}
 */
export function cashierWindowForbiddenResponse(isCashier, documentDate) {
  if (!isCashier) return null
  if (isWithinCashierDocumentWindow(documentDate)) return null
  return jsonError(
    403,
    'CASHIER_WINDOW_EXPIRED',
    'Cashiers can only access documents from the last 24 hours',
  )
}
