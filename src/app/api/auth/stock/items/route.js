import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { getOrCreateBusinessSettings } from '@/lib/settings/get-or-create-business-settings'
import { applyStockMovement } from '@/lib/stock/apply-stock-movement'
import { maybeEmitLowStockAlert } from '@/lib/stock/emit-low-stock-alert'
import { mapStockItemToJson } from '@/lib/stock/map-stock-json'
import { stockItemBodySchema } from '@/lib/stock/schemas'
import { normalizeQtyString, parseQty } from '@/lib/stock/units'
import { prisma } from '@/lib/prisma'

const stockItemOrderBy = [{ nameAr: 'asc' }, { createdAt: 'asc' }]

export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim()
    // Soft-deleted items are excluded by default; pass active=false only if needed.
    const activeRaw = searchParams.get('active') ?? 'true'
    const activeFilter =
      activeRaw === 'true' || activeRaw === 'false' ? activeRaw : 'true'
    const bulkRaw = searchParams.get('isBulk')
    const bulkFilter =
      bulkRaw === 'true' || bulkRaw === 'false' ? bulkRaw : null

    /** @type {Record<string, unknown>} */
    const where = { businessProfileId: profile.id }
    if (activeFilter === 'true') where.active = true
    if (activeFilter === 'false') where.active = false
    if (bulkFilter === 'true') where.isBulk = true
    if (bulkFilter === 'false') where.isBulk = false
    if (search) {
      where.OR = [
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ]
    }

    const settings = await getOrCreateBusinessSettings(profile.id)

    if (!shouldPaginateListRequest(searchParams)) {
      const rows = await prisma.stockItem.findMany({
        where,
        orderBy: stockItemOrderBy,
      })
      return jsonOk({
        items: rows.map((row) => mapStockItemToJson(row)),
        settings: {
          allowNegativeStock: settings.allowNegativeStock === true,
          lowStockAlertsEnabled: settings.lowStockAlertsEnabled === true,
        },
      })
    }

    const { page, limit, skip } = parseListPagination(searchParams)
    const [total, rows] = await Promise.all([
      prisma.stockItem.count({ where }),
      prisma.stockItem.findMany({
        where,
        orderBy: stockItemOrderBy,
        skip,
        take: limit,
      }),
    ])

    return jsonOk({
      items: rows.map((row) => mapStockItemToJson(row)),
      pagination: buildPaginationMeta(page, limit, total),
      settings: {
        allowNegativeStock: settings.allowNegativeStock === true,
        lowStockAlertsEnabled: settings.lowStockAlertsEnabled === true,
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/stock/items')
  }
}

export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile, session } = auth

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = stockItemBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    const nameAr = d.nameAr
    const dup = await prisma.stockItem.findFirst({
      where: {
        businessProfileId: profile.id,
        nameAr: { equals: nameAr, mode: 'insensitive' },
        active: true,
      },
      select: { id: true },
    })
    if (dup) {
      return jsonError(
        409,
        'DUPLICATE_STOCK_ITEM',
        'A stock item with this name already exists',
      )
    }

    const openingQty = normalizeQtyString(d.quantityOnHand ?? '0')
    const openingN = parseQty(openingQty) ?? 0

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.create({
        data: {
          businessProfileId: profile.id,
          nameAr,
          nameEn: d.nameEn?.trim() || null,
          unit: d.unit,
          quantityOnHand: '0',
          lowStockThreshold:
            d.lowStockThreshold === undefined ? null : d.lowStockThreshold,
          unitCost: d.unitCost === undefined ? null : d.unitCost,
          isBulk: d.isBulk ?? false,
          active: d.active ?? true,
          notes: d.notes?.trim() || null,
        },
      })

      if (openingN > 0) {
        const result = await applyStockMovement(tx, {
          businessProfileId: profile.id,
          stockItemId: item.id,
          type: 'opening',
          quantity: openingQty,
          reason: 'Opening balance',
          createdByUserId: session.id,
          allowNegative: true,
        })
        if (!result.ok) {
          throw new Error(result.message || 'Opening movement failed')
        }
        return result.item
      }

      return item
    })

    await maybeEmitLowStockAlert({
      businessProfileId: profile.id,
      stockItem: created,
      actorUserId: session.id,
    })

    return jsonOk({
      item: mapStockItemToJson(created),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/stock/items')
  }
}
