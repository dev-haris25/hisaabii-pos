import { computeInvoiceTotals } from '@/lib/invoices/invoice-compute-totals'

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
