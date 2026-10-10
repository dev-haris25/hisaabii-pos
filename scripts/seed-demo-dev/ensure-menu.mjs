import { MENU } from './menu.mjs'
import { log } from './db.mjs'

/**
 * @param {string | null | undefined} s
 */
function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** English category aliases → canonical catalog nameEn */
const CATEGORY_EN_ALIASES = {
  meals: 'Meals',
  meal: 'Meals',
  drinks: 'Drinks',
  drink: 'Drinks',
  sides: 'Sides',
  side: 'Sides',
}

/**
 * @param {import('../../src/generated/prisma/client.ts').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @returns {Promise<{
 *   categoriesExisting: string[]
 *   categoriesCreated: string[]
 *   itemsExisting: string[]
 *   itemsCreated: string[]
 * }>}
 */
export async function ensureMenu(tx, businessProfileId) {
  /** @type {string[]} */
  const categoriesExisting = []
  /** @type {string[]} */
  const categoriesCreated = []
  /** @type {string[]} */
  const itemsExisting = []
  /** @type {string[]} */
  const itemsCreated = []

  const existingCategories = await tx.menuCategory.findMany({
    where: { businessProfileId },
    select: { id: true, nameEn: true, nameAr: true },
  })

  /** @type {Map<string, { id: string, nameEn: string | null, nameAr: string }>} */
  const categoryByKey = new Map()
  for (const c of existingCategories) {
    const en = norm(c.nameEn)
    const ar = norm(c.nameAr)
    if (en) categoryByKey.set(`en:${en}`, c)
    if (ar) categoryByKey.set(`ar:${ar}`, c)
    const canonical = CATEGORY_EN_ALIASES[en]
    if (canonical) categoryByKey.set(`en:${norm(canonical)}`, c)
  }

  const existingItems = await tx.menuItem.findMany({
    where: { businessProfileId },
    select: { id: true, nameEn: true, nameAr: true },
  })
  /** @type {Map<string, { id: string, nameEn: string | null, nameAr: string }>} */
  const itemByKey = new Map()
  for (const item of existingItems) {
    const en = norm(item.nameEn)
    const ar = norm(item.nameAr)
    if (en) itemByKey.set(`en:${en}`, item)
    if (ar) itemByKey.set(`ar:${ar}`, item)
  }

  for (const cat of MENU) {
    const catEn = norm(cat.nameEn)
    const catAr = norm(cat.nameAr)
    let category =
      categoryByKey.get(`en:${catEn}`) ||
      categoryByKey.get(`ar:${catAr}`) ||
      null

    if (!category) {
      category = await tx.menuCategory.create({
        data: {
          businessProfileId,
          nameAr: cat.nameAr,
          nameEn: cat.nameEn,
          sortOrder: cat.sortOrder,
          active: true,
        },
      })
      categoriesCreated.push(cat.nameEn)
      log(`Category created: ${cat.nameEn}`)
      categoryByKey.set(`en:${catEn}`, category)
      categoryByKey.set(`ar:${norm(category.nameAr)}`, category)
    } else {
      categoriesExisting.push(cat.nameEn)
      log(`Category exists: ${cat.nameEn} (reuse id=${category.id})`)
    }

    for (const item of cat.items) {
      const itemEn = norm(item.nameEn)
      const itemAr = norm(item.nameAr)
      const existing =
        itemByKey.get(`en:${itemEn}`) || itemByKey.get(`ar:${itemAr}`) || null

      if (existing) {
        itemsExisting.push(item.nameEn)
        log(`Menu item exists: ${item.nameEn} (unchanged)`)
        continue
      }

      const menuItem = await tx.menuItem.create({
        data: {
          businessProfileId,
          categoryId: category.id,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          price: item.price,
          vatPreset: 'standard',
          active: true,
          sortOrder: item.sortOrder,
          // imageUrl intentionally omitted — add via UI later
        },
      })

      itemsCreated.push(item.nameEn)
      itemByKey.set(`en:${itemEn}`, menuItem)
      itemByKey.set(`ar:${norm(menuItem.nameAr)}`, menuItem)
      log(`Menu item created: ${item.nameEn}`)

      let vgOrder = 0
      for (const group of item.variants ?? []) {
        const vg = await tx.menuItemVariantGroup.create({
          data: {
            menuItemId: menuItem.id,
            nameAr: group.nameAr,
            nameEn: group.nameEn,
            sortOrder: vgOrder++,
          },
        })
        let optOrder = 0
        for (const opt of group.options) {
          await tx.menuItemVariantOption.create({
            data: {
              groupId: vg.id,
              nameAr: opt.nameAr,
              nameEn: opt.nameEn,
              priceChange: opt.priceChange,
              isDefault: opt.isDefault === true,
              sortOrder: optOrder++,
            },
          })
        }
      }

      let custOrder = 0
      for (const cust of item.customizations ?? []) {
        await tx.menuItemCustomization.create({
          data: {
            menuItemId: menuItem.id,
            nameAr: cust.nameAr,
            nameEn: cust.nameEn,
            priceChange: cust.priceChange,
            sortOrder: custOrder++,
          },
        })
      }
    }
  }

  return {
    categoriesExisting,
    categoriesCreated,
    itemsExisting,
    itemsCreated,
  }
}

/** @deprecated use ensureMenu — kept for callers that still import seedMenu */
export async function seedMenu(tx, businessProfileId) {
  return ensureMenu(tx, businessProfileId)
}
