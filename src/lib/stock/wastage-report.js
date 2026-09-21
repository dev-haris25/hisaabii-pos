import { mapKitchenAllocationToJson } from '@/lib/stock/kitchen-stock'
import { displayedKitchenUsedQty } from '@/lib/stock/kitchen-waste-ai-result'
import { formatQtyString, parseQty } from '@/lib/stock/units'

/**
 * @param {{ openedAt: Date, closedAt: Date | null }} row
 */
function durationDays(row) {
  if (!row.closedAt) return null
  const ms = row.closedAt.getTime() - row.openedAt.getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)))
}

/**
 * @param {Array<{
 *   menuItemId: string | null
 *   menuItemNameAr: string
 *   menuItemNameEn: string | null
 *   servings: number
 *   quantityUsed: string
 * }>} usageLines
 */
export function summarizeUsageLines(usageLines) {
  /** @type {Map<string, {
   *   menuItemId: string | null
   *   menuItemNameAr: string
   *   menuItemNameEn: string | null
   *   servings: number
   *   quantityUsedN: number
   *   ticketCount: number
   * }>} */
  const byMenu = new Map()

  for (const line of usageLines) {
    const key = line.menuItemId ?? `snap:${line.menuItemNameAr}|${line.menuItemNameEn ?? ''}`
    const qty = parseQty(line.quantityUsed) ?? 0
    const prev = byMenu.get(key)
    if (prev) {
      prev.servings += line.servings
      prev.quantityUsedN += qty
      prev.ticketCount += 1
    } else {
      byMenu.set(key, {
        menuItemId: line.menuItemId,
        menuItemNameAr: line.menuItemNameAr,
        menuItemNameEn: line.menuItemNameEn,
        servings: line.servings,
        quantityUsedN: qty,
        ticketCount: 1,
      })
    }
  }

  const recipes = [...byMenu.values()]
    .map((r) => ({
      menuItemId: r.menuItemId,
      menuItemNameAr: r.menuItemNameAr,
      menuItemNameEn: r.menuItemNameEn,
      servings: r.servings,
      quantityUsed: formatQtyString(r.quantityUsedN),
      ticketCount: r.ticketCount,
    }))
    .sort((a, b) => b.servings - a.servings)

  const totalServings = recipes.reduce((s, r) => s + r.servings, 0)
  const totalTickets = usageLines.length

  return {
    recipes,
    recipeCount: recipes.length,
    totalServings,
    totalTickets,
  }
}

/**
 * @param {ReturnType<typeof mapKitchenAllocationToJson>} mapped
 * @param {{ openedAt: Date, closedAt: Date | null }} row
 * @param {ReturnType<typeof summarizeUsageLines>} usage
 */
function withStats(mapped, row, usage) {
  const issued = parseQty(mapped.quantityIssued ?? '0') ?? 0
  const used = parseQty(displayedKitchenUsedQty(mapped)) ?? 0
  const waste = parseQty(mapped.quantityWaste ?? '0') ?? 0
  const days = durationDays(row)
  const useRate =
    issued > 0 ? Math.round((used / issued) * 1000) / 10 : null
  const wasteRate =
    issued > 0 ? Math.round((waste / issued) * 1000) / 10 : null

  return {
    ...mapped,
    hasWaste: waste > 0,
    stats: {
      durationDays: days,
      usePercent: useRate,
      wastePercent: wasteRate,
      recipeCount: usage.recipeCount,
      totalServings: usage.totalServings,
      totalTickets: usage.totalTickets,
    },
    recipes: usage.recipes,
  }
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {{
 *   skip?: number
 *   take?: number
 *   stockItemId?: string | null
 *   from?: Date | null
 *   to?: Date | null
 * }} [opts]
 */
export async function listClosedKitchenAllocations(db, businessProfileId, opts = {}) {
  /** @type {Record<string, unknown>} */
  const where = {
    businessProfileId,
    status: 'closed',
  }
  if (opts.stockItemId) where.stockItemId = opts.stockItemId
  if (opts.from || opts.to) {
    where.closedAt = {}
    if (opts.from) /** @type {Record<string, Date>} */ (where.closedAt).gte = opts.from
    if (opts.to) /** @type {Record<string, Date>} */ (where.closedAt).lte = opts.to
  }

  const [total, rows] = await Promise.all([
    db.kitchenStockAllocation.count({ where }),
    db.kitchenStockAllocation.findMany({
      where,
      orderBy: { closedAt: 'desc' },
      skip: opts.skip ?? 0,
      take: opts.take ?? 10,
      include: {
        stockItem: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            unit: true,
            quantityOnHand: true,
            isBulk: true,
            active: true,
          },
        },
        usageLines: {
          select: {
            menuItemId: true,
            menuItemNameAr: true,
            menuItemNameEn: true,
            servings: true,
            quantityUsed: true,
          },
        },
      },
    }),
  ])

  return {
    total,
    allocations: rows.map((row) => {
      const mapped = mapKitchenAllocationToJson(row)
      const usage = summarizeUsageLines(row.usageLines ?? [])
      return withStats(mapped, row, usage)
    }),
  }
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {string} allocationId
 */
export async function getClosedKitchenAllocation(db, businessProfileId, allocationId) {
  const row = await db.kitchenStockAllocation.findFirst({
    where: {
      id: allocationId,
      businessProfileId,
      status: 'closed',
    },
    include: {
      stockItem: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          unit: true,
          quantityOnHand: true,
          isBulk: true,
          active: true,
        },
      },
      usageLines: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          menuItemId: true,
          menuItemNameAr: true,
          menuItemNameEn: true,
          servings: true,
          quantityUsed: true,
          kitchenOrderId: true,
          createdAt: true,
        },
      },
    },
  })
  if (!row) return null
  const mapped = mapKitchenAllocationToJson(row)
  const usage = summarizeUsageLines(row.usageLines ?? [])
  return withStats(mapped, row, usage)
}
