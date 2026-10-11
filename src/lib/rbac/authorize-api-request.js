import { jsonError } from '@/lib/api/json-response'
import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { resolveApiRoutePermission } from '@/lib/rbac/api-route-permissions'
import { getAbilityForMembership } from '@/lib/rbac/get-ability'
import { assertCan } from '@/lib/rbac/require-permission'

/**
 * @typedef {{
 *   request?: import('next/server').NextRequest
 *   action?: string
 *   subject?: string
 *   skipPermissionCheck?: boolean
 * }} AuthorizeOptions
 */

/**
 * Authorize an authenticated API request with optional explicit permission
 * or automatic resolution from the route permission map.
 *
 * Fails closed: unless `skipPermissionCheck` is set (the caller does its own
 * check), a request with no explicit action+subject that resolves to nothing
 * in the route map gets 403 — a missing mapping never lets every member in.
 *
 * @param {import('next/server').NextRequest | AuthorizeOptions} [requestOrOptions]
 * @param {AuthorizeOptions} [legacyOptions]
 */
export async function authorizeBusinessRequest(requestOrOptions, legacyOptions = {}) {
  /** @type {AuthorizeOptions} */
  let options = legacyOptions

  if (
    requestOrOptions &&
    typeof requestOrOptions === 'object' &&
    'url' in requestOrOptions &&
    typeof requestOrOptions.url === 'string'
  ) {
    options = { ...legacyOptions, request: requestOrOptions }
  } else if (requestOrOptions && typeof requestOrOptions === 'object') {
    options = /** @type {AuthorizeOptions} */ (requestOrOptions)
  }

  const session = await getSessionUser()
  if (!session) {
    return { error: jsonError(401, 'UNAUTHORIZED', 'Not signed in') }
  }

  const profile = await getResolvedActiveBusinessProfile(session.id)
  if (!profile) {
    return { error: jsonError(400, 'NO_COMPANY', 'No company profile') }
  }

  const ability = await getAbilityForMembership(session.id, profile.id)

  if (!options.skipPermissionCheck) {
    let action = options.action
    let subject = options.subject

    if ((!action || !subject) && options.request) {
      const url = new URL(options.request.url)
      const apiPath = url.pathname.replace(/^\/api\/auth/, '') || '/'
      const resolved = resolveApiRoutePermission(apiPath, options.request.method)
      if (resolved) {
        action = resolved.action
        subject = resolved.subject
      }
    }

    if (!action || !subject) {
      const method = options.request?.method ?? '(no request)'
      const path = options.request
        ? new URL(options.request.url).pathname
        : '(no request)'
      console.error(
        `[rbac] no permission mapping for ${method} ${path} — denied (add it to api-route-permissions.js or pass action/subject)`,
      )
      return {
        error: jsonError(403, 'FORBIDDEN', 'You do not have permission to perform this action'),
      }
    }

    const denied = assertCan(ability, action, subject)
    if (denied) {
      return { error: denied }
    }
  }

  return { session, profile, ability }
}
