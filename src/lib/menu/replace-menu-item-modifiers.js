/**
 * Reconcile variant groups/options and replace customizations for a menu item.
 * Variants are matched by id and updated in place (avoids delete+recreate that
 * breaks CouponItemRuleVariantOption Restrict FKs). Options removed from the
 * payload are deleted only when not referenced by a coupon rule.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} menuItemId
 * @param {Array<{
 *   id?: string
 *   nameAr: string
 *   nameEn?: string | null
 *   options: Array<{
 *     id?: string
 *     nameAr: string
 *     nameEn?: string | null
 *     priceChange: string
 *     calories?: number | null
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
    await reconcileVariantGroups(tx, menuItemId, variantGroups)
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

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} menuItemId
 * @param {NonNullable<Parameters<typeof replaceMenuItemModifiers>[2]>} variantGroups
 */
async function reconcileVariantGroups(tx, menuItemId, variantGroups) {
  const existingGroups = await tx.menuItemVariantGroup.findMany({
    where: { menuItemId },
    include: { options: { select: { id: true } } },
  })
  /** @type {Map<string, (typeof existingGroups)[number]>} */
  const existingGroupById = new Map(existingGroups.map((g) => [g.id, g]))
  /** @type {Set<string>} */
  const existingOptionIds = new Set()
  for (const g of existingGroups) {
    for (const o of g.options) existingOptionIds.add(o.id)
  }

  /** @type {Set<string>} */
  const keepGroupIds = new Set()
  /** @type {Set<string>} */
  const keepOptionIds = new Set()

  for (const group of variantGroups) {
    const gid = typeof group.id === 'string' ? group.id.trim() : ''
    if (gid && existingGroupById.has(gid)) keepGroupIds.add(gid)
    for (const option of group.options ?? []) {
      const oid = typeof option.id === 'string' ? option.id.trim() : ''
      if (oid && existingOptionIds.has(oid)) keepOptionIds.add(oid)
    }
  }

  /** @type {string[]} */
  const removeOptionIds = []
  for (const oid of existingOptionIds) {
    if (!keepOptionIds.has(oid)) removeOptionIds.push(oid)
  }

  if (removeOptionIds.length > 0) {
    const linked = await tx.couponItemRuleVariantOption.findFirst({
      where: { variantOptionId: { in: removeOptionIds } },
      select: { variantOptionId: true },
    })
    if (linked) {
      throw Object.assign(
        new Error(
          'This variant option is used by a coupon and cannot be removed right now',
        ),
        { code: 'VARIANT_OPTION_IN_USE' },
      )
    }
    await tx.menuItemVariantOption.deleteMany({
      where: { id: { in: removeOptionIds } },
    })
  }

  const removeGroupIds = existingGroups
    .map((g) => g.id)
    .filter((id) => !keepGroupIds.has(id))
  if (removeGroupIds.length > 0) {
    await tx.menuItemVariantGroup.deleteMany({
      where: { id: { in: removeGroupIds } },
    })
  }

  for (let gi = 0; gi < variantGroups.length; gi++) {
    const group = variantGroups[gi]
    const options = group.options ?? []
    if (options.length === 0) continue
    const hasDefault = options.some((o) => o.isDefault)
    const gid = typeof group.id === 'string' ? group.id.trim() : ''
    const existingGroup = gid ? existingGroupById.get(gid) : undefined

    if (existingGroup) {
      await tx.menuItemVariantGroup.update({
        where: { id: existingGroup.id },
        data: {
          nameAr: group.nameAr,
          nameEn: group.nameEn?.trim() || null,
          sortOrder: gi,
        },
      })

      for (let oi = 0; oi < options.length; oi++) {
        const option = options[oi]
        const oid = typeof option.id === 'string' ? option.id.trim() : ''
        const optionData = {
          nameAr: option.nameAr,
          nameEn: option.nameEn?.trim() || null,
          priceChange: option.priceChange,
          calories:
            typeof option.calories === 'number' &&
            Number.isFinite(option.calories)
              ? Math.round(option.calories)
              : null,
          isDefault: hasDefault ? Boolean(option.isDefault) : oi === 0,
          sortOrder: oi,
        }
        if (oid && existingOptionIds.has(oid) && keepOptionIds.has(oid)) {
          await tx.menuItemVariantOption.update({
            where: { id: oid },
            data: optionData,
          })
        } else {
          await tx.menuItemVariantOption.create({
            data: {
              groupId: existingGroup.id,
              ...optionData,
            },
          })
        }
      }
    } else {
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
              calories:
                typeof option.calories === 'number' &&
                Number.isFinite(option.calories)
                  ? Math.round(option.calories)
                  : null,
              isDefault: hasDefault ? Boolean(option.isDefault) : oi === 0,
              sortOrder: oi,
            })),
          },
        },
      })
    }
  }
}
