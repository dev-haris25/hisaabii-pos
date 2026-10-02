import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requireKitchenQueueApi } from '@/lib/auth/require-kitchen-app-user'
import { cancelEWaiterRoundInDb } from '@/lib/e-waiter/replace-e-waiter-round-lines'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { prisma } from '@/lib/prisma'

/**
 * Staff cancel for E-Waiter kitchen rounds only (tableSessionId required).
 * Path param is shared with status as `[invoiceId]` (Next.js requires one slug name
 * per dynamic segment) — for E-Waiter tickets this is the KitchenOrder id.
 * Allowed at pending / preparing / ready. Marks TableSessionLines cancelled.
 * POS tickets (no tableSessionId) must cancel via invoice void — rejected here.
 */
export async function POST(request, context) {
  try {
    const auth = await requireKitchenQueueApi(request, 'update')
    if (auth.error) return auth.error

    const { invoiceId } = await context.params
    const id = String(invoiceId ?? '').trim()
    if (!id) {
      return jsonError(400, 'VALIDATION_ERROR', 'Order id required')
    }

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.kitchenOrder.findFirst({
        where: {
          id,
          businessProfileId: auth.profileId,
        },
        select: {
          id: true,
          status: true,
          tableSessionId: true,
          orderNumber: true,
          roundNumber: true,
        },
      })
      if (!ticket) {
        return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Order not found' }
      }
      if (!ticket.tableSessionId) {
        return {
          ok: false,
          status: 409,
          code: 'NOT_E_WAITER_TICKET',
          message: 'Only E-Waiter table rounds can be cancelled from the kitchen board',
        }
      }
      if (ticket.status === 'completed' || ticket.status === 'cancelled') {
        return {
          ok: false,
          status: 409,
          code: 'INVALID_ORDER_STATUS',
          message: 'This order can no longer be cancelled',
        }
      }
      if (
        ticket.status !== 'pending' &&
        ticket.status !== 'preparing' &&
        ticket.status !== 'ready'
      ) {
        return {
          ok: false,
          status: 409,
          code: 'INVALID_ORDER_STATUS',
          message: 'This order can no longer be cancelled',
        }
      }

      const cancelled = await cancelEWaiterRoundInDb(tx, ticket.id)
      return { ok: true, cancelled }
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    if (!result.ok) {
      return jsonError(result.status, result.code, result.message)
    }

    return jsonOk({
      id: result.cancelled.id,
      invoiceId: result.cancelled.id,
      orderNumber: result.cancelled.orderNumber,
      roundNumber: result.cancelled.roundNumber,
      status: result.cancelled.status,
      sessionClosed: result.cancelled.sessionClosed === true,
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/orders/[invoiceId]/cancel')
  }
}
