import { STOCK_ITEMS } from './stock.mjs'
import { log } from './db.mjs'

export const SEED_STOCK_NOTE = 'SEED_DEMO_STOCK_V1'

/**
 * @param {import('../../src/generated/prisma/client.ts').Prisma.TransactionClient} db
 * @param {{ businessProfileId: string, createdByUserId: string }} opts
 * @returns {Promise<Map<string, string>>}
 */
export async function ensureStockItems(db, { businessProfileId, createdByUserId }) {
  /** @type {Map<string, string>} */
  const byKey = new Map()

  for (const def of STOCK_ITEMS) {
    let item = await db.stockItem.findFirst({
      where: {
        businessProfileId,
        nameAr: { equals: def.nameAr, mode: 'insensitive' },
      },
    })

    if (!item) {
      item = await db.stockItem.create({
        data: {
          businessProfileId,
          nameAr: def.nameAr,
          nameEn: def.nameEn,
          unit: def.unit,
          quantityOnHand: '0',
          lowStockThreshold: def.lowStockThreshold,
          unitCost: def.unitCost,
          isBulk: def.isBulk === true,
          active: true,
          notes: def.notes ?? SEED_STOCK_NOTE,
        },
      })

      const qty = def.quantityOnHand
      await db.stockMovement.create({
        data: {
          businessProfileId,
          stockItemId: item.id,
          type: 'opening',
          quantity: qty,
          unit: def.unit,
          quantityBefore: '0',
          quantityAfter: qty,
          reason: 'Opening balance',
          note: SEED_STOCK_NOTE,
          createdByUserId,
        },
      })

      item = await db.stockItem.update({
        where: { id: item.id },
        data: { quantityOnHand: qty },
      })
      log(`Stock created: ${def.nameEn} onHand=${qty} ${def.unit}`)
    } else {
      item = await db.stockItem.update({
        where: { id: item.id },
        data: {
          nameEn: def.nameEn,
          unit: def.unit,
          quantityOnHand: def.quantityOnHand,
          lowStockThreshold: def.lowStockThreshold,
          unitCost: def.unitCost,
          isBulk: def.isBulk === true,
          active: true,
          notes: def.notes ?? SEED_STOCK_NOTE,
        },
      })
      log(`Stock updated: ${def.nameEn} onHand=${def.quantityOnHand} ${def.unit}`)
    }

    byKey.set(def.key, item.id)
  }

  return byKey
}
