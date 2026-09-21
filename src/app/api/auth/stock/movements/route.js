import { jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { mapStockMovementToJson } from '@/lib/stock/map-stock-json'
import { prisma } from '@/lib/prisma'

const movementInclude = {
  createdBy: { select: { id: true, name: true } },
  stockItem: { select: { id: true, nameAr: true, nameEn: true } },
}

/** Restaurant-wide stock movement history. */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    const { searchParams } = new URL(request.url)
    const type = (searchParams.get('type') ?? '').trim()
    const stockItemId = (searchParams.get('stockItemId') ?? '').trim()

    /** @type {Record<string, unknown>} */
    const where = { businessProfileId: profile.id }
    if (
      type === 'purchase' ||
      type === 'adjust_in' ||
      type === 'adjust_out' ||
      type === 'opening' ||
      type === 'recipe_deduct' ||
      type === 'allotment_issue' ||
      type === 'allotment_return' ||
      type === 'kitchen_stock_issue'
    ) {
      where.type = type
    }
    if (stockItemId) where.stockItemId = stockItemId

    if (!shouldPaginateListRequest(searchParams)) {
      const rows = await prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: movementInclude,
      })
      return jsonOk({ movements: rows.map(mapStockMovementToJson) })
    }

    const { page, limit, skip } = parseListPagination(searchParams)
    const [total, rows] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: movementInclude,
      }),
    ])

    return jsonOk({
      movements: rows.map(mapStockMovementToJson),
      pagination: buildPaginationMeta(page, limit, total),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/stock/movements')
  }
}
