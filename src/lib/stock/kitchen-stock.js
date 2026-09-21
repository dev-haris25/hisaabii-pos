import {
  computeMarkConsumedWaste,
  kitchenStockRemaining,
} from '@/lib/stock/kitchen-stock-math'
import { formatQtyString, parseQty } from '@/lib/stock/units'

const stockItemSelect = {
  id: true,
  nameAr: true,
  nameEn: true,
  unit: true,
  quantityOnHand: true,
  isBulk: true,
  active: true,
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {string} stockItemId
 */
export async function getOpenKitchenAllocation(db, businessProfileId, stockItemId) {
  return db.kitchenStockAllocation.findFirst({
    where: {
      businessProfileId,
      stockItemId,
      status: 'open',
    },
    include: { stockItem: { select: stockItemSelect } },
    orderBy: { openedAt: 'asc' },
  })
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 */
export async function listOpenKitchenAllocations(db, businessProfileId) {
  return db.kitchenStockAllocation.findMany({
    where: { businessProfileId, status: 'open' },
    include: { stockItem: { select: stockItemSelect } },
    orderBy: { openedAt: 'asc' },
  })
}

/**
 * @param {NonNullable<Awaited<ReturnType<typeof getOpenKitchenAllocation>>>} alloc
 */
export function mapKitchenAllocationToJson(alloc) {
  const remaining = kitchenStockRemaining(alloc)
  const isBulk =
    alloc.isBulkAtClose != null
      ? alloc.isBulkAtClose === true
      : alloc.stockItem?.isBulk === true
  const closed = alloc.status === 'closed'
  return {
    id: alloc.id,
    stockItemId: alloc.stockItemId,
    status: alloc.status,
    quantityIssued: alloc.quantityIssued,
    quantityUsed: alloc.quantityUsed,
    quantityRemaining: formatQtyString(Math.max(0, remaining)),
    quantityWaste: closed
      ? (alloc.quantityWaste ?? (isBulk ? '0' : null))
      : isBulk
        ? '0'
        : formatQtyString(Math.max(0, remaining)),
    isBulkAtClose: alloc.isBulkAtClose ?? null,
    isBulk,
    aiQuantityUsed: alloc.aiQuantityUsed ?? null,
    wasteIsAiEstimate: alloc.wasteIsAiEstimate === true,
    wasteSeverity: alloc.wasteSeverity ?? null,
    aiAnalysis: alloc.aiAnalysis ?? null,
    aiAnalyzedAt: alloc.aiAnalyzedAt
      ? alloc.aiAnalyzedAt.toISOString()
      : null,
    openedAt: alloc.openedAt.toISOString(),
    closedAt: alloc.closedAt ? alloc.closedAt.toISOString() : null,
    stockItem: alloc.stockItem
      ? {
          id: alloc.stockItem.id,
          nameAr: alloc.stockItem.nameAr,
          nameEn: alloc.stockItem.nameEn,
          unit: alloc.stockItem.unit,
          quantityOnHand: alloc.stockItem.quantityOnHand,
          isBulk: alloc.stockItem.isBulk === true,
          active: alloc.stockItem.active !== false,
        }
      : null,
  }
}

/**
 * Close an open allocation (mark consumed).
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   allocationId: string
 *   businessProfileId: string
 *   closedByUserId?: string | null
 * }} opts
 */
export async function markKitchenAllocationConsumed(tx, opts) {
  const alloc = await tx.kitchenStockAllocation.findFirst({
    where: {
      id: opts.allocationId,
      businessProfileId: opts.businessProfileId,
      status: 'open',
    },
    include: { stockItem: { select: { isBulk: true } } },
  })
  if (!alloc) {
    return { ok: false, code: 'NOT_FOUND', message: 'Open kitchen stock not found' }
  }

  const isBulk = alloc.stockItem?.isBulk === true
  const waste = computeMarkConsumedWaste(alloc, isBulk)
  const updated = await tx.kitchenStockAllocation.update({
    where: { id: alloc.id },
    data: {
      status: 'closed',
      closedAt: new Date(),
      closedByUserId: opts.closedByUserId ?? null,
      quantityWaste: waste.quantityWaste,
      isBulkAtClose: waste.isBulkAtClose,
    },
    include: { stockItem: { select: stockItemSelect } },
  })

  return { ok: true, allocation: updated }
}
