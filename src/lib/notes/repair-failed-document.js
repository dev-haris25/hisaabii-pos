import {
  centsToMoney,
  computeInvoiceTotals,
  moneyToCents,
  scaleCents,
} from '@/lib/invoices/invoice-compute-totals'

/**
 * ZATCA artifact fields cleared when repairing a failed document for re-report.
 */
export const CLEARED_ZATCA_ARTIFACTS = {
  xmlPayload: null,
  qrCode: null,
  cryptographicStamp: null,
  pih: null,
  zatcaClearedAt: null,
  zatcaLastError: null,
  zatcaStatus: /** @type {const} */ ('pending'),
}

/**
 * Build Prisma line create payloads + totals from edited cart lines.
 *
 * @param {Array<{
 *   nameAr: string
 *   nameEn?: string | null
 *   quantity: number
 *   unitPrice: string
 *   vatPreset: string
 *   menuItemId?: string | null
 *   discount?: string
 *   lineNote?: string | null
 *   modifiersSnapshot?: unknown
 *   offerId?: string | null
 *   offerGroupKey?: string | null
 * }>} lines
 * @param {{ kind?: 'invoice' | 'note' }} [opts]
 */
export function buildRepairedDocumentLines(lines, opts = {}) {
  const kind = opts.kind ?? 'invoice'
  const positive = lines.filter((l) => l.quantity > 0)
  if (positive.length === 0) {
    throw Object.assign(
      new Error('At least one line with quantity > 0 is required'),
      { code: 'VALIDATION_ERROR' },
    )
  }

  const totals = computeInvoiceTotals(
    positive.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: kind === 'invoice' ? (l.discount ?? '0') : '0',
      vatPreset: l.vatPreset,
    })),
  )

  if (Number.parseFloat(totals.grandTotal) <= 0) {
    throw Object.assign(new Error('Total must be greater than zero'), {
      code: 'NOTE_AMOUNT_INVALID',
    })
  }

  const lineCreates = positive.map((l, idx) => {
    const a = totals.perLine[idx]
    /** @type {Record<string, unknown>} */
    const row = {
      nameAr: l.nameAr,
      nameEn: l.nameEn ?? null,
      quantity: a.quantity,
      unitPrice: l.unitPrice,
      vatPreset: /** @type {import('@/generated/prisma/client').VatPreset} */ (
        l.vatPreset
      ),
      vatAmount: a.vatAmountStr,
      lineTotal: a.lineTotalStr,
      sortOrder: idx,
    }
    if (kind === 'invoice') {
      row.discount = l.discount ?? '0'
      row.menuItemId = l.menuItemId || null
      row.lineNote = null
      row.modifiersSnapshot = l.modifiersSnapshot ?? null
      row.offerId = l.offerId ?? null
      row.offerGroupKey = l.offerGroupKey ?? null
    }
    return row
  })

  return {
    totals: {
      subtotal: totals.subtotal,
      totalVat: totals.totalVat,
      grandTotal: totals.grandTotal,
    },
    lineCreates,
  }
}

/**
 * Lines for repairing a failed, never-signed invoice. Lines sent with an
 * `invoiceLineId` keep their stored name, unit price, VAT preset, menu item,
 * modifiers and offer link; their discount is scaled to the new quantity
 * (unchanged when the quantity is unchanged). New lines carry no discount.
 * Pure (server + edit screen).
 *
 * @param {Array<{ id: string, nameAr: string, nameEn?: string | null, quantity: number, unitPrice: string, discount?: string | null, vatPreset: string, menuItemId?: string | null, modifiersSnapshot?: unknown, offerId?: string | null, offerGroupKey?: string | null }>} storedLines
 * @param {Array<{ invoiceLineId?: string | null, nameAr: string, nameEn?: string | null, quantity: number, unitPrice: string, vatPreset: string, menuItemId?: string | null, modifiersSnapshot?: unknown }>} requested
 */
export function resolveInvoiceRepairLines(storedLines, requested) {
  const byId = new Map(storedLines.map((l) => [l.id, l]))
  /** @type {Set<string>} */
  const seen = new Set()
  const out = []
  for (const r of requested) {
    const quantity = Math.max(0, Math.round(Number(r.quantity) || 0))
    if (r.invoiceLineId) {
      const stored = byId.get(r.invoiceLineId)
      if (!stored) {
        throw Object.assign(
          new Error('This invoice changed. Reload the page and try again.'),
          { code: 'INVOICE_CHANGED' },
        )
      }
      if (seen.has(stored.id)) {
        throw Object.assign(new Error('An invoice line is listed twice'), {
          code: 'VALIDATION_ERROR',
        })
      }
      seen.add(stored.id)
      if (quantity <= 0) continue
      const discount =
        quantity === stored.quantity
          ? (stored.discount ?? '0')
          : centsToMoney(
              scaleCents(moneyToCents(stored.discount), quantity, stored.quantity),
            )
      out.push({
        nameAr: stored.nameAr,
        nameEn: stored.nameEn ?? null,
        quantity,
        unitPrice: stored.unitPrice,
        vatPreset: stored.vatPreset,
        discount,
        menuItemId: stored.menuItemId ?? null,
        modifiersSnapshot: stored.modifiersSnapshot ?? null,
        offerId: stored.offerId ?? null,
        offerGroupKey: stored.offerGroupKey ?? null,
      })
      continue
    }
    if (quantity <= 0) continue
    out.push({
      nameAr: r.nameAr,
      nameEn: r.nameEn ?? null,
      quantity,
      unitPrice: r.unitPrice,
      vatPreset: r.vatPreset,
      discount: '0',
      menuItemId: r.menuItemId ?? null,
      modifiersSnapshot: r.modifiersSnapshot ?? null,
      offerId: null,
      offerGroupKey: null,
    })
  }
  return out
}

/**
 * Invoice money fields after a repair: an order discount / loyalty discount
 * that was set becomes the new sum of line discounts, and change is
 * recomputed from the stored amount tendered (never negative).
 *
 * @param {{ discountAmount?: string | null, loyaltyDiscountAmount?: string | null, amountTendered?: string | null }} invoice
 * @param {Array<{ discount?: string | null }>} lines resolved repair lines
 * @param {string} grandTotal repaired grand total
 */
export function repairedInvoiceMoneyFields(invoice, lines, grandTotal) {
  let discountCents = 0
  for (const l of lines) discountCents += moneyToCents(l.discount)
  /** @type {Record<string, string>} */
  const fields = {}
  if (invoice.discountAmount != null) fields.discountAmount = centsToMoney(discountCents)
  if (invoice.loyaltyDiscountAmount != null) {
    fields.loyaltyDiscountAmount = centsToMoney(discountCents)
  }
  if (invoice.amountTendered != null) {
    fields.changeGiven = centsToMoney(
      Math.max(0, moneyToCents(invoice.amountTendered) - moneyToCents(grandTotal)),
    )
  }
  return fields
}
