import { canConvertUnits, isStockUnit } from '@/lib/stock/units'

/** @param {string} code */
function recipeError(code) {
  const err = /** @type {Error & { code?: string }} */ (new Error(code))
  err.code = code
  return err
}

/**
 * Ingredient rows (default recipe or option / customization extras) must use
 * an active stock item of this business, in a unit convertible to the stock
 * item's unit, with a quantity above zero.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @param {Array<{ stockItemId: string, quantity: string, unit: string }>} ingredients
 */
export async function assertRecipeIngredients(tx, businessProfileId, ingredients) {
  if (ingredients.length === 0) return
  const stockIds = [...new Set(ingredients.map((i) => i.stockItemId))]
  const stocks = await tx.stockItem.findMany({
    where: {
      businessProfileId,
      id: { in: stockIds },
      active: true,
    },
    select: { id: true, unit: true },
  })
  const byId = new Map(stocks.map((s) => [s.id, s]))
  for (const ing of ingredients) {
    const stock = byId.get(ing.stockItemId)
    if (!stock) throw recipeError('INVALID_STOCK_ITEM')
    if (!isStockUnit(ing.unit) || !canConvertUnits(ing.unit, stock.unit)) {
      throw recipeError('INCOMPATIBLE_UNIT')
    }
    if (!(Number(ing.quantity) > 0)) throw recipeError('VALIDATION_ERROR')
  }
}

/**
 * Replace optional recipe (steps + ingredients) for a menu item.
 * Pass `recipe: null` to clear. `undefined` = leave unchanged.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @param {string} menuItemId
 * @param {{
 *   steps?: string | null
 *   stepsAr?: string | null
 *   ingredients: Array<{
 *     stockItemId: string
 *     quantity: string
 *     unit: import('@/lib/stock/units').StockUnit
 *   }>
 * } | null | undefined} recipe
 */
export async function replaceMenuItemRecipe(
  tx,
  businessProfileId,
  menuItemId,
  recipe,
) {
  if (recipe === undefined) return

  await tx.menuItemRecipe.deleteMany({ where: { menuItemId } })

  if (recipe == null) return

  const ingredients = recipe.ingredients ?? []
  const hasSteps =
    Boolean(recipe.steps && String(recipe.steps).trim()) ||
    Boolean(recipe.stepsAr && String(recipe.stepsAr).trim())
  if (ingredients.length === 0 && !hasSteps) {
    return
  }

  await assertRecipeIngredients(tx, businessProfileId, ingredients)

  await tx.menuItemRecipe.create({
    data: {
      menuItemId,
      steps: recipe.steps?.trim() || null,
      stepsAr: recipe.stepsAr?.trim() || null,
      ingredients: {
        create: ingredients.map((ing, i) => ({
          stockItemId: ing.stockItemId,
          quantity: ing.quantity,
          unit: ing.unit,
          sortOrder: i,
        })),
      },
    },
  })
}
