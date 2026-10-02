import { jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapTableSessionFlagsJson } from '@/lib/e-waiter/map-table-session-flags'
import { mapTableToJson } from '@/lib/e-waiter/map-table-json'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

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

/**
 * Live floor list for staff Tables view (TableSession read).
 * Returns every non-deleted table with openSession flags + waiter-call state.
 * Available/Occupied comes from Table.status only (invoice/session lifecycle) —
 * never from bill-requested or waiter-call flags.
 */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    const rows = await prisma.table.findMany({
      where: {
        businessProfileId: profile.id,
        ...WHERE_NOT_DELETED,
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      include: openSessionInclude,
    })

    const tables = rows.map((row) => {
      const base = mapTableToJson(row)
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
      return base
    })

    return jsonOk({ tables })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/table-sessions')
  }
}
