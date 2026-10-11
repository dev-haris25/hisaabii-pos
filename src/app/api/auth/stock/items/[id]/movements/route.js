import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { getOrCreateBusinessSettings } from '@/lib/settings/get-or-create-business-settings'
import { applyStockMovement } from '@/lib/stock/apply-stock-movement'
import { maybeEmitLowStockAlert } from '@/lib/stock/emit-low-stock-alert'
import {
  mapStockItemToJson,
  mapStockMovementToJson,
} from '@/lib/stock/map-stock-json'
import { stockMovementBodySchema } from '@/lib/stock/schemas'
import { prisma } from '@/lib/prisma'

const movementInclude = {
  createdBy: { select: { id: true, name: true } },
  stockItem: { select: { id: true, nameAr: true, nameEn: true } },
}

export async function GET(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    const item = await prisma.stockItem.findFirst({
      where: { id, businessProfileId: auth.profile.id },
      select: { id: true },
    })
    if (!item) return jsonError(404, 'NOT_FOUND', 'Stock item not found')

    const { searchParams } = new URL(request.url)
    const where = {
      businessProfileId: auth.profile.id,
      stockItemId: id,
    }

    if (!shouldPaginateListRequest(searchParams)) {
      const rows = await prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: movementInclude,
      })
      return jsonOk({
        movements: rows.map(mapStockMovementToJson),
      })
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
    return handleRouteError(err, 'GET /api/auth/stock/items/[id]/movements')
  }
}

export async function POST(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile, session } = auth
    const { id } = await context.params

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = stockMovementBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const item = await prisma.stockItem.findFirst({
      where: { id, businessProfileId: profile.id },
    })
    if (!item) return jsonError(404, 'NOT_FOUND', 'Stock item not found')
    if (!item.active) {
      return jsonError(
        409,
        'STOCK_ITEM_DELETED',
        'Cannot record movements for a deleted stock item',
      )
    }

    const settings = await getOrCreateBusinessSettings(profile.id)
    const d = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      return applyStockMovement(tx, {
        businessProfileId: profile.id,
        stockItemId: id,
        type: d.type,
        quantity: d.quantity,
        reason: d.reason,
        note: d.note,
        createdByUserId: session.id,
        allowNegative: settings.allowNegativeStock === true,
        unitCost: d.type === 'purchase' ? d.unitCost : null,
      })
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    if (!result.ok) {
      const status =
        result.code === 'INSUFFICIENT_STOCK'
          ? 409
          : result.code === 'NOT_FOUND'
            ? 404
            : 400
      return jsonError(
        status,
        result.code || 'MOVEMENT_FAILED',
        result.message || 'Movement failed',
      )
    }

    await maybeEmitLowStockAlert({
      businessProfileId: profile.id,
      stockItem: result.item,
      actorUserId: session.id,
    })

    return jsonOk({
      item: mapStockItemToJson(result.item),
      movement: mapStockMovementToJson({
        ...result.movement,
        createdBy: { id: session.id, name: session.name ?? '' },
        stockItem: {
          id: result.item.id,
          nameAr: result.item.nameAr,
          nameEn: result.item.nameEn,
        },
      }),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/stock/items/[id]/movements')
  }
}
