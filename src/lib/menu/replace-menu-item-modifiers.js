/**
 * Replace variant groups and customizations for a menu item (same transaction).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} menuItemId
 * @param {Array<{
 *   nameAr: string
 *   nameEn?: string | null
 *   options: Array<{
 *     nameAr: string
 *     nameEn?: string | null
 *     priceChange: string
 *     isDefault?: boolean
 *   }>
 * }> | undefined} variantGroups
 * @param {Array<{
 *   nameAr: string
 *   nameEn?: string | null
 *   priceChange: string
 * }> | undefined} customizations
 */
export async function replaceMenuItemModifiers(
  tx,
  menuItemId,
  variantGroups,
  customizations,
) {
  if (variantGroups === undefined && customizations === undefined) return

  if (variantGroups !== undefined) {
    await tx.menuItemVariantGroup.deleteMany({ where: { menuItemId } })
    for (let gi = 0; gi < variantGroups.length; gi++) {
      const group = variantGroups[gi]
      const options = group.options ?? []
      if (options.length === 0) continue
      const hasDefault = options.some((o) => o.isDefault)
      await tx.menuItemVariantGroup.create({
        data: {
          menuItemId,
          nameAr: group.nameAr,
          nameEn: group.nameEn?.trim() || null,
          sortOrder: gi,
          options: {
            create: options.map((option, oi) => ({
              nameAr: option.nameAr,
              nameEn: option.nameEn?.trim() || null,
              priceChange: option.priceChange,
              isDefault: hasDefault ? Boolean(option.isDefault) : oi === 0,
              sortOrder: oi,
            })),
          },
        },
      })
    }
  }

  if (customizations !== undefined) {
    await tx.menuItemCustomization.deleteMany({ where: { menuItemId } })
    if (customizations.length > 0) {
      await tx.menuItemCustomization.createMany({
        data: customizations.map((row, i) => ({
          menuItemId,
          nameAr: row.nameAr,
          nameEn: row.nameEn?.trim() || null,
          priceChange: row.priceChange,
          sortOrder: i,
        })),
      })
    }
  }
}
