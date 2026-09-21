import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  HISTORY_BATCH_LIMIT,
  enrichSalesForWasteAi,
} from '@/lib/stock/analyze-kitchen-waste-gemini'
import { kitchenStockRemaining } from '@/lib/stock/kitchen-stock-math'
import { summarizeUsageLines } from '@/lib/stock/wastage-report'
import { formatQtyString, parseQty } from '@/lib/stock/units'

const MAX_SALES_ITEMS = 60

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {{ businessProfileId: string, allocationId: string }} opts
 */
export async function buildKitchenWasteAiPayload(db, opts) {
  const alloc = await db.kitchenStockAllocation.findFirst({
    where: {
      id: opts.allocationId,
      businessProfileId: opts.businessProfileId,
      status: 'closed',
    },
    include: {
      stockItem: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          unit: true,
          isBulk: true,
          unitCost: true,
          notes: true,
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
  })
  if (!alloc || !alloc.stockItem) return null

  const usage = summarizeUsageLines(alloc.usageLines ?? [])
  const issuedN = parseQty(alloc.quantityIssued ?? '0') ?? 0
  const recipeUsedN = parseQty(alloc.quantityUsed ?? '0') ?? 0
  const issued = formatQtyString(issuedN)
  const recipeUsed = formatQtyString(recipeUsedN)
  const leftover = formatQtyString(Math.max(0, kitchenStockRemaining(alloc)))
  const ledgerWaste = leftover
  const isBulk =
    alloc.isBulkAtClose != null
      ? alloc.isBulkAtClose === true
      : alloc.stockItem.isBulk === true
  const unitCostN = parseQty(alloc.stockItem.unitCost ?? '')
  const ledgerWasteCost =
    unitCostN != null
      ? Math.round(Math.max(0, issuedN - recipeUsedN) * unitCostN * 100) / 100
      : null

  const openedAt = alloc.openedAt
  const closedAt = alloc.closedAt ?? new Date()
  const durationHours =
    Math.round(((closedAt.getTime() - openedAt.getTime()) / 36e5) * 10) / 10

  const invoices = await db.invoice.findMany({
    where: {
      businessProfileId: opts.businessProfileId,
      status: 'completed',
      ...WHERE_NOT_DELETED,
      invoiceDate: { gte: openedAt, lte: closedAt },
    },
    select: {
      lines: {
        select: {
          menuItemId: true,
          nameAr: true,
          nameEn: true,
          quantity: true,
        },
      },
    },
    take: 400,
  })

  /** @type {Map<string, { menuItemId: string | null, nameAr: string, nameEn: string | null, quantity: number }>} */
  const soldByKey = new Map()
  for (const inv of invoices) {
    for (const line of inv.lines) {
      const key = line.menuItemId ?? `snap:${line.nameAr}|${line.nameEn ?? ''}`
      const prev = soldByKey.get(key)
      if (prev) {
        prev.quantity += line.quantity
      } else {
        soldByKey.set(key, {
          menuItemId: line.menuItemId,
          nameAr: line.nameAr,
          nameEn: line.nameEn,
          quantity: line.quantity,
        })
      }
    }
  }

  const sales = [...soldByKey.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, MAX_SALES_ITEMS)

  const soldIds = [
    ...new Set(
      sales.map((s) => s.menuItemId).filter((id) => typeof id === 'string'),
    ),
  ]
  const usageIds = [
    ...new Set(
      usage.recipes.map((r) => r.menuItemId).filter((id) => typeof id === 'string'),
    ),
  ]
  const allMenuIds = [...new Set([...soldIds, ...usageIds])]

  const recipeRows = allMenuIds.length
    ? await db.menuItemRecipe.findMany({
        where: { menuItemId: { in: allMenuIds } },
        select: {
          menuItemId: true,
          steps: true,
          stepsAr: true,
          ingredients: {
            where: { stockItemId: alloc.stockItemId },
            select: { quantity: true, unit: true },
          },
        },
      })
    : []
  /** @type {Map<string, { steps: string | null, stepsAr: string | null, perServing: string | null, unit: string | null }>} */
  const recipeByMenu = new Map()
  for (const rec of recipeRows) {
    const ing = rec.ingredients[0]
    recipeByMenu.set(rec.menuItemId, {
      steps: rec.steps || null,
      stepsAr: rec.stepsAr || null,
      perServing: ing?.quantity ?? null,
      unit: ing?.unit ?? null,
    })
  }

  const past = await db.kitchenStockAllocation.findMany({
    where: {
      businessProfileId: opts.businessProfileId,
      stockItemId: alloc.stockItemId,
      status: 'closed',
      id: { not: alloc.id },
    },
    orderBy: { closedAt: 'desc' },
    take: HISTORY_BATCH_LIMIT,
    select: {
      quantityIssued: true,
      quantityWaste: true,
    },
  })
  const pastPcts = past
    .map((row) => {
      const iss = parseQty(row.quantityIssued ?? '0') ?? 0
      const w = parseQty(row.quantityWaste ?? '0') ?? 0
      if (iss <= 0) return null
      return (w / iss) * 100
    })
    .filter((n) => n != null)
  const averageWastePct =
    pastPcts.length > 0
      ? Math.round(
          (pastPcts.reduce((a, b) => a + b, 0) / pastPcts.length) * 10,
        ) / 10
      : null
  const lastWastePct = pastPcts[0] ?? null

  const salesInPeriod = enrichSalesForWasteAi(
    sales.map((s) => {
      const extra = s.menuItemId ? recipeByMenu.get(s.menuItemId) : null
      return {
        menuItemId: s.menuItemId,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        quantity: s.quantity,
        portionsSold: s.quantity,
        recipeQtyPerPortion: extra?.perServing ?? '0',
        recipeQtyPerServing: extra?.perServing ?? null,
        recipeUnit: extra?.unit ?? null,
        usesThisStockInRecipe: extra?.perServing != null,
        steps: extra?.steps ?? null,
        stepsAr: extra?.stepsAr ?? null,
      }
    }),
  )

  return {
    allocationId: alloc.id,
    isBulk,
    unit: alloc.stockItem.unit,
    issued,
    recipeUsed,
    leftover,
    ledgerWaste,
    batch: {
      batchId: alloc.id,
      openedAt: openedAt.toISOString(),
      closedAt: closedAt.toISOString(),
      durationHours,
      issuedQty: issued,
      recipeUsedQty: recipeUsed,
      leftoverQty: leftover,
      ledgerWasteQty: ledgerWaste,
      unit: alloc.stockItem.unit,
      isBulk,
      unitCost: alloc.stockItem.unitCost ?? null,
      ledgerWasteCost,
    },
    item: {
      nameAr: alloc.stockItem.nameAr,
      nameEn: alloc.stockItem.nameEn,
      isBulk,
      notes: alloc.stockItem.notes ?? null,
    },
    stockItem: {
      nameAr: alloc.stockItem.nameAr,
      nameEn: alloc.stockItem.nameEn,
      unit: alloc.stockItem.unit,
      isBulk,
      unitCost: alloc.stockItem.unitCost ?? null,
    },
    recipes: usage.recipes.map((r) => {
      const extra = r.menuItemId ? recipeByMenu.get(r.menuItemId) : null
      return {
        nameAr: r.menuItemNameAr,
        nameEn: r.menuItemNameEn,
        servings: r.servings,
        tickets: r.ticketCount,
        stockUsed: r.quantityUsed,
        steps: extra?.steps ?? null,
        stepsAr: extra?.stepsAr ?? null,
        recipeQtyPerServing: extra?.perServing ?? null,
        recipeUnit: extra?.unit ?? null,
      }
    }),
    salesInPeriod,
    history: {
      sampleCount: pastPcts.length,
      lastWastePct,
      averageWastePct,
    },
  }
}
