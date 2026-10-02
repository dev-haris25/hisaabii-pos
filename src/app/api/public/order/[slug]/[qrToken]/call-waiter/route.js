import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { mapTableWaiterCallJson } from '@/lib/e-waiter/map-table-session-flags'
import { resolvePublicOrderTable } from '@/lib/e-waiter/resolve-public-order-table'
import { prisma } from '@/lib/prisma'

/**
 * Customer Call Waiter — lightweight, session-independent.
 * Does NOT create or touch TableSession. Does NOT lock ordering.
 * Repeat calls after resolve refresh waiterCallRequestedAt on the Table.
 */
export async function POST(_request, context) {
  try {
    const { slug, qrToken } = await context.params
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    const now = new Date()
    const table = await prisma.table.update({
      where: { id: resolved.table.id },
      data: {
        waiterCallRequestedAt: now,
        waiterCallResolvedAt: null,
      },
      select: {
        id: true,
        name: true,
        status: true,
        waiterCallRequestedAt: true,
        waiterCallResolvedAt: true,
      },
    })

    return jsonOk({
      waiterCall: mapTableWaiterCallJson(table),
    })
  } catch (err) {
    return handleRouteError(
      err,
      'POST /api/public/order/[slug]/[qrToken]/call-waiter',
    )
  }
}
