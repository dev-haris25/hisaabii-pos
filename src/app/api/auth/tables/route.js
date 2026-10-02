import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { allocateUniqueTableQrToken } from '@/lib/e-waiter/allocate-table-qr-token'
import { mapTableSessionFlagsJson } from '@/lib/e-waiter/map-table-session-flags'
import { mapTableToJson } from '@/lib/e-waiter/map-table-json'
import { tableBodySchema } from '@/lib/e-waiter/table-body-schema'
import {
  eWaiterOrderAbsoluteUrl,
  eWaiterOrderOriginFromRequest,
} from '@/lib/e-waiter/table-order-url'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * @param {import('next/server').NextRequest} request
 * @param {{ slug: string | null, qrToken: string }} args
 */
function orderUrlFor(request, { slug, qrToken }) {
  if (!slug) return null
  const origin = eWaiterOrderOriginFromRequest(request)
  return eWaiterOrderAbsoluteUrl(origin, 'en', slug, qrToken)
}

/**
 * @param {{
 *   id: string
 *   name: string
 *   qrToken: string
 *   status: string
 *   createdAt: Date
 *   updatedAt: Date
 *   sessions?: Array<Record<string, unknown>>
 * }} row
 * @param {{ orderUrl?: string | null }} opts
 */
function mapTableWithOpenSession(row, opts) {
  const base = mapTableToJson(row, opts)
  const open = Array.isArray(row.sessions) ? row.sessions[0] : null
  base.openSession = open
    ? mapTableSessionFlagsJson(
        /** @type {Parameters<typeof mapTableSessionFlagsJson>[0]} */ (open),
        {
          tableName: row.name,
          tableStatus: row.status,
          roundCount:
            open._count && typeof open._count === 'object'
              ? /** @type {{ kitchenOrders?: number }} */ (open._count)
                  .kitchenOrders ?? 0
              : 0,
        },
      )
    : null
  // Waiter-call flags come from Table itself (mapTableToJson), not openSession.
  return base
}

const openSessionInclude = {
  sessions: {
    where: { status: 'open' },
    take: 1,
    orderBy: { openedAt: 'desc' },
    include: {
      _count: {
        select: {
          kitchenOrders: { where: { status: { not: 'cancelled' } } },
        },
      },
    },
  },
}

export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim()
    const statusRaw = (searchParams.get('status') ?? '').trim()
    const statusFilter =
      statusRaw === 'available' || statusRaw === 'occupied' ? statusRaw : ''

    /** @type {Record<string, unknown>} */
    const where = { businessProfileId: profile.id, ...WHERE_NOT_DELETED }
    if (statusFilter) where.status = statusFilter
    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    const orderBy = [{ name: 'asc' }, { createdAt: 'asc' }]

    /**
     * @param {Parameters<typeof mapTableWithOpenSession>[0]} row
     */
    const mapRow = (row) =>
      mapTableWithOpenSession(row, {
        orderUrl: orderUrlFor(request, {
          slug: profile.slug,
          qrToken: row.qrToken,
        }),
      })

    if (shouldPaginateListRequest(searchParams)) {
      const { page, limit, skip } = parseListPagination(searchParams, {
        defaultLimit: 10,
      })
      const [total, rows] = await Promise.all([
        prisma.table.count({ where }),
        prisma.table.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: openSessionInclude,
        }),
      ])
      return jsonOk({
        tables: rows.map(mapRow),
        pagination: buildPaginationMeta(page, limit, total),
      })
    }

    const rows = await prisma.table.findMany({
      where,
      orderBy,
      include: openSessionInclude,
    })
    return jsonOk({ tables: rows.map(mapRow) })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/tables')
  }
}

export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = tableBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const qrToken = await allocateUniqueTableQrToken()
    const row = await prisma.table.create({
      data: {
        businessProfileId: profile.id,
        name: parsed.data.name,
        qrToken,
        status: 'available',
      },
    })

    return jsonOk({
      table: mapTableToJson(row, {
        orderUrl: orderUrlFor(request, {
          slug: profile.slug,
          qrToken: row.qrToken,
        }),
      }),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/tables')
  }
}
