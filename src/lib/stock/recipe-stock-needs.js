import {
  canConvertUnits,
  convertStockQty,
  formatQtyString,
  normalizeQtyString,
  parseQty,
} from '@/lib/stock/units'

/**
 * Aggregate stock needs from sold/kitchen lines × recipes.
 *
 * @param {Array<{ menuItemId?: string | null, quantity?: number }>} lines
 * @param {Map<string, {
 *   ingredients: Array<{
 *     stockItemId: string
 *     quantity: string
 *     unit: import('@/lib/stock/units').StockUnit
 *     stockItem: {
 *       id: string
 *       nameAr: string
 *       nameEn: string | null
 *       unit: import('@/lib/stock/units').StockUnit
 *       quantityOnHand: string
 *       active: boolean
 *     }
 *   }>
 * }>} recipesByMenuItemId
 * @returns {{
 *   needs: Array<{
 *     stockItemId: string
 *     nameAr: string
 *     nameEn: string | null
 *     unit: import('@/lib/stock/units').StockUnit
 *     required: string
 *     onHand: string
 *     shortfall: string | null
 *   }>
 *   shortfalls: Array<{
 *     stockItemId: string
 *     nameAr: string
 *     nameEn: string | null
 *     unit: import('@/lib/stock/units').StockUnit
 *     required: string
 *     onHand: string
 *     shortfall: string
 *   }>
 * }}
 */
export function aggregateRecipeStockNeeds(lines, recipesByMenuItemId) {
  /** @type {Map<string, { stockItem: any, requiredInItemUnit: number }>} */
  const byStock = new Map()

  for (const line of lines) {
    const menuItemId = line?.menuItemId
    if (!menuItemId) continue
    const qty = Number.parseInt(String(line.quantity ?? 0), 10) || 0
    if (qty <= 0) continue
    const recipe = recipesByMenuItemId.get(menuItemId)
    if (!recipe?.ingredients?.length) continue

    for (const ing of recipe.ingredients) {
      const stock = ing.stockItem
      if (!stock?.id) continue
      // Soft-deleted stock items are unlinked on delete; skip as a safety net.
      if (stock.active === false) continue
      if (!canConvertUnits(ing.unit, stock.unit)) continue

      const perServing = parseQty(ing.quantity) ?? 0
      if (perServing <= 0) continue

      let inStockUnit = perServing * qty
      if (ing.unit !== stock.unit) {
        inStockUnit = parseQty(
          convertStockQty(formatQtyString(perServing * qty), ing.unit, stock.unit),
        ) ?? 0
      }

      const prev = byStock.get(stock.id)
      if (prev) {
        prev.requiredInItemUnit += inStockUnit
      } else {
        byStock.set(stock.id, {
          stockItem: stock,
          requiredInItemUnit: inStockUnit,
        })
      }
    }
  }

  const needs = []
  const shortfalls = []
  for (const { stockItem, requiredInItemUnit } of byStock.values()) {
    const required = formatQtyString(requiredInItemUnit)
    const onHand = normalizeQtyString(stockItem.quantityOnHand ?? '0')
    const onHandN = parseQty(onHand) ?? 0
    const short = requiredInItemUnit - onHandN
    const row = {
      stockItemId: stockItem.id,
      nameAr: stockItem.nameAr,
      nameEn: stockItem.nameEn,
      unit: stockItem.unit,
      required,
      onHand,
      shortfall: short > 0 ? formatQtyString(short) : null,
    }
    needs.push(row)
    if (short > 0) {
      shortfalls.push({
        ...row,
        shortfall: formatQtyString(short),
      })
    }
  }

  return { needs, shortfalls }
}

/**
 * Break recipe stock use down by menu item (for kitchen-stock usage logging).
 *
 * @param {Array<{
 *   menuItemId?: string | null
 *   quantity?: number
 *   nameAr?: string
 *   nameEn?: string | null
 * }>} lines
 * @param {Map<string, { ingredients: Array<any> }>} recipesByMenuItemId
 * @returns {Array<{
 *   stockItemId: string
 *   menuItemId: string
 *   menuItemNameAr: string
 *   menuItemNameEn: string | null
 *   servings: number
 *   quantityUsed: string
 * }>}
 */
export function expandRecipeUsageByMenuItem(lines, recipesByMenuItemId) {
  /** @type {Map<string, {
   *   stockItemId: string
   *   menuItemId: string
   *   menuItemNameAr: string
   *   menuItemNameEn: string | null
   *   servings: number
   *   quantityUsedN: number
   * }>} */
  const byKey = new Map()

  for (const line of lines) {
    const menuItemId = line?.menuItemId
    if (!menuItemId) continue
    const servings = Number.parseInt(String(line.quantity ?? 0), 10) || 0
    if (servings <= 0) continue
    const recipe = recipesByMenuItemId.get(menuItemId)
    if (!recipe?.ingredients?.length) continue

    const nameAr = String(line.nameAr ?? '').trim() || '—'
    const nameEn =
      line.nameEn != null && String(line.nameEn).trim()
        ? String(line.nameEn).trim()
        : null

    for (const ing of recipe.ingredients) {
      const stock = ing.stockItem
      if (!stock?.id || stock.active === false) continue
      if (!canConvertUnits(ing.unit, stock.unit)) continue

      const perServing = parseQty(ing.quantity) ?? 0
      if (perServing <= 0) continue

      let inStockUnit = perServing * servings
      if (ing.unit !== stock.unit) {
        inStockUnit =
          parseQty(
            convertStockQty(
              formatQtyString(perServing * servings),
              ing.unit,
              stock.unit,
            ),
          ) ?? 0
      }

      const key = `${stock.id}:${menuItemId}`
      const prev = byKey.get(key)
      if (prev) {
        prev.servings += servings
        prev.quantityUsedN += inStockUnit
      } else {
        byKey.set(key, {
          stockItemId: stock.id,
          menuItemId: String(menuItemId),
          menuItemNameAr: nameAr,
          menuItemNameEn: nameEn,
          servings,
          quantityUsedN: inStockUnit,
        })
      }
    }
  }

  return [...byKey.values()].map((r) => ({
    stockItemId: r.stockItemId,
    menuItemId: r.menuItemId,
    menuItemNameAr: r.menuItemNameAr,
    menuItemNameEn: r.menuItemNameEn,
    servings: r.servings,
    quantityUsed: formatQtyString(r.quantityUsedN),
  }))
}

/**
 * Load recipes for menu item ids (with stock items).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {string[]} menuItemIds
 */
export async function loadRecipesByMenuItemIds(db, businessProfileId, menuItemIds) {
  const ids = [...new Set(menuItemIds.filter(Boolean))]
  /** @type {Map<string, { ingredients: any[] }>} */
  const map = new Map()
  if (ids.length === 0) return map

  const recipes = await db.menuItemRecipe.findMany({
    where: {
      menuItemId: { in: ids },
      menuItem: { businessProfileId },
    },
    include: {
      ingredients: {
        orderBy: { sortOrder: 'asc' },
        include: {
          stockItem: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              unit: true,
              quantityOnHand: true,
              active: true,
              unitCost: true,
            },
          },
        },
      },
    },
  })

  for (const recipe of recipes) {
    map.set(recipe.menuItemId, {
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      stepsAr: recipe.stepsAr,
    })
  }
  return map
}
