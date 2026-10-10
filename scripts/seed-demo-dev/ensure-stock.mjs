import { STOCK_ITEMS } from './stock.mjs'
import { log } from './db.mjs'

export const SEED_STOCK_NOTE = 'SEED_DEMO_STOCK_V1'

/**
 * @param {string | null | undefined} s
 */
function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Extra English names that map to the same raw material as the catalog key.
 * Used so UI-entered spellings are reused instead of duplicated.
 * @type {Record<string, string[]>}
 */
const STOCK_EN_ALIASES = {
  chicken: ['chicken', 'fresh chicken'],
  beef: ['beef', 'ground beef'],
  flour: ['flour'],
  oil: ['oil', 'fryer oil', 'cooking oil'],
  potato: ['potato', 'potatoes'],
  bun: ['bun', 'burger bun'],
  cheese: ['cheese', 'cheese slices', 'cheez slices'],
  wrap: ['shawarma wrap', 'sharwarma wrap', 'wrap'],
  garlic_sauce: ['garlic sauce', 'garlic'],
  ranch: ['ranch sauce', 'ranch sauce (stock)', 'ranch'],
  water_bottle: ['bottled water', 'water bottle', 'water'],
  soda_can: ['soft drink cans', 'soda can', 'soda', 'soft drink'],
  orange: ['oranges', 'orange'],
}

/**
 * Extra Arabic names for the same raw material (UI vs seed catalog).
 * @type {Record<string, string[]>}
 */
const STOCK_AR_ALIASES = {
  chicken: ['دجاج', 'دجاج طازج'],
  oil: ['زيت', 'زيت قلي'],
  bun: ['رغيف', 'خبز برجر'],
  cheese: ['شرائح الجبن', 'جبنة شرائح'],
  wrap: ['لفائف شاورما', 'خبز شاورما'],
  garlic_sauce: ['صلصة الثوم', 'صلصة ثوم'],
  orange: ['برتقال'],
  potato: ['بطاطس'],
  flour: ['دقيق'],
}

/**
 * @param {import('../../src/generated/prisma/client.ts').Prisma.TransactionClient} db
 * @param {{ businessProfileId: string, createdByUserId: string }} opts
 * @returns {Promise<{
 *   byKey: Map<string, string>
 *   reused: string[]
 *   created: string[]
 * }>}
 */
export async function ensureStockItems(db, { businessProfileId, createdByUserId }) {
  /** @type {Map<string, string>} */
  const byKey = new Map()
  /** @type {string[]} */
  const reused = []
  /** @type {string[]} */
  const created = []

  const existing = await db.stockItem.findMany({
    where: { businessProfileId },
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      unit: true,
      quantityOnHand: true,
    },
  })

  /** @type {Map<string, (typeof existing)[number]>} */
  const byEn = new Map()
  /** @type {Map<string, (typeof existing)[number]>} */
  const byAr = new Map()
  for (const row of existing) {
    const en = norm(row.nameEn)
    const ar = norm(row.nameAr)
    if (en && !byEn.has(en)) byEn.set(en, row)
    if (ar && !byAr.has(ar)) byAr.set(ar, row)
  }

  /**
   * @param {typeof STOCK_ITEMS[number]} def
   */
  function findExisting(def) {
    const enAliases = [
      ...(STOCK_EN_ALIASES[def.key] ?? []),
      def.nameEn,
    ].map(norm)
    for (const alias of enAliases) {
      if (alias && byEn.has(alias)) return byEn.get(alias) ?? null
    }

    const arAliases = [
      ...(STOCK_AR_ALIASES[def.key] ?? []),
      def.nameAr,
    ].map(norm)
    for (const alias of arAliases) {
      if (alias && byAr.has(alias)) return byAr.get(alias) ?? null
    }

    return null
  }

  for (const def of STOCK_ITEMS) {
    let item = findExisting(def)

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
      created.push(def.nameEn)
      log(`Stock created: ${def.nameEn} onHand=${qty} ${def.unit}`)

      const en = norm(item.nameEn)
      const ar = norm(item.nameAr)
      if (en) byEn.set(en, item)
      if (ar) byAr.set(ar, item)
    } else {
      // Reuse as-is — do not overwrite manually entered names/qty/unit.
      reused.push(`${def.key}→${item.nameEn ?? item.nameAr}`)
      log(
        `Stock reused: key=${def.key} as "${item.nameEn ?? item.nameAr}" onHand=${item.quantityOnHand} ${item.unit}`,
      )
    }

    byKey.set(def.key, item.id)
  }

  return { byKey, reused, created }
}
