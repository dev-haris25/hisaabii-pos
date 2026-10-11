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
 * Cost of ingredient rows (qty × avg purchase cost, in each stock item's unit).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {Array<{
 *   quantity: string
 *   unit: import('@/lib/stock/units').StockUnit
 *   stockItem: { id: string, unit: import('@/lib/stock/units').StockUnit, active: boolean } | null
 * }>} ingredients
 * @returns {Promise<{ cost: string | null, incomplete: boolean }>}
 */
async function computeIngredientsCost(db, ingredients) {
  let total = 0
  let incomplete = false

  for (const ing of ingredients) {
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

  if (total <= 0 && incomplete) return { cost: null, incomplete: true }
  if (total <= 0) return { cost: null, incomplete: false }
  return { cost: toMoneyStr(total), incomplete }
}

const costIngredientsInclude = {
  include: {
    stockItem: {
      select: { id: true, unit: true, active: true },
    },
  },
}

/**
 * Cost to prepare one menu item from its default recipe (ingredient qty × avg
 * purchase cost). Option / customization extras are not included — see
 * `computeMenuItemExtraCosts`.
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
    include: { ingredients: costIngredientsInclude },
  })

  if (!recipe?.ingredients?.length) {
    return { prepCost: null, incomplete: false }
  }

  const { cost, incomplete } = await computeIngredientsCost(
    db,
    recipe.ingredients,
  )
  return { prepCost: cost, incomplete }
}

/**
 * Extra cost of each variant option / customization that has extra
 * ingredients (same average purchase cost logic as the prep cost).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {string} menuItemId
 * @returns {Promise<{
 *   options: Record<string, { extraCost: string | null, incomplete: boolean }>
 *   customizations: Record<string, { extraCost: string | null, incomplete: boolean }>
 * }>}
 */
export async function computeMenuItemExtraCosts(
  db,
  businessProfileId,
  menuItemId,
) {
  const options = await db.menuItemVariantOption.findMany({
    where: {
      group: { menuItemId, menuItem: { businessProfileId } },
      ingredients: { some: {} },
    },
    select: { id: true, ingredients: costIngredientsInclude },
  })
  const customizations = await db.menuItemCustomization.findMany({
    where: {
      menuItemId,
      menuItem: { businessProfileId },
      ingredients: { some: {} },
    },
    select: { id: true, ingredients: costIngredientsInclude },
  })

  /** @type {Record<string, { extraCost: string | null, incomplete: boolean }>} */
  const optionCosts = {}
  for (const o of options) {
    const { cost, incomplete } = await computeIngredientsCost(db, o.ingredients)
    optionCosts[o.id] = { extraCost: cost, incomplete }
  }
  /** @type {Record<string, { extraCost: string | null, incomplete: boolean }>} */
  const customizationCosts = {}
  for (const c of customizations) {
    const { cost, incomplete } = await computeIngredientsCost(db, c.ingredients)
    customizationCosts[c.id] = { extraCost: cost, incomplete }
  }
  return { options: optionCosts, customizations: customizationCosts }
}
