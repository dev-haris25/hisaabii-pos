import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import {
  listOpenKitchenAllocations,
  mapKitchenAllocationToJson,
  markKitchenAllocationConsumed,
} from '@/lib/stock/kitchen-stock'
import { kitchenStockMarkConsumedBodySchema } from '@/lib/stock/kitchen-stock-schemas'
import { runKitchenWasteAi } from '@/lib/stock/run-kitchen-waste-ai'
import { prisma } from '@/lib/prisma'

/** Mark an open kitchen stock allocation as consumed (records waste). */
export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }
    const parsed = kitchenStockMarkConsumedBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const result = await prisma.$transaction(async (tx) => {
      return markKitchenAllocationConsumed(tx, {
        allocationId: parsed.data.allocationId,
        businessProfileId: auth.profile.id,
        closedByUserId: auth.session.id,
      })
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    if (!result.ok) {
      return jsonError(
        result.code === 'NOT_FOUND' ? 404 : 400,
        result.code || 'MARK_CONSUMED_FAILED',
        result.message || 'Could not mark kitchen stock consumed',
      )
    }

    const ai = await runKitchenWasteAi({
      businessProfileId: auth.profile.id,
      allocationId: result.allocation.id,
    })
    const closed = ai.ok && ai.allocation ? ai.allocation : result.allocation

    const rows = await listOpenKitchenAllocations(prisma, auth.profile.id)
    return jsonOk({
      allocation: mapKitchenAllocationToJson(closed),
      allocations: rows.map(mapKitchenAllocationToJson),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/stock/kitchen/mark-consumed')
  }
}
