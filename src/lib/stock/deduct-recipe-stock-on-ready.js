import { applyStockMovement } from '@/lib/stock/apply-stock-movement'
import {
  aggregateRecipeStockNeeds,
  loadRecipesByMenuItemIds,
} from '@/lib/stock/recipe-stock-needs'
import { excludeBulkStockNeeds } from '@/lib/stock/exclude-bulk-stock-needs'

/**
 * Deduct recipe stock from main warehouse when a ticket is first marked ready.
 * Bulk items (fryer oil) are skipped — they are entered on the day-end report.
 * Idempotent via kitchenOrder.stockDeductedAt.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   businessProfileId: string
 *   kitchenOrderId: string
 *   linesSnapshot: unknown
 *   createdByUserId?: string | null
 *   allowNegative?: boolean
 *   allowMainStockIfNoKitchenStock?: boolean
 *   orderNumber?: number
 * }} opts
 */
export async function deductRecipeStockForKitchenReady(tx, opts) {
  const lines = Array.isArray(opts.linesSnapshot) ? opts.linesSnapshot : []
  const menuItemIds = lines
    .map((l) => (l && typeof l === 'object' ? l.menuItemId : null))
    .filter(Boolean)

  if (menuItemIds.length === 0) {
    await tx.kitchenOrder.update({
      where: { id: opts.kitchenOrderId },
      data: { stockDeductedAt: new Date() },
    })
    return { ok: true, deducted: false, shortfalls: [] }
  }

  const recipesByMenuItemId = await loadRecipesByMenuItemIds(
    tx,
    opts.businessProfileId,
    menuItemIds,
  )
  const { needs } = aggregateRecipeStockNeeds(lines, recipesByMenuItemId)
  const fromMain = await excludeBulkStockNeeds(
    tx,
    opts.businessProfileId,
    needs,
  )

  const reason = opts.orderNumber
    ? `Kitchen order #${opts.orderNumber}`
    : 'Kitchen ready'

  for (const need of fromMain) {
    const result = await applyStockMovement(tx, {
      businessProfileId: opts.businessProfileId,
      stockItemId: need.stockItemId,
      type: 'recipe_deduct',
      quantity: need.required,
      reason,
      createdByUserId: opts.createdByUserId ?? null,
      allowNegative: opts.allowNegative === true,
    })
    if (!result.ok) {
      return {
        ok: false,
        code: result.code ?? 'INSUFFICIENT_STOCK',
        shortfalls: [
          {
            ...need,
            onHand: result.onHand ?? '0',
            shortfall: need.required,
          },
        ],
      }
    }
  }

  await tx.kitchenOrder.update({
    where: { id: opts.kitchenOrderId },
    data: { stockDeductedAt: new Date() },
  })

  return { ok: true, deducted: fromMain.length > 0, shortfalls: [] }
}
