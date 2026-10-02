import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapTableWaiterCallJson } from '@/lib/e-waiter/map-table-session-flags'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * Staff: dismiss / resolve an active waiter call on a Table.
 * Session-independent — does not touch TableSession.
 * RBAC: TableSession update (Cashiers operate the live floor view).
 */
export async function POST(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const { id } = await context.params
    const table = await prisma.table.findFirst({
      where: {
        id,
        businessProfileId: auth.profile.id,
        ...WHERE_NOT_DELETED,
      },
      select: {
        id: true,
        name: true,
        status: true,
        waiterCallRequestedAt: true,
        waiterCallResolvedAt: true,
      },
    })
    if (!table) {
      return jsonError(404, 'TABLE_NOT_FOUND', 'Table not found')
    }

    if (!table.waiterCallRequestedAt) {
      return jsonOk({
        alreadyResolved: true,
        waiterCall: mapTableWaiterCallJson(table),
      })
    }

    const updated = await prisma.table.update({
      where: { id: table.id },
      data: { waiterCallResolvedAt: new Date() },
      select: {
        id: true,
        name: true,
        status: true,
        waiterCallRequestedAt: true,
        waiterCallResolvedAt: true,
      },
    })

    return jsonOk({
      alreadyResolved: false,
      waiterCall: mapTableWaiterCallJson(updated),
    })
  } catch (err) {
    return handleRouteError(
      err,
      'POST /api/auth/tables/[id]/resolve-waiter-call',
    )
  }
}
