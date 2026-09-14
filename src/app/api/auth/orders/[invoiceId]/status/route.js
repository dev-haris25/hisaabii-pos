import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requireKitchenQueueApi } from '@/lib/auth/require-kitchen-app-user'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  canTransitionKitchenStatus,
  kitchenStatusUpdateData,
} from '@/lib/orders/sync-kitchen-order'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'completed']),
})

export async function PATCH(request, context) {
  try {
    const auth = await requireKitchenQueueApi(request, 'update')
    if (auth.error) return auth.error

    const { invoiceId } = await context.params
    if (!invoiceId) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invoice id required')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const ticket = await prisma.kitchenOrder.findFirst({
      where: {
        invoiceId,
        businessProfileId: auth.profileId,
        invoice: { ...WHERE_NOT_DELETED, status: { not: 'voided' } },
      },
    })
    if (!ticket) {
      return jsonError(404, 'NOT_FOUND', 'Order not found')
    }
    if (!canTransitionKitchenStatus(ticket.status, parsed.data.status)) {
      return jsonError(409, 'INVALID_ORDER_STATUS', 'That status change is not allowed')
    }

    const updated = await prisma.kitchenOrder.update({
      where: { id: ticket.id },
      data: kitchenStatusUpdateData(parsed.data.status),
    })

    return jsonOk({
      invoiceId: updated.invoiceId,
      orderNumber: updated.orderNumber,
      status: updated.status,
    })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/orders/[invoiceId]/status')
  }
}
