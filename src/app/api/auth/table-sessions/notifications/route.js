import { jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  isWaiterCallActive,
  mapTableSessionFlagsJson,
  mapTableWaiterCallJson,
} from '@/lib/e-waiter/map-table-session-flags'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * Lightweight poll payload for Tables-view toast/badge (sonner consumers later).
 * Bill requests come from open TableSessions; waiter calls come from Tables.
 */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const [billSessions, waiterTables] = await Promise.all([
      prisma.tableSession.findMany({
        where: {
          businessProfileId: auth.profile.id,
          status: 'open',
          billRequestedAt: { not: null },
        },
        include: {
          table: {
            select: {
              id: true,
              name: true,
              status: true,
              waiterCallRequestedAt: true,
              waiterCallResolvedAt: true,
            },
          },
          _count: {
            select: {
              kitchenOrders: {
                where: { status: { not: 'cancelled' } },
              },
            },
          },
        },
        orderBy: [{ billRequestedAt: 'desc' }],
      }),
      prisma.table.findMany({
        where: {
          businessProfileId: auth.profile.id,
          ...WHERE_NOT_DELETED,
          waiterCallRequestedAt: { not: null },
        },
        select: {
          id: true,
          name: true,
          status: true,
          waiterCallRequestedAt: true,
          waiterCallResolvedAt: true,
        },
        orderBy: [{ waiterCallRequestedAt: 'desc' }],
      }),
    ])

    /** @type {Map<string, Record<string, unknown>>} */
    const byTableId = new Map()

    for (const row of billSessions) {
      const mapped = mapTableSessionFlagsJson(row, {
        tableName: row.table.name,
        tableStatus: row.table.status,
        roundCount: row._count.kitchenOrders,
      })
      const waiter = mapTableWaiterCallJson(row.table)
      byTableId.set(row.table.id, {
        tableId: row.table.id,
        tableName: row.table.name,
        tableStatus: row.table.status,
        ...mapped,
        ...waiter,
        kinds: [
          'bill_requested',
          ...(waiter.waiterCallActive ? ['waiter_call'] : []),
        ],
      })
    }

    for (const table of waiterTables) {
      if (!isWaiterCallActive(table)) continue
      const existing = byTableId.get(table.id)
      if (existing) {
        if (!existing.kinds.includes('waiter_call')) {
          existing.kinds = [...existing.kinds, 'waiter_call']
        }
        Object.assign(existing, mapTableWaiterCallJson(table))
        continue
      }
      const waiter = mapTableWaiterCallJson(table)
      byTableId.set(table.id, {
        ...waiter,
        sessionId: null,
        billRequested: false,
        billRequestedAt: null,
        kinds: ['waiter_call'],
      })
    }

    const notifications = [...byTableId.values()]

    return jsonOk({
      notifications,
      counts: {
        billRequested: notifications.filter((n) =>
          n.kinds.includes('bill_requested'),
        ).length,
        waiterCall: notifications.filter((n) =>
          n.kinds.includes('waiter_call'),
        ).length,
        total: notifications.length,
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/table-sessions/notifications')
  }
}
