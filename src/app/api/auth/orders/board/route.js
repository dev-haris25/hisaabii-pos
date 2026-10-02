import { jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requireKitchenQueueApi } from '@/lib/auth/require-kitchen-app-user'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapKitchenBoardOrder } from '@/lib/orders/map-kitchen-board-order'
import { prisma } from '@/lib/prisma'

const ACTIVE_STATUSES = ['pending', 'preparing', 'ready']

export async function GET(request) {
  try {
    const auth = await requireKitchenQueueApi(request, 'kitchen')
    if (auth.error) return auth.error

    const invoiceOk = { ...WHERE_NOT_DELETED, status: { not: 'voided' } }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const select = {
      id: true,
      invoiceId: true,
      tableSessionId: true,
      roundNumber: true,
      orderNumber: true,
      status: true,
      itemsUpdatedAt: true,
      linesSnapshot: true,
      createdAt: true,
      completedAt: true,
      updatedAt: true,
      tableSession: {
        select: {
          id: true,
          table: { select: { name: true } },
        },
      },
    }

    /** POS tickets (have invoice) or open E-Waiter rounds (session, no invoice yet). */
    const kitchenVisibility = {
      OR: [
        { invoice: invoiceOk },
        { tableSessionId: { not: null } },
      ],
    }

    const [activeRows, completedRows, cancelledRows] = await Promise.all([
      prisma.kitchenOrder.findMany({
        where: {
          businessProfileId: auth.profileId,
          status: { in: ACTIVE_STATUSES },
          AND: [kitchenVisibility],
        },
        orderBy: [{ createdAt: 'asc' }],
        select,
      }),
      prisma.kitchenOrder.findMany({
        where: {
          businessProfileId: auth.profileId,
          status: 'completed',
          AND: [
            kitchenVisibility,
            {
              OR: [
                { completedAt: { gte: since } },
                { completedAt: null, updatedAt: { gte: since } },
              ],
            },
          ],
        },
        orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
        select,
      }),
      prisma.kitchenOrder.findMany({
        where: {
          businessProfileId: auth.profileId,
          status: 'cancelled',
          AND: [
            kitchenVisibility,
            {
              OR: [
                { itemsUpdatedAt: { gte: since } },
                { updatedAt: { gte: since } },
              ],
            },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }, { itemsUpdatedAt: 'desc' }],
        select,
      }),
    ])

    const pending = []
    const preparing = []
    const ready = []
    for (const row of activeRows) {
      const mapped = mapKitchenBoardOrder(row, 'kitchen')
      if (row.status === 'pending') pending.push(mapped)
      else if (row.status === 'ready') ready.push(mapped)
      else preparing.push(mapped)
    }

    // Average serve time for tickets completed in the last 24 hours only.
    let averagePrepMs = 0
    if (completedRows.length > 0) {
      let total = 0
      for (const row of completedRows) {
        const end = (row.completedAt ?? row.itemsUpdatedAt).getTime()
        total += Math.max(0, end - row.createdAt.getTime())
      }
      averagePrepMs = Math.round(total / completedRows.length)
    }

    return jsonOk({
      view: 'kitchen',
      pending,
      preparing,
      ready,
      completed: completedRows.map((row) => mapKitchenBoardOrder(row, 'kitchen')),
      cancelled: cancelledRows.map((row) => mapKitchenBoardOrder(row, 'kitchen')),
      stats: {
        activeCount: activeRows.length,
        completedCount: completedRows.length,
        cancelledCount: cancelledRows.length,
        averagePrepMs,
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/orders/board')
  }
}
