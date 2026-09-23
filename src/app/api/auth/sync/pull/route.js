import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { buildSyncPullPage } from '@/lib/sync/build-sync-pull-page'

/**
 * GET /api/auth/sync/pull?cursor=
 * Desktop first-install / incremental pull for the active restaurant.
 */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest({
      request,
      skipPermissionCheck: true,
    })
    if (auth.error) return auth.error

    const cursor = new URL(request.url).searchParams.get('cursor')
    try {
      const page = await buildSyncPullPage(auth.profile.id, cursor)
      return jsonOk(page)
    } catch (err) {
      if (err?.code === 'PROFILE_NOT_FOUND') {
        return jsonError(404, 'NOT_FOUND', 'Restaurant not found')
      }
      throw err
    }
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/sync/pull')
  }
}
