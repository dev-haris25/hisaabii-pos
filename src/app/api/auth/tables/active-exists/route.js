import { jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { restaurantHasActiveTables } from '@/lib/e-waiter/restaurant-has-active-tables'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * GET /api/auth/tables/active-exists
 * Lightweight flag for sidebar Open tables + POS tab switcher.
 */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const hasActiveTables = await restaurantHasActiveTables(auth.profile.id)
    return jsonOk({ hasActiveTables })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/tables/active-exists')
  }
}
