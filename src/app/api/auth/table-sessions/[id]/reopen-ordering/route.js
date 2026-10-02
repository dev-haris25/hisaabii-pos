import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { mapTableSessionFlagsJson } from '@/lib/e-waiter/map-table-session-flags'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * Staff: clear billRequestedAt so the table can submit new rounds again.
 */
export async function POST(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const { id } = await context.params
    const session = await prisma.tableSession.findFirst({
      where: {
        id,
        businessProfileId: auth.profile.id,
        status: 'open',
      },
      include: {
        table: { select: { id: true, name: true, status: true } },
      },
    })
    if (!session) {
      return jsonError(404, 'SESSION_NOT_FOUND', 'Table session not found')
    }

    const updated = await prisma.tableSession.update({
      where: { id: session.id },
      data: {
        billRequestedAt: null,
        requestedRedeemPoints: null,
      },
    })

    const roundCount = await prisma.kitchenOrder.count({
      where: {
        tableSessionId: session.id,
        status: { not: 'cancelled' },
      },
    })

    return jsonOk({
      session: mapTableSessionFlagsJson(updated, {
        tableName: session.table.name,
        tableStatus: session.table.status,
        roundCount,
      }),
    })
  } catch (err) {
    return handleRouteError(
      err,
      'POST /api/auth/table-sessions/[id]/reopen-ordering',
    )
  }
}
