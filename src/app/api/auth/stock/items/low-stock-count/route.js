import { jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { isLowStock } from '@/lib/stock/units'
import { prisma } from '@/lib/prisma'

/**
 * Count of active stock items that are at or below their low-stock threshold.
 * Always counts (in-app low-stock UI is not gated by restaurant email setting).
 */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    const rows = await prisma.stockItem.findMany({
      where: {
        businessProfileId: profile.id,
        active: true,
        lowStockThreshold: { not: null },
      },
      select: {
        quantityOnHand: true,
        lowStockThreshold: true,
      },
    })

    const count = rows.filter((row) =>
      isLowStock(row.quantityOnHand, row.lowStockThreshold),
    ).length

    return jsonOk({ count })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/stock/items/low-stock-count')
  }
}
