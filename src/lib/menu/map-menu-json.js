import { prisma } from '@/lib/prisma'

/**
 * @param {{
 *   id: string
 *   nameAr: string
 *   nameEn: string | null
 *   sortOrder: number
 *   active: boolean
 *   createdAt: Date
 *   updatedAt: Date
 *   _count?: { items?: number }
 * }} row
 * @param {{ activeItemCount?: number }} [extra]
 */
export function mapMenuCategoryToJson(row, extra = {}) {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    sortOrder: row.sortOrder,
    active: row.active,
    itemCount: row._count?.items ?? undefined,
    activeItemCount:
      typeof extra.activeItemCount === 'number'
        ? extra.activeItemCount
        : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Attach `activeItemCount` for a list of category rows (one groupBy query).
 *
 * @param {Array<Parameters<typeof mapMenuCategoryToJson>[0]>} rows
 */
export async function mapMenuCategoriesWithActiveCounts(rows) {
  const ids = rows.map((r) => r.id).filter(Boolean)
  /** @type {Record<string, number>} */
  const activeMap = {}
  if (ids.length > 0) {
    const groups = await prisma.menuItem.groupBy({
      by: ['categoryId'],
      where: { categoryId: { in: ids }, active: true },
      _count: { _all: true },
    })
    for (const g of groups) {
      if (g.categoryId) activeMap[g.categoryId] = g._count._all
    }
  }
  return rows.map((r) =>
    mapMenuCategoryToJson(r, { activeItemCount: activeMap[r.id] ?? 0 }),
  )
}

/**
 * @param {{
 *   id: string
 *   nameAr: string
 *   nameEn: string | null
 *   price: string
 *   vatPreset: string
 *   active: boolean
 *   loyaltyRedeemable?: boolean
 *   sortOrder: number
 *   imageUrl: string | null
 *   categoryId: string | null
 *   createdAt: Date
 *   updatedAt: Date
 *   category?: { id: string, nameAr: string, nameEn: string | null } | null
 *   variantGroups?: Array<{
 *     id: string
 *     nameAr: string
 *     nameEn: string | null
 *     sortOrder: number
 *     options?: Array<{
 *       id: string
 *       nameAr: string
 *       nameEn: string | null
 *       priceChange: string
 *       isDefault: boolean
 *       sortOrder: number
 *     }>
 *   }>
 *   customizations?: Array<{
 *     id: string
 *     nameAr: string
 *     nameEn: string | null
 *     priceChange: string
 *     sortOrder: number
 *   }>
 * }} row
 */
export function mapMenuItemToJson(row) {
  const hasImage = Boolean(row.imageUrl)
  const groups = [...(row.variantGroups ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
  const customizations = [...(row.customizations ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    price: row.price,
    vatPreset: row.vatPreset,
    active: row.active,
    loyaltyRedeemable: row.loyaltyRedeemable === true,
    calories:
      typeof row.calories === 'number' && Number.isFinite(row.calories)
        ? row.calories
        : null,
    sortOrder: row.sortOrder,
    hasImage,
    // Authenticated serve URL (DB `imageUrl` holds relative UPLOADS_DIR key).
    imageUrl: hasImage
      ? `/api/auth/menu/items/${row.id}/image?t=${encodeURIComponent(row.updatedAt.toISOString())}`
      : null,
    categoryId: row.categoryId,
    category: row.category
      ? {
          id: row.category.id,
          nameAr: row.category.nameAr,
          nameEn: row.category.nameEn,
        }
      : null,
    variantGroups: groups.map((group) => ({
      id: group.id,
      nameAr: group.nameAr,
      nameEn: group.nameEn,
      sortOrder: group.sortOrder,
      options: [...(group.options ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((option) => ({
          id: option.id,
          nameAr: option.nameAr,
          nameEn: option.nameEn,
          priceChange: option.priceChange,
          calories:
            typeof option.calories === 'number' &&
            Number.isFinite(option.calories)
              ? option.calories
              : null,
          isDefault: option.isDefault,
          sortOrder: option.sortOrder,
        })),
    })),
    customizations: customizations.map((rowC) => ({
      id: rowC.id,
      nameAr: rowC.nameAr,
      nameEn: rowC.nameEn,
      priceChange: rowC.priceChange,
      sortOrder: rowC.sortOrder,
    })),
    recipe: mapRecipeToJson(row.recipe),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * @param {{
 *   steps: string | null
 *   stepsAr?: string | null
 *   ingredients?: Array<{
 *     id: string
 *     stockItemId: string
 *     quantity: string
 *     unit: string
 *     sortOrder: number
 *     stockItem?: {
 *       id: string
 *       nameAr: string
 *       nameEn: string | null
 *       unit: string
 *       unitCost: string | null
 *       quantityOnHand?: string
 *       active?: boolean
 *     } | null
 *   }>
 * } | null | undefined} recipe
 */
function mapRecipeToJson(recipe) {
  if (!recipe) return null
  const ingredients = [...(recipe.ingredients ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
  return {
    steps: recipe.steps,
    stepsAr: recipe.stepsAr ?? null,
    ingredients: ingredients.map((ing) => ({
      id: ing.id,
      stockItemId: ing.stockItemId,
      quantity: ing.quantity,
      unit: ing.unit,
      sortOrder: ing.sortOrder,
      stockItem: ing.stockItem
        ? {
            id: ing.stockItem.id,
            nameAr: ing.stockItem.nameAr,
            nameEn: ing.stockItem.nameEn,
            unit: ing.stockItem.unit,
            unitCost: ing.stockItem.unitCost,
            quantityOnHand: ing.stockItem.quantityOnHand,
            active: ing.stockItem.active,
          }
        : null,
    })),
  }
}

export const menuItemInclude = {
  category: {
    select: { id: true, nameAr: true, nameEn: true },
  },
  variantGroups: {
    orderBy: { sortOrder: 'asc' },
    include: {
      options: { orderBy: { sortOrder: 'asc' } },
    },
  },
  customizations: {
    orderBy: { sortOrder: 'asc' },
  },
  recipe: {
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
              unitCost: true,
              quantityOnHand: true,
              active: true,
            },
          },
        },
      },
    },
  },
}

export const menuCategoryCountInclude = {
  _count: { select: { items: true } },
}
