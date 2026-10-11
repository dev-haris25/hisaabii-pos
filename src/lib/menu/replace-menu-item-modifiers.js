import { assertRecipeIngredients } from '@/lib/menu/replace-menu-item-recipe'

/**
 * @typedef {Array<{
 *   stockItemId: string
 *   quantity: string
 *   unit: import('@/lib/stock/units').StockUnit
 * }> | undefined} ExtraIngredients
 */

/**
 * Reconcile variant groups/options and customizations for a menu item.
 * Both are matched by id and updated in place (avoids delete+recreate that
 * breaks CouponItemRuleVariantOption Restrict FKs, and keeps the ids stored on
 * order lines and open E-Waiter rounds valid). Options removed from the
 * payload are deleted only when not referenced by a coupon rule.
 *
 * Each option / customization may carry `ingredients` (extra stock added on
 * top of the default recipe): an array replaces its list, omitted leaves it.
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
 *     ingredients?: ExtraIngredients
 *   }>
 * }> | undefined} variantGroups
 * @param {Array<{
 *   id?: string
 *   nameAr: string
 *   nameEn?: string | null
 *   priceChange: string
 *   ingredients?: ExtraIngredients
 * }> | undefined} customizations
 * @param {string} businessProfileId
 */
export async function replaceMenuItemModifiers(
  tx,
  menuItemId,
  variantGroups,
  customizations,
  businessProfileId,
) {
  if (variantGroups === undefined && customizations === undefined) return

  // Validate every extras list before writing anything.
  const extras = [
    ...(variantGroups ?? []).flatMap((g) =>
      (g.options ?? []).flatMap((o) => o.ingredients ?? []),
    ),
    ...(customizations ?? []).flatMap((c) => c.ingredients ?? []),
  ]
  await assertRecipeIngredients(tx, businessProfileId, extras)

  if (variantGroups !== undefined) {
    await reconcileVariantGroups(tx, menuItemId, variantGroups)
  }

  if (customizations !== undefined) {
    await reconcileCustomizations(tx, menuItemId, customizations)
  }
}

/**
 * Replace the extras list of one option / customization (`undefined` = keep).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {'option' | 'customization'} kind
 * @param {string} ownerId
 * @param {ExtraIngredients} ingredients
 */
async function replaceExtraIngredients(tx, kind, ownerId, ingredients) {
  if (!Array.isArray(ingredients)) return
  const rows = ingredients.map((ing, i) => ({
    stockItemId: ing.stockItemId,
    quantity: ing.quantity,
    unit: ing.unit,
    sortOrder: i,
  }))
  if (kind === 'option') {
    await tx.menuItemVariantOptionIngredient.deleteMany({
      where: { optionId: ownerId },
    })
    if (rows.length > 0) {
      await tx.menuItemVariantOptionIngredient.createMany({
        data: rows.map((r) => ({ optionId: ownerId, ...r })),
      })
    }
    return
  }
  await tx.menuItemCustomizationIngredient.deleteMany({
    where: { customizationId: ownerId },
  })
  if (rows.length > 0) {
    await tx.menuItemCustomizationIngredient.createMany({
      data: rows.map((r) => ({ customizationId: ownerId, ...r })),
    })
  }
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} menuItemId
 * @param {NonNullable<Parameters<typeof replaceMenuItemModifiers>[3]>} customizations
 */
async function reconcileCustomizations(tx, menuItemId, customizations) {
  const existing = await tx.menuItemCustomization.findMany({
    where: { menuItemId },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((c) => c.id))
  /** @type {Set<string>} */
  const keepIds = new Set()
  for (const row of customizations) {
    const cid = typeof row.id === 'string' ? row.id.trim() : ''
    if (cid && existingIds.has(cid)) keepIds.add(cid)
  }

  const removeIds = [...existingIds].filter((id) => !keepIds.has(id))
  if (removeIds.length > 0) {
    await tx.menuItemCustomization.deleteMany({
      where: { id: { in: removeIds } },
    })
  }

  /** @type {Set<string>} */
  const updated = new Set()
  for (let i = 0; i < customizations.length; i++) {
    const row = customizations[i]
    const cid = typeof row.id === 'string' ? row.id.trim() : ''
    const data = {
      nameAr: row.nameAr,
      nameEn: row.nameEn?.trim() || null,
      priceChange: row.priceChange,
      sortOrder: i,
    }
    let customizationId
    // An id sent twice is updated once; the later copy becomes a new row.
    if (cid && keepIds.has(cid) && !updated.has(cid)) {
      updated.add(cid)
      await tx.menuItemCustomization.update({ where: { id: cid }, data })
      customizationId = cid
    } else {
      const created = await tx.menuItemCustomization.create({
        data: { menuItemId, ...data },
        select: { id: true },
      })
      customizationId = created.id
    }
    await replaceExtraIngredients(
      tx,
      'customization',
      customizationId,
      row.ingredients,
    )
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

    let groupId
    if (existingGroup) {
      await tx.menuItemVariantGroup.update({
        where: { id: existingGroup.id },
        data: {
          nameAr: group.nameAr,
          nameEn: group.nameEn?.trim() || null,
          sortOrder: gi,
        },
      })
      groupId = existingGroup.id
    } else {
      const created = await tx.menuItemVariantGroup.create({
        data: {
          menuItemId,
          nameAr: group.nameAr,
          nameEn: group.nameEn?.trim() || null,
          sortOrder: gi,
        },
        select: { id: true },
      })
      groupId = created.id
    }

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
      let optionId
      if (
        existingGroup &&
        oid &&
        existingOptionIds.has(oid) &&
        keepOptionIds.has(oid)
      ) {
        await tx.menuItemVariantOption.update({
          where: { id: oid },
          data: optionData,
        })
        optionId = oid
      } else {
        const created = await tx.menuItemVariantOption.create({
          data: { groupId, ...optionData },
          select: { id: true },
        })
        optionId = created.id
      }
      await replaceExtraIngredients(tx, 'option', optionId, option.ingredients)
    }
  }
}
