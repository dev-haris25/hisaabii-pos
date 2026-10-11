import { applyStockMovement } from '@/lib/stock/apply-stock-movement'
import {
  aggregateRecipeStockNeeds,
  loadStockNeedSources,
} from '@/lib/stock/recipe-stock-needs'
import { excludeBulkStockNeeds } from '@/lib/stock/exclude-bulk-stock-needs'

/**
 * Deduct recipe stock from main warehouse when a ticket is first marked ready:
 * default recipe + extras of the chosen variant options / customizations.
 * Bulk items (fryer oil) are skipped — they are entered on the day-end report.
 *
 * Does not stamp `kitchenOrder.stockDeductedAt`: the caller claims the ticket
 * first (guarded write on `stockDeductedAt: null`) inside the same transaction
 * and only calls this when the claim succeeded, so a ticket deducts once. On
 * failure the caller must roll back, which also undoes the claim.
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
    return { ok: true, deducted: false, shortfalls: [] }
  }

  const { recipesByMenuItemId, extras } = await loadStockNeedSources(
    tx,
    opts.businessProfileId,
    lines,
  )
  const { needs } = aggregateRecipeStockNeeds(
    lines,
    recipesByMenuItemId,
    extras,
  )
  const fromMain = await excludeBulkStockNeeds(
    tx,
    opts.businessProfileId,
    needs,
  )

  const reason = opts.orderNumber
    ? `Kitchen order #${opts.orderNumber}`
    : 'Kitchen ready'

  // Ascending stockItemId: two tickets sharing ingredients lock them in the
  // same order, so they wait for each other instead of deadlocking.
  const ordered = [...fromMain].sort((a, b) =>
    a.stockItemId < b.stockItemId ? -1 : a.stockItemId > b.stockItemId ? 1 : 0,
  )
  for (const need of ordered) {
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

  return { ok: true, deducted: fromMain.length > 0, shortfalls: [] }
}
