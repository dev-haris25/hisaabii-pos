import { MENU } from './menu.mjs'

/**
 * @param {import('../../src/generated/prisma/client.ts').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 */
export async function seedMenu(tx, businessProfileId) {
  for (const cat of MENU) {
    const category = await tx.menuCategory.create({
      data: {
        businessProfileId,
        nameAr: cat.nameAr,
        nameEn: cat.nameEn,
        sortOrder: cat.sortOrder,
        active: true,
      },
    })

    for (const item of cat.items) {
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
        },
      })

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
}
