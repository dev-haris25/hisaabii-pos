import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { deletedTableQrTokenPlaceholder } from '@/lib/e-waiter/allocate-table-qr-token'
import { mapTableToJson } from '@/lib/e-waiter/map-table-json'
import { tablePatchSchema } from '@/lib/e-waiter/table-body-schema'
import {
  eWaiterOrderAbsoluteUrl,
  eWaiterOrderOriginFromRequest,
} from '@/lib/e-waiter/table-order-url'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * @param {string} profileId
 * @param {string} id
 */
async function loadOwnedTable(profileId, id) {
  return prisma.table.findFirst({
    where: { id, businessProfileId: profileId, ...WHERE_NOT_DELETED },
  })
}

/**
 * @param {import('next/server').NextRequest} request
 * @param {{ slug: string | null, qrToken: string }} args
 */
function orderUrlFor(request, { slug, qrToken }) {
  if (!slug) return null
  const origin = eWaiterOrderOriginFromRequest(request)
  return eWaiterOrderAbsoluteUrl(origin, 'en', slug, qrToken)
}

export async function GET(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params
    const row = await loadOwnedTable(auth.profile.id, id)
    if (!row) return jsonError(404, 'TABLE_NOT_FOUND', 'Table not found')
    return jsonOk({
      table: mapTableToJson(row, {
        orderUrl: orderUrlFor(request, {
          slug: auth.profile.slug,
          qrToken: row.qrToken,
        }),
      }),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/tables/[id]')
  }
}

export async function PATCH(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedTable(auth.profile.id, id)
    if (!existing) return jsonError(404, 'TABLE_NOT_FOUND', 'Table not found')

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    if (body && typeof body === 'object') {
      if (
        Object.prototype.hasOwnProperty.call(body, 'qrToken') ||
        Object.prototype.hasOwnProperty.call(body, 'status')
      ) {
        return jsonError(
          400,
          'TABLE_FIELD_LOCKED',
          'qrToken and status cannot be changed via this endpoint',
        )
      }
    }

    const parsed = tablePatchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const row = await prisma.table.update({
      where: { id },
      data: { name: parsed.data.name },
    })

    return jsonOk({
      table: mapTableToJson(row, {
        orderUrl: orderUrlFor(request, {
          slug: auth.profile.slug,
          qrToken: row.qrToken,
        }),
      }),
    })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/tables/[id]')
  }
}

export async function DELETE(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedTable(auth.profile.id, id)
    if (!existing) return jsonError(404, 'TABLE_NOT_FOUND', 'Table not found')

    const openSession = await prisma.tableSession.findFirst({
      where: { tableId: id, status: 'open' },
      select: { id: true },
    })
    if (openSession) {
      return jsonError(
        409,
        'TABLE_HAS_OPEN_SESSION',
        'Cannot delete a table with an open session',
      )
    }

    await prisma.table.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        qrToken: deletedTableQrTokenPlaceholder(id),
        status: 'available',
      },
    })

    return jsonOk({ deleted: true, id })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/tables/[id]')
  }
}
