/**
 * Public-safe menu item include (no recipe / stock costs).
 */
export const publicMenuItemInclude = {
  category: {
    select: { id: true, nameAr: true, nameEn: true, sortOrder: true },
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
}

/**
 * @param {string} slug
 * @param {{ id: string, imageUrl: string | null, updatedAt: Date }} row
 */
export function publicMenuItemImageUrl(slug, row) {
  if (!row.imageUrl) return null
  return `/api/public/menu/${encodeURIComponent(slug)}/items/${row.id}/image?t=${encodeURIComponent(row.updatedAt.toISOString())}`
}

/**
 * @param {string} slug
 * @param {string | Date} [updatedAt]
 */
export function publicBusinessLogoUrl(slug, updatedAt) {
  const t =
    updatedAt instanceof Date
      ? updatedAt.toISOString()
      : String(updatedAt ?? '')
  const q = t ? `?t=${encodeURIComponent(t)}` : ''
  return `/api/public/business/${encodeURIComponent(slug)}/logo${q}`
}

/**
 * @param {{
 *   id: string
 *   nameAr: string
 *   nameEn: string | null
 *   sortOrder: number
 * }} row
 */
export function mapPublicMenuCategoryToJson(row) {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    sortOrder: row.sortOrder,
  }
}

/**
 * @param {{
 *   id: string
 *   nameAr: string
 *   nameEn: string | null
 *   price: string
 *   vatPreset: string
 *   sortOrder: number
 *   imageUrl: string | null
 *   calories: number | null
 *   categoryId: string | null
 *   updatedAt: Date
 *   category?: { id: string, nameAr: string, nameEn: string | null, sortOrder?: number } | null
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
 *       calories: number | null
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
 * @param {string} slug
 */
export function mapPublicMenuItemToJson(row, slug) {
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
    sortOrder: row.sortOrder,
    calories:
      typeof row.calories === 'number' && Number.isFinite(row.calories)
        ? row.calories
        : null,
    hasImage,
    imageUrl: hasImage ? publicMenuItemImageUrl(slug, row) : null,
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
    customizations: customizations.map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      priceChange: c.priceChange,
      sortOrder: c.sortOrder,
    })),
  }
}
