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
 *   sortOrder: number
 *   imageUrl: string | null
 *   categoryId: string | null
 *   createdAt: Date
 *   updatedAt: Date
 *   category?: { id: string, nameAr: string, nameEn: string | null } | null
 * }} row
 */
export function mapMenuItemToJson(row) {
  const hasImage = Boolean(row.imageUrl)
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    price: row.price,
    vatPreset: row.vatPreset,
    active: row.active,
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const menuItemInclude = {
  category: {
    select: { id: true, nameAr: true, nameEn: true },
  },
}

export const menuCategoryCountInclude = {
  _count: { select: { items: true } },
}
