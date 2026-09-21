import {
  isLowStock,
  stockUnitLabel,
  unitFamily,
} from '@/lib/stock/units'
import { movementDirection } from '@/lib/stock/apply-stock-movement'

/**
 * @param {{
 *   id: string
 *   nameAr: string
 *   nameEn: string | null
 *   unit: import('@/lib/stock/units').StockUnit
 *   quantityOnHand: string
 *   lowStockThreshold: string | null
 *   unitCost: string | null
 *   isBulk: boolean
 *   active: boolean
 *   notes: string | null
 *   createdAt: Date
 *   updatedAt: Date
 * }} row
 */
export function mapStockItemToJson(row) {
  const low = row.active
    ? isLowStock(row.quantityOnHand, row.lowStockThreshold)
    : false

  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    unit: row.unit,
    unitLabel: stockUnitLabel(row.unit),
    unitFamily: unitFamily(row.unit),
    quantityOnHand: row.quantityOnHand,
    lowStockThreshold: row.lowStockThreshold,
    unitCost: row.unitCost,
    isBulk: row.isBulk,
    active: row.active,
    notes: row.notes,
    isLowStock: low,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * @param {{
 *   id: string
 *   type: string
 *   quantity: string
 *   unit: import('@/lib/stock/units').StockUnit
 *   quantityBefore: string
 *   quantityAfter: string
 *   reason: string | null
 *   note: string | null
 *   createdByUserId: string | null
 *   createdAt: Date
 *   stockItemId: string
 *   stockItem?: { id: string, nameAr: string, nameEn: string | null } | null
 *   createdBy?: { id: string, name: string } | null
 * }} row
 */
export function mapStockMovementToJson(row) {
  return {
    id: row.id,
    stockItemId: row.stockItemId,
    type: row.type,
    direction: movementDirection(/** @type {any} */ (row.type)),
    quantity: row.quantity,
    unit: row.unit,
    unitLabel: stockUnitLabel(row.unit),
    quantityBefore: row.quantityBefore,
    quantityAfter: row.quantityAfter,
    reason: row.reason,
    note: row.note,
    unitCost: row.unitCost ?? null,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    stockItem: row.stockItem
      ? {
          id: row.stockItem.id,
          nameAr: row.stockItem.nameAr,
          nameEn: row.stockItem.nameEn,
        }
      : null,
  }
}
