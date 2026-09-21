import { applyStockMovement } from '@/lib/stock/apply-stock-movement'
import {
  getOpenKitchenAllocation,
  listOpenKitchenAllocations,
  markKitchenAllocationConsumed,
} from '@/lib/stock/kitchen-stock'
import { kitchenStockRemaining } from '@/lib/stock/kitchen-stock-math'
import {
  canConvertUnits,
  convertStockQty,
  formatQtyString,
  normalizeQtyString,
  parseQty,
} from '@/lib/stock/units'

/**
 * Classify recipe needs against open kitchen stock vs main warehouse.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {Array<{
 *   stockItemId: string
 *   nameAr: string
 *   nameEn: string | null
 *   unit: import('@/lib/stock/units').StockUnit
 *   required: string
 * }>} needs
 * @param {{ allowMainStockIfNoKitchenStock?: boolean }} [opts]
 */
export async function resolveKitchenStockAwareNeeds(
  db,
  businessProfileId,
  needs,
  opts = {},
) {
  const openRows = await listOpenKitchenAllocations(db, businessProfileId)
  /** @type {Map<string, (typeof openRows)[0]>} */
  const openByStock = new Map()
  for (const row of openRows) {
    openByStock.set(row.stockItemId, row)
  }

  const allowMain = opts.allowMainStockIfNoKitchenStock === true

  /** @type {typeof needs} */
  const fromKitchen = []
  /** @type {typeof needs} */
  const fromMain = []
  /** @type {typeof needs} */
  const missingKitchenStock = []
  /** @type {Array<typeof needs[0] & { onHand: string, shortfall: string }>} */
  const shortfalls = []

  /**
   * @param {typeof needs[0]} need
   * @param {number} mainQty
   */
  async function addMainNeed(need, mainQty) {
    if (mainQty <= 0) return
    fromMain.push({
      ...need,
      required: formatQtyString(mainQty),
    })
    const stock = await db.stockItem.findFirst({
      where: { id: need.stockItemId, businessProfileId },
      select: { quantityOnHand: true },
    })
    const onHandN = parseQty(stock?.quantityOnHand ?? '0') ?? 0
    if (mainQty > onHandN) {
      shortfalls.push({
        ...need,
        required: formatQtyString(mainQty),
        onHand: formatQtyString(onHandN),
        shortfall: formatQtyString(mainQty - onHandN),
      })
    }
  }

  for (const need of needs) {
    const requiredN = parseQty(need.required) ?? 0
    if (requiredN <= 0) continue

    const alloc = openByStock.get(need.stockItemId)
    const remaining = alloc ? Math.max(0, kitchenStockRemaining(alloc)) : 0

    if (remaining >= requiredN) {
      fromKitchen.push({
        ...need,
        required: formatQtyString(requiredN),
      })
      continue
    }

    if (!allowMain) {
      missingKitchenStock.push({
        ...need,
        onHand: formatQtyString(remaining),
        shortfall: formatQtyString(requiredN - remaining),
      })
      continue
    }

    if (remaining > 0) {
      fromKitchen.push({
        ...need,
        required: formatQtyString(remaining),
      })
    }
    await addMainNeed(need, requiredN - remaining)
  }

  return {
    openByStock,
    allowMainStockIfNoKitchenStock: allowMain,
    kitchenMode: openRows.length > 0 || allowMain,
    fromKitchen,
    fromMain,
    missingKitchenStock,
    shortfalls,
  }
}

/**
 * Issue from main into kitchen stock. If an open allocation exists:
 * - markOldConsumed=true → close it (waste math), then start a new cycle
 * - markOldConsumed=false → top up the open cycle
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   businessProfileId: string
 *   stockItemId: string
 *   quantity: string
 *   unit?: import('@/lib/stock/units').StockUnit
 *   createdByUserId?: string | null
 *   allowNegative?: boolean
 *   markOldConsumed?: boolean
 * }} input
 */
export async function issueKitchenStock(tx, input) {
  const item = await tx.stockItem.findFirst({
    where: {
      id: input.stockItemId,
      businessProfileId: input.businessProfileId,
      active: true,
    },
  })
  if (!item) {
    return { ok: false, code: 'NOT_FOUND', message: 'Stock item not found' }
  }

  let qtyInItemUnit = normalizeQtyString(input.quantity)
  const qtyN = parseQty(qtyInItemUnit)
  if (qtyN == null || qtyN <= 0) {
    return { ok: false, code: 'INVALID_QUANTITY', message: 'Quantity must be greater than 0' }
  }

  if (input.unit && input.unit !== item.unit) {
    if (!canConvertUnits(input.unit, item.unit)) {
      return {
        ok: false,
        code: 'INCOMPATIBLE_UNIT',
        message: 'Unit must match the stock item family',
      }
    }
    qtyInItemUnit = convertStockQty(qtyInItemUnit, input.unit, item.unit)
  }

  const existing = await getOpenKitchenAllocation(
    tx,
    input.businessProfileId,
    item.id,
  )

  /** @type {string | null} */
  let closedAllocationId = null
  if (existing && input.markOldConsumed === true) {
    const closed = await markKitchenAllocationConsumed(tx, {
      allocationId: existing.id,
      businessProfileId: input.businessProfileId,
      closedByUserId: input.createdByUserId ?? null,
    })
    if (!closed.ok) return closed
    closedAllocationId = existing.id
  }

  const movement = await applyStockMovement(tx, {
    businessProfileId: input.businessProfileId,
    stockItemId: item.id,
    type: 'kitchen_stock_issue',
    quantity: qtyInItemUnit,
    reason: 'Kitchen stock issue',
    createdByUserId: input.createdByUserId ?? null,
    allowNegative: input.allowNegative === true,
  })
  if (!movement.ok) return movement

  const openAfterClose =
    existing && input.markOldConsumed === true
      ? null
      : existing

  const addN = parseQty(qtyInItemUnit) ?? 0
  let allocation
  if (openAfterClose) {
    const prevIssued = parseQty(openAfterClose.quantityIssued ?? '0') ?? 0
    allocation = await tx.kitchenStockAllocation.update({
      where: { id: openAfterClose.id },
      data: { quantityIssued: formatQtyString(prevIssued + addN) },
      include: {
        stockItem: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            unit: true,
            quantityOnHand: true,
            isBulk: true,
            active: true,
          },
        },
      },
    })
  } else {
    allocation = await tx.kitchenStockAllocation.create({
      data: {
        businessProfileId: input.businessProfileId,
        stockItemId: item.id,
        quantityIssued: formatQtyString(addN),
        openedByUserId: input.createdByUserId ?? null,
      },
      include: {
        stockItem: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            unit: true,
            quantityOnHand: true,
            isBulk: true,
            active: true,
          },
        },
      },
    })
  }

  return {
    ok: true,
    allocation,
    movement: movement.movement,
    item: movement.item,
    toppedUp: Boolean(openAfterClose),
    markedOldConsumed: Boolean(existing && input.markOldConsumed === true),
    closedAllocationId,
  }
}
