import { formatQtyString, parseQty } from '@/lib/stock/units'

/** @typedef {'purchase' | 'adjust_in' | 'adjust_out' | 'opening' | 'recipe_deduct' | 'allotment_issue' | 'allotment_return' | 'kitchen_stock_issue'} StockMovementType */

/**
 * @param {StockMovementType} type
 * @returns {'in' | 'out'}
 */
export function movementDirection(type) {
  if (
    type === 'adjust_out' ||
    type === 'recipe_deduct' ||
    type === 'allotment_issue' ||
    type === 'kitchen_stock_issue'
  ) {
    return 'out'
  }
  return 'in'
}

/**
 * @param {string} before
 * @param {string} quantity
 * @param {StockMovementType} type
 * @param {{ allowNegative?: boolean }} [opts]
 */
export function computeQuantityAfter(before, quantity, type, opts = {}) {
  const beforeN = parseQty(before) ?? 0
  const qtyN = parseQty(quantity)
  if (qtyN == null || qtyN < 0) {
    return { ok: false, code: 'INVALID_QUANTITY', message: 'Quantity must be ≥ 0' }
  }
  if (qtyN === 0) {
    return { ok: false, code: 'INVALID_QUANTITY', message: 'Quantity must be greater than 0' }
  }

  const afterN =
    movementDirection(type) === 'out' ? beforeN - qtyN : beforeN + qtyN

  if (afterN < 0 && opts.allowNegative !== true) {
    return {
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      message: 'Not enough stock for this movement',
      quantityBefore: formatQtyString(beforeN),
      quantityAfter: formatQtyString(afterN),
    }
  }

  return {
    ok: true,
    quantityBefore: formatQtyString(beforeN),
    quantityAfter: formatQtyString(afterN),
  }
}

/**
 * Apply a stock movement and update on-hand qty in one transaction.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} db
 * @param {{
 *   businessProfileId: string
 *   stockItemId: string
 *   type: StockMovementType
 *   quantity: string
 *   reason?: string | null
 *   note?: string | null
 *   createdByUserId?: string | null
 *   allowNegative?: boolean
 *   unitCost?: string | null
 * }} input
 */
export async function applyStockMovement(db, input) {
  const item = await db.stockItem.findFirst({
    where: {
      id: input.stockItemId,
      businessProfileId: input.businessProfileId,
    },
  })
  if (!item) {
    return { ok: false, code: 'NOT_FOUND', message: 'Stock item not found' }
  }
  if (!item.active) {
    return {
      ok: false,
      code: 'STOCK_ITEM_DELETED',
      message: 'Cannot move stock for a deleted item',
    }
  }

  const computed = computeQuantityAfter(
    item.quantityOnHand,
    input.quantity,
    input.type,
    { allowNegative: input.allowNegative === true },
  )
  if (!computed.ok) {
    return computed
  }

  const unitCost =
    input.unitCost != null && String(input.unitCost).trim() !== ''
      ? String(input.unitCost).trim()
      : null

  /** @type {Record<string, unknown>} */
  const itemUpdate = { quantityOnHand: computed.quantityAfter }
  if (input.type === 'purchase' && unitCost != null) {
    itemUpdate.unitCost = unitCost
  }

  const updated = await db.stockItem.update({
    where: { id: item.id },
    data: itemUpdate,
  })

  const movement = await db.stockMovement.create({
    data: {
      businessProfileId: input.businessProfileId,
      stockItemId: item.id,
      type: input.type,
      quantity: formatQtyString(parseQty(input.quantity) ?? 0),
      unit: item.unit,
      quantityBefore: computed.quantityBefore,
      quantityAfter: computed.quantityAfter,
      reason: input.reason?.trim() || null,
      note: input.note?.trim() || null,
      unitCost,
      createdByUserId: input.createdByUserId ?? null,
    },
  })

  return { ok: true, item: updated, movement }
}
