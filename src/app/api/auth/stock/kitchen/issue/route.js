import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { issueKitchenStock } from '@/lib/stock/kitchen-stock-ops'
import { kitchenStockIssueBodySchema } from '@/lib/stock/kitchen-stock-schemas'
import {
  listOpenKitchenAllocations,
  mapKitchenAllocationToJson,
} from '@/lib/stock/kitchen-stock'
import { getOrCreateBusinessSettings } from '@/lib/settings/get-or-create-business-settings'
import { runKitchenWasteAi } from '@/lib/stock/run-kitchen-waste-ai'
import { prisma } from '@/lib/prisma'

/** Issue (or top up) kitchen stock from main warehouse. */
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
    const parsed = kitchenStockIssueBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const settings = await getOrCreateBusinessSettings(auth.profile.id)

    const result = await prisma.$transaction(async (tx) => {
      return issueKitchenStock(tx, {
        businessProfileId: auth.profile.id,
        stockItemId: parsed.data.stockItemId,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        createdByUserId: auth.session.id,
        allowNegative: settings.allowNegativeStock === true,
        markOldConsumed: parsed.data.markOldConsumed === true,
      })
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    if (!result.ok) {
      const code = result.code || 'ISSUE_FAILED'
      const status =
        code === 'NOT_FOUND'
          ? 404
          : code === 'INSUFFICIENT_STOCK'
            ? 409
            : 400
      return jsonError(status, code, result.message || 'Could not issue kitchen stock')
    }

    if (result.closedAllocationId) {
      await runKitchenWasteAi({
        businessProfileId: auth.profile.id,
        allocationId: result.closedAllocationId,
      })
    }

    const rows = await listOpenKitchenAllocations(prisma, auth.profile.id)
    return jsonOk({
      allocation: result.allocation
        ? mapKitchenAllocationToJson(result.allocation)
        : null,
      toppedUp: result.toppedUp === true,
      markedOldConsumed: result.markedOldConsumed === true,
      allocations: rows.map(mapKitchenAllocationToJson),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/stock/kitchen/issue')
  }
}
