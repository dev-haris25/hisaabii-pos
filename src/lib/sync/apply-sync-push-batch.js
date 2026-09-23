import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import {
  canTransitionKitchenStatus,
  kitchenStatusUpdateData,
} from '@/lib/orders/sync-kitchen-order'
import { prisma } from '@/lib/prisma'
import { formatQtyString, parseQty } from '@/lib/stock/units'

/**
 * @param {unknown} raw
 * @returns {Date | null}
 */
function parseIsoDate(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw
  if (typeof raw !== 'string' || !raw.trim()) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * @param {string} orderDateStr YYYY-MM-DD or ISO
 */
function toOrderDate(orderDateStr) {
  const s = String(orderDateStr || '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
  }
  const d = parseIsoDate(s)
  return d || new Date()
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @param {string} eventId
 * @param {string} eventType
 * @param {string | null | undefined} posTillId
 */
async function markProcessed(tx, businessProfileId, eventId, eventType, posTillId) {
  await tx.syncProcessedEvent.create({
    data: {
      businessProfileId,
      eventId,
      eventType,
      posTillId: posTillId || null,
    },
  })
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @param {string} eventId
 */
async function alreadyProcessed(tx, businessProfileId, eventId) {
  const row = await tx.syncProcessedEvent.findUnique({
    where: {
      businessProfileId_eventId: { businessProfileId, eventId },
    },
    select: { id: true },
  })
  return Boolean(row)
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @param {Record<string, unknown>} invoice
 * @param {Array<Record<string, unknown>>} lines
 * @param {{ invoiceCounter?: number, lastInvoiceHash?: string } | null} tip
 */
async function applyInvoiceCreated(tx, businessProfileId, invoice, lines, tip) {
  const invoiceId = String(invoice.id || '').trim()
  if (!invoiceId) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'invoice.id required' }
  }

  const existing = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true },
  })
  if (existing) {
    return { ok: true, duplicate: true }
  }

  const byNumber = await tx.invoice.findUnique({
    where: {
      businessProfileId_invoiceNumber: {
        businessProfileId,
        invoiceNumber: String(invoice.invoiceNumber || ''),
      },
    },
    select: { id: true },
  })
  if (byNumber) {
    return { ok: true, duplicate: true }
  }

  const staffId = String(invoice.createdByStaffId || '').trim()
  if (!staffId) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'createdByStaffId required',
    }
  }

  const paymentMethod =
    invoice.paymentMethod === 'card' ? 'card' : 'cash'
  const zatcaStatus =
    typeof invoice.zatcaStatus === 'string' && invoice.zatcaStatus
      ? invoice.zatcaStatus
      : 'pending'

  const invoiceDate =
    parseIsoDate(invoice.invoiceDate) ||
    parseIsoDate(invoice.createdAt) ||
    new Date()

  await tx.invoice.create({
    data: {
      id: invoiceId,
      businessProfileId,
      invoiceNumber: String(invoice.invoiceNumber),
      status: 'completed',
      type: 'simplified',
      invoiceDate,
      createdByStaffId: staffId,
      sellerCompanyNameAr: String(invoice.sellerCompanyNameAr ?? ''),
      sellerCompanyNameEn:
        invoice.sellerCompanyNameEn != null
          ? String(invoice.sellerCompanyNameEn)
          : null,
      sellerVatNumber: String(invoice.sellerVatNumber ?? ''),
      sellerCrNumber: String(invoice.sellerCrNumber ?? ''),
      sellerAddressAr: String(invoice.sellerAddressAr ?? ''),
      sellerAddressEn:
        invoice.sellerAddressEn != null
          ? String(invoice.sellerAddressEn)
          : null,
      sellerStreetAr: String(invoice.sellerStreetAr ?? ''),
      sellerStreetEn: String(invoice.sellerStreetEn ?? ''),
      sellerDistrictAr: String(invoice.sellerDistrictAr ?? ''),
      sellerDistrictEn: String(invoice.sellerDistrictEn ?? ''),
      sellerCityAr: String(invoice.sellerCityAr ?? ''),
      sellerCityEn: String(invoice.sellerCityEn ?? ''),
      sellerBuildingNumber: String(invoice.sellerBuildingNumber ?? ''),
      sellerSecondaryNumber: String(invoice.sellerSecondaryNumber ?? ''),
      sellerPostalCode: String(invoice.sellerPostalCode ?? ''),
      sellerShortAddress: String(invoice.sellerShortAddress ?? ''),
      sellerCountryCode: String(invoice.sellerCountryCode ?? 'SA'),
      sellerEmail:
        invoice.sellerEmail != null ? String(invoice.sellerEmail) : null,
      sellerPhone:
        invoice.sellerPhone != null ? String(invoice.sellerPhone) : null,
      paymentMethod,
      amountTendered:
        invoice.amountTendered != null
          ? String(invoice.amountTendered)
          : null,
      changeGiven:
        invoice.changeGiven != null ? String(invoice.changeGiven) : null,
      subtotal: String(invoice.subtotal ?? '0.00'),
      totalVat: String(invoice.totalVat ?? '0.00'),
      grandTotal: String(invoice.grandTotal ?? '0.00'),
      notes: invoice.notes != null ? String(invoice.notes) : null,
      xmlPayload:
        invoice.xmlPayload != null ? String(invoice.xmlPayload) : null,
      qrCode: invoice.qrCode != null ? String(invoice.qrCode) : null,
      cryptographicStamp:
        invoice.cryptographicStamp != null
          ? String(invoice.cryptographicStamp)
          : null,
      pih: invoice.pih != null ? String(invoice.pih) : null,
      zatcaStatus,
      createdAt: parseIsoDate(invoice.createdAt) || invoiceDate,
      updatedAt: parseIsoDate(invoice.updatedAt) || new Date(),
      lines: {
        create: (Array.isArray(lines) ? lines : []).map((line, idx) => ({
          id: String(line.id || `${invoiceId}-line-${idx}`),
          menuItemId:
            line.menuItemId != null ? String(line.menuItemId) : null,
          nameAr: String(line.nameAr ?? ''),
          nameEn: line.nameEn != null ? String(line.nameEn) : null,
          quantity: Number(line.quantity) || 0,
          unitPrice: String(line.unitPrice ?? '0'),
          discount: String(line.discount ?? '0'),
          vatPreset: String(line.vatPreset ?? 'standard'),
          vatAmount: String(line.vatAmount ?? '0'),
          lineTotal: String(line.lineTotal ?? '0'),
          sortOrder: Number(line.sortOrder) || idx,
          lineNote: line.lineNote != null ? String(line.lineNote) : null,
          modifiersSnapshot: line.modifiersSnapshot ?? undefined,
        })),
      },
    },
  })

  const numMatch = String(invoice.invoiceNumber || '').match(/(\d+)\s*$/)
  const lastNum = numMatch ? Number.parseInt(numMatch[1], 10) : 0
  if (Number.isFinite(lastNum) && lastNum > 0) {
    const counter = await tx.invoiceCounter.findUnique({
      where: { businessProfileId },
      select: { lastNumber: true },
    })
    if (!counter) {
      await tx.invoiceCounter.create({
        data: { businessProfileId, lastNumber: lastNum },
      })
    } else if (lastNum > counter.lastNumber) {
      await tx.invoiceCounter.update({
        where: { businessProfileId },
        data: { lastNumber: lastNum },
      })
    }
  }

  if (tip && typeof tip.invoiceCounter === 'number') {
    const device = await tx.zatcaDevice.findUnique({
      where: { businessProfileId },
      select: { invoiceCounter: true, lastInvoiceHash: true },
    })
    if (device && tip.invoiceCounter > device.invoiceCounter) {
      await tx.zatcaDevice.update({
        where: { businessProfileId },
        data: {
          invoiceCounter: tip.invoiceCounter,
          lastInvoiceHash:
            typeof tip.lastInvoiceHash === 'string'
              ? tip.lastInvoiceHash
              : device.lastInvoiceHash,
        },
      })
    }
  }

  return { ok: true, duplicate: false }
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @param {Record<string, unknown>} kitchen
 */
async function applyKitchenCreated(tx, businessProfileId, kitchen) {
  const kitchenOrderId = String(kitchen.id || '').trim()
  const invoiceId = String(kitchen.invoiceId || '').trim()
  if (!kitchenOrderId || !invoiceId) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'kitchen id and invoiceId required',
    }
  }

  const existing = await tx.kitchenOrder.findFirst({
    where: {
      OR: [{ id: kitchenOrderId }, { invoiceId }],
    },
    select: { id: true },
  })
  if (existing) {
    return { ok: true, duplicate: true }
  }

  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, businessProfileId },
    select: { id: true },
  })
  if (!invoice) {
    return {
      ok: false,
      code: 'INVOICE_MISSING',
      message: 'Push invoice.created before kitchen_order.created',
    }
  }

  const orderDate = toOrderDate(kitchen.orderDate)
  const orderNumber = Number(kitchen.orderNumber) || 1
  const status = String(kitchen.status || 'pending')
  const createdAt = parseIsoDate(kitchen.createdAt) || new Date()
  const updatedAt = parseIsoDate(kitchen.updatedAt) || createdAt

  await tx.kitchenOrder.create({
    data: {
      id: kitchenOrderId,
      businessProfileId,
      invoiceId,
      orderNumber,
      orderDate,
      status: /** @type {import('@/generated/prisma/client').KitchenOrderStatus} */ (
        status
      ),
      linesSnapshot: kitchen.linesSnapshot ?? [],
      itemsUpdatedAt:
        parseIsoDate(kitchen.itemsUpdatedAt) || createdAt,
      completedAt: parseIsoDate(kitchen.completedAt),
      stockDeductedAt: parseIsoDate(kitchen.stockDeductedAt),
      createdAt,
      updatedAt,
    },
  })

  const counter = await tx.kitchenOrderCounter.findUnique({
    where: {
      businessProfileId_orderDate: { businessProfileId, orderDate },
    },
  })
  if (!counter) {
    await tx.kitchenOrderCounter.create({
      data: { businessProfileId, orderDate, lastNumber: orderNumber },
    })
  } else if (orderNumber > counter.lastNumber) {
    await tx.kitchenOrderCounter.update({
      where: { id: counter.id },
      data: { lastNumber: orderNumber },
    })
  }

  return { ok: true, duplicate: false }
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @param {Record<string, unknown>} payload
 */
async function applyKitchenStatus(tx, businessProfileId, payload) {
  const kitchenOrderId = String(payload.kitchenOrderId || '').trim()
  const invoiceId = String(payload.invoiceId || '').trim()
  const nextStatus = String(payload.status || '').trim()
  if (!nextStatus) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'status required' }
  }

  const existing = kitchenOrderId
    ? await tx.kitchenOrder.findFirst({
        where: { id: kitchenOrderId, businessProfileId },
      })
    : invoiceId
      ? await tx.kitchenOrder.findFirst({
          where: { invoiceId, businessProfileId },
        })
      : null

  if (!existing) {
    return { ok: false, code: 'NOT_FOUND', message: 'Kitchen order not found' }
  }

  const incomingUpdatedAt = parseIsoDate(payload.updatedAt)
  if (
    incomingUpdatedAt &&
    existing.updatedAt &&
    incomingUpdatedAt.getTime() <= existing.updatedAt.getTime()
  ) {
    return { ok: true, duplicate: true, skipped: 'lww' }
  }

  if (existing.status === nextStatus) {
    return { ok: true, duplicate: true }
  }

  if (!canTransitionKitchenStatus(existing.status, nextStatus)) {
    // Stale transition after LWW — treat as soft success so outbox can clear
    return { ok: true, duplicate: true, skipped: 'invalid_transition' }
  }

  const data = {
    ...kitchenStatusUpdateData(nextStatus),
    updatedAt: incomingUpdatedAt || new Date(),
  }

  if (payload.stockDeductedAt && !existing.stockDeductedAt) {
    data.stockDeductedAt = parseIsoDate(payload.stockDeductedAt)
  }

  await tx.kitchenOrder.update({
    where: { id: existing.id },
    data,
  })

  return { ok: true, duplicate: false }
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @param {Record<string, unknown>} movement
 */
async function applyStockMovementCreated(tx, businessProfileId, movement) {
  const movementId = String(movement.id || '').trim()
  const stockItemId = String(movement.stockItemId || '').trim()
  if (!movementId || !stockItemId) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'movement id and stockItemId required',
    }
  }

  const existing = await tx.stockMovement.findUnique({
    where: { id: movementId },
    select: { id: true },
  })
  if (existing) {
    return { ok: true, duplicate: true }
  }

  const item = await tx.stockItem.findFirst({
    where: { id: stockItemId, businessProfileId },
  })
  if (!item) {
    return { ok: false, code: 'NOT_FOUND', message: 'Stock item not found' }
  }

  const quantityAfter =
    movement.quantityAfter != null
      ? String(movement.quantityAfter)
      : formatQtyString(parseQty(item.quantityOnHand) ?? 0)
  const quantityBefore =
    movement.quantityBefore != null
      ? String(movement.quantityBefore)
      : item.quantityOnHand

  await tx.stockMovement.create({
    data: {
      id: movementId,
      businessProfileId,
      stockItemId,
      type: /** @type {import('@/generated/prisma/client').StockMovementType} */ (
        String(movement.type || 'recipe_deduct')
      ),
      quantity: String(movement.quantity ?? '0'),
      unit: /** @type {import('@/generated/prisma/client').StockUnit} */ (
        String(movement.unit || item.unit)
      ),
      quantityBefore,
      quantityAfter,
      reason: movement.reason != null ? String(movement.reason) : null,
      note: movement.note != null ? String(movement.note) : null,
      unitCost: movement.unitCost != null ? String(movement.unitCost) : null,
      createdByUserId:
        movement.createdByUserId != null
          ? String(movement.createdByUserId)
          : null,
      createdAt: parseIsoDate(movement.createdAt) || new Date(),
    },
  })

  await tx.stockItem.update({
    where: { id: stockItemId },
    data: { quantityOnHand: quantityAfter },
  })

  return { ok: true, duplicate: false }
}

/**
 * Apply a batch of desktop outbox events (idempotent by eventId).
 *
 * @param {{
 *   businessProfileId: string
 *   posTillId?: string | null
 *   events: Array<{
 *     eventId: string
 *     eventType: string
 *     payload?: Record<string, unknown>
 *     invoice?: Record<string, unknown>
 *     lines?: Array<Record<string, unknown>>
 *     kitchenOrder?: Record<string, unknown>
 *     movement?: Record<string, unknown>
 *     tip?: { invoiceCounter?: number, lastInvoiceHash?: string } | null
 *   }>
 *   pendingUploadCount?: number
 * }} input
 */
export async function applySyncPushBatch(input) {
  const businessProfileId = input.businessProfileId
  const posTillId =
    typeof input.posTillId === 'string' && input.posTillId.trim()
      ? input.posTillId.trim()
      : null
  const events = Array.isArray(input.events) ? input.events : []

  /** @type {Array<{ eventId: string, ok: boolean, duplicate?: boolean, code?: string, message?: string, skipped?: string }>} */
  const results = []

  for (const event of events) {
    const eventId = String(event?.eventId || '').trim()
    const eventType = String(event?.eventType || '').trim()
    if (!eventId || !eventType) {
      results.push({
        eventId: eventId || 'unknown',
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'eventId and eventType required',
      })
      continue
    }

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        if (await alreadyProcessed(tx, businessProfileId, eventId)) {
          return { ok: true, duplicate: true }
        }

        let applied = { ok: true, duplicate: false }

        if (eventType === 'invoice.created') {
          const invoice =
            event.invoice ||
            (event.payload && typeof event.payload === 'object'
              ? /** @type {Record<string, unknown>} */ (event.payload).invoice
              : null)
          const lines = Array.isArray(event.lines)
            ? event.lines
            : Array.isArray(
                  /** @type {Record<string, unknown>} */ (event.payload)?.lines,
                )
              ? /** @type {Array<Record<string, unknown>>} */ (
                  /** @type {Record<string, unknown>} */ (event.payload).lines
                )
              : []
          if (!invoice || typeof invoice !== 'object') {
            applied = {
              ok: false,
              code: 'VALIDATION_ERROR',
              message: 'invoice snapshot required',
            }
          } else {
            applied = await applyInvoiceCreated(
              tx,
              businessProfileId,
              /** @type {Record<string, unknown>} */ (invoice),
              lines,
              event.tip ?? null,
            )
          }
        } else if (eventType === 'kitchen_order.created') {
          const kitchen =
            event.kitchenOrder ||
            (event.payload && typeof event.payload === 'object'
              ? event.payload
              : null)
          if (!kitchen || typeof kitchen !== 'object') {
            applied = {
              ok: false,
              code: 'VALIDATION_ERROR',
              message: 'kitchenOrder snapshot required',
            }
          } else {
            applied = await applyKitchenCreated(
              tx,
              businessProfileId,
              /** @type {Record<string, unknown>} */ (kitchen),
            )
          }
        } else if (eventType === 'kitchen_order.status') {
          const payload =
            event.payload && typeof event.payload === 'object'
              ? event.payload
              : {}
          applied = await applyKitchenStatus(
            tx,
            businessProfileId,
            /** @type {Record<string, unknown>} */ (payload),
          )
        } else if (eventType === 'stock_movement.created') {
          const movement =
            event.movement ||
            (event.payload && typeof event.payload === 'object'
              ? event.payload
              : null)
          if (!movement || typeof movement !== 'object') {
            applied = {
              ok: false,
              code: 'VALIDATION_ERROR',
              message: 'movement snapshot required',
            }
          } else {
            applied = await applyStockMovementCreated(
              tx,
              businessProfileId,
              /** @type {Record<string, unknown>} */ (movement),
            )
          }
        } else {
          applied = {
            ok: false,
            code: 'UNKNOWN_EVENT',
            message: `Unsupported event type: ${eventType}`,
          }
        }

        if (applied.ok) {
          await markProcessed(
            tx,
            businessProfileId,
            eventId,
            eventType,
            posTillId,
          )
        }

        return applied
      }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

      results.push({
        eventId,
        ok: outcome.ok === true,
        duplicate: outcome.duplicate === true,
        code: outcome.code,
        message: outcome.message,
        skipped: outcome.skipped,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        eventId,
        ok: false,
        code: 'PUSH_APPLY_FAILED',
        message,
      })
      // Stop the batch so earlier events stay ordered; client retries from failure
      break
    }
  }

  if (posTillId && typeof input.pendingUploadCount === 'number') {
    try {
      await prisma.posTill.updateMany({
        where: { id: posTillId, businessProfileId },
        data: {
          pendingUploadCount: Math.max(0, Math.floor(input.pendingUploadCount)),
        },
      })
    } catch {
      /* till may not exist yet */
    }
  }

  const accepted = results.filter((r) => r.ok).length
  const failed = results.find((r) => !r.ok)

  return {
    ok: !failed,
    accepted,
    results,
    error: failed
      ? { eventId: failed.eventId, code: failed.code, message: failed.message }
      : null,
  }
}
