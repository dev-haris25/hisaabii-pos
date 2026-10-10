import { RECIPES_BY_MENU_EN } from './recipes.mjs'
import { log } from './db.mjs'

/**
 * @param {import('../../src/generated/prisma/client.ts').Prisma.TransactionClient} db
 * @param {{ businessProfileId: string, stockByKey: Map<string, string> }} opts
 */
export async function ensureRecipes(db, { businessProfileId, stockByKey }) {
  const menuItems = await db.menuItem.findMany({
    where: { businessProfileId, active: true },
    select: { id: true, nameEn: true },
  })

  let created = 0
  let updated = 0

  for (const menuItem of menuItems) {
    const key = menuItem.nameEn?.trim() || ''
    const recipeDef = RECIPES_BY_MENU_EN[key]
    if (!recipeDef) continue

    const ingredientsData = recipeDef.ingredients.map((ing, index) => {
      const stockItemId = stockByKey.get(ing.stockKey)
      if (!stockItemId) {
        throw new Error(`Missing stock key "${ing.stockKey}" for recipe ${key}`)
      }
      return {
        stockItemId,
        quantity: ing.quantity,
        unit: ing.unit,
        sortOrder: index,
      }
    })

    const existing = await db.menuItemRecipe.findUnique({
      where: { menuItemId: menuItem.id },
      select: { id: true },
    })

    if (existing) {
      await db.menuItemRecipeIngredient.deleteMany({
        where: { recipeId: existing.id },
      })
      await db.menuItemRecipe.update({
        where: { id: existing.id },
        data: {
          steps: recipeDef.steps,
          stepsAr: recipeDef.stepsAr ?? null,
          ingredients: { create: ingredientsData },
        },
      })
      updated += 1
    } else {
      await db.menuItemRecipe.create({
        data: {
          menuItemId: menuItem.id,
          steps: recipeDef.steps,
          stepsAr: recipeDef.stepsAr ?? null,
          ingredients: { create: ingredientsData },
        },
      })
      created += 1
    }
  }

  log(`Recipes: created=${created} updated=${updated}`)
  return { created, updated }
}
