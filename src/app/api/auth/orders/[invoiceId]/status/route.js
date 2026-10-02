import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requireKitchenQueueApi } from '@/lib/auth/require-kitchen-app-user'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import {
  canTransitionKitchenStatus,
  kitchenStatusUpdateData,
} from '@/lib/orders/sync-kitchen-order'
import { getOrCreateBusinessSettings } from '@/lib/settings/get-or-create-business-settings'
import { deductRecipeStockForKitchenReady } from '@/lib/stock/deduct-recipe-stock-on-ready'
import { maybeEmitLowStockAlert } from '@/lib/stock/emit-low-stock-alert'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'completed']),
  allowMainStockIfNoKitchenStock: z.boolean().optional(),
  /** @deprecated */
  allowMainStockIfNoAllotment: z.boolean().optional(),
})

export async function PATCH(request, context) {
  try {
    const auth = await requireKitchenQueueApi(request, 'update')
    if (auth.error) return auth.error

    const { invoiceId } = await context.params
    if (!invoiceId) {
      return jsonError(400, 'VALIDATION_ERROR', 'Order id required')
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

    const invoiceOk = { ...WHERE_NOT_DELETED, status: { not: 'voided' } }
    const ticket = await prisma.kitchenOrder.findFirst({
      where: {
        businessProfileId: auth.profileId,
        OR: [
          { invoiceId, invoice: invoiceOk },
          { id: invoiceId },
        ],
      },
    })
    if (!ticket) {
      return jsonError(404, 'NOT_FOUND', 'Order not found')
    }
    // Reject voided-invoice POS tickets (E-Waiter tickets have no invoice).
    if (ticket.invoiceId) {
      const inv = await prisma.invoice.findFirst({
        where: {
          id: ticket.invoiceId,
          businessProfileId: auth.profileId,
          ...WHERE_NOT_DELETED,
          status: { not: 'voided' },
        },
        select: { id: true },
      })
      if (!inv) {
        return jsonError(404, 'NOT_FOUND', 'Order not found')
      }
    }
    if (!canTransitionKitchenStatus(ticket.status, parsed.data.status)) {
      return jsonError(409, 'INVALID_ORDER_STATUS', 'That status change is not allowed')
    }

    const nextStatus = parsed.data.status
    const shouldDeduct =
      nextStatus === 'ready' && ticket.stockDeductedAt == null

    if (!shouldDeduct) {
      const updated = await prisma.kitchenOrder.update({
        where: { id: ticket.id },
        data: kitchenStatusUpdateData(nextStatus),
      })
      return jsonOk({
        id: updated.id,
        invoiceId: updated.invoiceId ?? updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
      })
    }

    const settings = await getOrCreateBusinessSettings(auth.profileId)

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const deduct = await deductRecipeStockForKitchenReady(tx, {
          businessProfileId: auth.profileId,
          kitchenOrderId: ticket.id,
          linesSnapshot: ticket.linesSnapshot,
          createdByUserId: auth.session.id,
          allowNegative: settings.allowNegativeStock === true,
          allowMainStockIfNoKitchenStock:
            settings.allowMainStockIfNoKitchenStock === true,
          orderNumber: ticket.orderNumber,
        })
        if (!deduct.ok) {
          const err = /** @type {Error & { code?: string, shortfalls?: unknown, missingKitchenStock?: unknown, missingAllotment?: unknown }} */ (
            new Error(deduct.message || 'Insufficient stock')
          )
          err.code = deduct.code || 'INSUFFICIENT_STOCK'
          err.shortfalls = deduct.shortfalls
          err.missingKitchenStock = deduct.missingKitchenStock
          err.missingAllotment = deduct.missingAllotment
          throw err
        }

        return tx.kitchenOrder.update({
          where: { id: ticket.id },
          data: kitchenStatusUpdateData(nextStatus),
        })
      }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

      const lines = Array.isArray(ticket.linesSnapshot)
        ? ticket.linesSnapshot
        : []
      const menuItemIds = lines
        .map((l) => (l && typeof l === 'object' ? l.menuItemId : null))
        .filter(Boolean)
      if (menuItemIds.length > 0) {
        const recipes = await prisma.menuItemRecipe.findMany({
          where: { menuItemId: { in: menuItemIds } },
          include: {
            ingredients: {
              select: { stockItemId: true },
            },
          },
        })
        const stockIds = [
          ...new Set(
            recipes.flatMap((r) => r.ingredients.map((i) => i.stockItemId)),
          ),
        ]
        if (stockIds.length > 0) {
          const stocks = await prisma.stockItem.findMany({
            where: { id: { in: stockIds }, businessProfileId: auth.profileId },
          })
          for (const stock of stocks) {
            await maybeEmitLowStockAlert({
              businessProfileId: auth.profileId,
              stockItem: stock,
              actorUserId: auth.session.id,
            })
          }
        }
      }

      return jsonOk({
        id: updated.id,
        invoiceId: updated.invoiceId ?? updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
      })
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      if (code === 'INSUFFICIENT_STOCK') {
        return jsonError(
          409,
          'INSUFFICIENT_STOCK',
          'Not enough stock to mark this order ready',
          e && typeof e === 'object' && 'shortfalls' in e
            ? e.shortfalls
            : undefined,
        )
      }
      if (
        code === 'NO_KITCHEN_STOCK_CONFIRM' ||
        code === 'NO_ALLOTMENT_CONFIRM'
      ) {
        return jsonError(
          409,
          'NO_KITCHEN_STOCK_CONFIRM',
          'Some items do not have enough kitchen stock',
          e && typeof e === 'object' && 'shortfalls' in e
            ? e.shortfalls
            : undefined,
        )
      }
      throw e
    }
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/orders/[invoiceId]/status')
  }
}
