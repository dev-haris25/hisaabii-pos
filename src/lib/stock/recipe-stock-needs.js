import { normalizeModifiersSnapshot } from '@/lib/menu/item-modifiers'
import {
  canConvertUnits,
  convertStockQty,
  formatQtyString,
  normalizeQtyString,
  parseQty,
} from '@/lib/stock/units'

/**
 * @typedef {{
 *   byOptionId: Map<string, { menuItemId: string, ingredients: any[] }>
 *   byCustomizationId: Map<string, { menuItemId: string, ingredients: any[] }>
 * }} ExtraIngredientsByModifier
 */

/** @type {ExtraIngredientsByModifier} */
const NO_EXTRAS = { byOptionId: new Map(), byCustomizationId: new Map() }

/**
 * Ingredient rows one serving of this line uses: the default recipe, plus the
 * extras of every chosen variant option and customization stored on the
 * line's modifiersSnapshot. An option / customization counts only when it
 * belongs to the line's menu item; one that is missing (older line without
 * ids, or deleted since) adds nothing.
 *
 * @param {{ menuItemId?: string | null, modifiersSnapshot?: unknown }} line
 * @param {Map<string, { ingredients: any[] }>} recipesByMenuItemId
 * @param {ExtraIngredientsByModifier} extras
 */
function lineIngredients(line, recipesByMenuItemId, extras) {
  const menuItemId = String(line.menuItemId)
  const rows = [...(recipesByMenuItemId.get(menuItemId)?.ingredients ?? [])]
  const snap = normalizeModifiersSnapshot(line.modifiersSnapshot)
  const optionIds = new Set(
    snap.variantOptions.map((o) => o.optionId).filter(Boolean),
  )
  for (const id of optionIds) {
    const extra = extras.byOptionId.get(id)
    if (extra && extra.menuItemId === menuItemId) rows.push(...extra.ingredients)
  }
  const customizationIds = new Set(
    snap.customizations.map((c) => c.customizationId).filter(Boolean),
  )
  for (const id of customizationIds) {
    const extra = extras.byCustomizationId.get(id)
    if (extra && extra.menuItemId === menuItemId) rows.push(...extra.ingredients)
  }
  return rows
}

/**
 * Aggregate stock needs from sold/kitchen lines. Per line: (default recipe +
 * extras of each chosen option and customization) × quantity, summed per
 * stock item in its own unit.
 *
 * @param {Array<{ menuItemId?: string | null, quantity?: number, modifiersSnapshot?: unknown }>} lines
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
 * @param {ExtraIngredientsByModifier} [extras] From `loadExtraIngredients`.
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
export function aggregateRecipeStockNeeds(
  lines,
  recipesByMenuItemId,
  extras = NO_EXTRAS,
) {
  /** @type {Map<string, { stockItem: any, requiredInItemUnit: number }>} */
  const byStock = new Map()

  for (const line of lines) {
    const menuItemId = line?.menuItemId
    if (!menuItemId) continue
    const qty = Number.parseInt(String(line.quantity ?? 0), 10) || 0
    if (qty <= 0) continue
    const ingredients = lineIngredients(line, recipesByMenuItemId, extras)
    if (ingredients.length === 0) continue

    for (const ing of ingredients) {
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

const recipeStockItemSelect = {
  id: true,
  nameAr: true,
  nameEn: true,
  unit: true,
  quantityOnHand: true,
  active: true,
  unitCost: true,
}

/**
 * Load the extra ingredients of every variant option and customization named
 * on the lines' modifiersSnapshot, for this business only.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {Array<{ modifiersSnapshot?: unknown }>} lines
 * @returns {Promise<ExtraIngredientsByModifier>}
 */
export async function loadExtraIngredients(db, businessProfileId, lines) {
  /** @type {Set<string>} */
  const optionIds = new Set()
  /** @type {Set<string>} */
  const customizationIds = new Set()
  for (const line of lines) {
    if (!line || typeof line !== 'object') continue
    const snap = normalizeModifiersSnapshot(line.modifiersSnapshot)
    for (const o of snap.variantOptions) if (o.optionId) optionIds.add(o.optionId)
    for (const c of snap.customizations) {
      if (c.customizationId) customizationIds.add(c.customizationId)
    }
  }

  /** @type {ExtraIngredientsByModifier} */
  const out = { byOptionId: new Map(), byCustomizationId: new Map() }
  const ingredientsInclude = {
    orderBy: { sortOrder: 'asc' },
    include: { stockItem: { select: recipeStockItemSelect } },
  }

  if (optionIds.size > 0) {
    const options = await db.menuItemVariantOption.findMany({
      where: {
        id: { in: [...optionIds] },
        group: { menuItem: { businessProfileId } },
      },
      select: {
        id: true,
        group: { select: { menuItemId: true } },
        ingredients: ingredientsInclude,
      },
    })
    for (const o of options) {
      if (o.ingredients.length === 0) continue
      out.byOptionId.set(o.id, {
        menuItemId: o.group.menuItemId,
        ingredients: o.ingredients,
      })
    }
  }

  if (customizationIds.size > 0) {
    const customs = await db.menuItemCustomization.findMany({
      where: {
        id: { in: [...customizationIds] },
        menuItem: { businessProfileId },
      },
      select: {
        id: true,
        menuItemId: true,
        ingredients: ingredientsInclude,
      },
    })
    for (const c of customs) {
      if (c.ingredients.length === 0) continue
      out.byCustomizationId.set(c.id, {
        menuItemId: c.menuItemId,
        ingredients: c.ingredients,
      })
    }
  }

  return out
}

/**
 * Recipes + option / customization extras for these lines — everything
 * `aggregateRecipeStockNeeds` needs.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {Array<{ menuItemId?: string | null, modifiersSnapshot?: unknown }>} lines
 */
export async function loadStockNeedSources(db, businessProfileId, lines) {
  const menuItemIds = lines
    .map((l) => (l && typeof l === 'object' ? l.menuItemId : null))
    .filter(Boolean)
  // Sequential: `db` may be an interactive transaction (one connection).
  const recipesByMenuItemId = await loadRecipesByMenuItemIds(
    db,
    businessProfileId,
    menuItemIds,
  )
  const extras = await loadExtraIngredients(db, businessProfileId, lines)
  return { recipesByMenuItemId, extras }
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
          stockItem: { select: recipeStockItemSelect },
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
