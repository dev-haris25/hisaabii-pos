import { parseMoney, toMoneyStr } from '@/lib/reports/money'
import {
  canConvertUnits,
  convertStockQty,
  formatQtyString,
  parseQty,
} from '@/lib/stock/units'

/**
 * Simple average of purchase unit costs recorded on movements.
 * Falls back to StockItem.unitCost only when no purchase costs exist yet
 * (legacy rows before unitCost was stored on movements).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} stockItemId
 * @returns {Promise<number | null>}
 */
export async function averagePurchaseUnitCost(db, stockItemId) {
  const purchases = await db.stockMovement.findMany({
    where: {
      stockItemId,
      type: 'purchase',
      unitCost: { not: null },
    },
    select: { unitCost: true },
  })

  const costs = []
  for (const row of purchases) {
    const n = parseMoney(row.unitCost)
    if (Number.isFinite(n) && n >= 0) costs.push(n)
  }

  if (costs.length > 0) {
    return costs.reduce((sum, n) => sum + n, 0) / costs.length
  }

  const item = await db.stockItem.findUnique({
    where: { id: stockItemId },
    select: { unitCost: true },
  })
  if (item?.unitCost == null || String(item.unitCost).trim() === '') {
    return null
  }
  const fallback = parseMoney(item.unitCost)
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : null
}

/**
 * Cost to prepare one menu item from its recipe (ingredient qty × avg purchase cost).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {string} menuItemId
 * @returns {Promise<{ prepCost: string | null, incomplete: boolean }>}
 */
export async function computeMenuItemPrepCost(
  db,
  businessProfileId,
  menuItemId,
) {
  const recipe = await db.menuItemRecipe.findFirst({
    where: {
      menuItemId,
      menuItem: { businessProfileId },
    },
    include: {
      ingredients: {
        include: {
          stockItem: {
            select: { id: true, unit: true, active: true },
          },
        },
      },
    },
  })

  if (!recipe?.ingredients?.length) {
    return { prepCost: null, incomplete: false }
  }

  let total = 0
  let incomplete = false

  for (const ing of recipe.ingredients) {
    const stock = ing.stockItem
    if (!stock?.id || stock.active === false) {
      incomplete = true
      continue
    }

    const qtyN = parseQty(ing.quantity) ?? 0
    if (qtyN <= 0) continue

    if (!canConvertUnits(ing.unit, stock.unit)) {
      incomplete = true
      continue
    }

    let qtyInStockUnit = qtyN
    if (ing.unit !== stock.unit) {
      qtyInStockUnit =
        parseQty(
          convertStockQty(formatQtyString(qtyN), ing.unit, stock.unit),
        ) ?? 0
    }
    if (qtyInStockUnit <= 0) continue

    const unitCost = await averagePurchaseUnitCost(db, stock.id)
    if (unitCost == null) {
      incomplete = true
      continue
    }

    total += qtyInStockUnit * unitCost
  }

  if (total <= 0 && incomplete) {
    return { prepCost: null, incomplete: true }
  }
  if (total <= 0) {
    return { prepCost: null, incomplete: false }
  }

  return { prepCost: toMoneyStr(total), incomplete }
}
