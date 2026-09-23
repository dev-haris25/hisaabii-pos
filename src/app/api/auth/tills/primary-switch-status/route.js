import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { getPrimarySwitchStatus } from '@/lib/tills/primary-switch-status'

/**
 * GET /api/auth/tills/primary-switch-status?tillId=
 * Preflight for changing the primary offline till.
 */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const tillId =
      new URL(request.url).searchParams.get('tillId')?.trim() || undefined
    const status = await getPrimarySwitchStatus(auth.profile.id, tillId)
    return jsonOk(status)
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/tills/primary-switch-status')
  }
}
