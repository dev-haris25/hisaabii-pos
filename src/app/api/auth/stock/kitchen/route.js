import { jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import {
  listOpenKitchenAllocations,
  mapKitchenAllocationToJson,
} from '@/lib/stock/kitchen-stock'
import { prisma } from '@/lib/prisma'

/** Open kitchen stock allocations for the active restaurant. */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const rows = await listOpenKitchenAllocations(prisma, auth.profile.id)
    return jsonOk({
      allocations: rows.map(mapKitchenAllocationToJson),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/stock/kitchen')
  }
}
