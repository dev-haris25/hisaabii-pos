import { mapNoteSummaryForInvoice } from '@/lib/notes/map-note-json'
import { primaryKitchenOrder } from '@/lib/orders/primary-kitchen-order'

/**
 * @param {unknown} value
 */
function moneyString(value) {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2)
  if (typeof value === 'object' && value !== null && 'toFixed' in value) {
    try {
      return /** @type {{ toFixed: (n: number) => string }} */ (value).toFixed(2)
    } catch {
      // fall through
    }
  }
  return String(value)
}

/**
 * List-row JSON for admin invoices table.
 *
 * @param {{
 *   id: string
 *   invoiceNumber: string
 *   status: string
 *   invoiceDate: Date
 *   paymentMethod: string
 *   grandTotal: unknown
 *   totalVat: unknown
 *   subtotal: unknown
 *   zatcaStatus: string | null
 *   zatcaLastError: string | null
 *   qrCode: string | null
 *   loyaltyPointsAwarded?: boolean | null
 *   createdByStaff?: { id: string, name: string } | null
 *   creditNotes?: Array<{ id: string, creditNoteNumber: string }>
 *   debitNotes?: Array<{ id: string, debitNoteNumber: string }>
 *   kitchenOrders?: Array<{ orderNumber?: number | null }> | null
 * }} row
 */
export function mapInvoiceListItemToJson(row) {
  const kitchen = primaryKitchenOrder(row)
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    invoiceDate: row.invoiceDate.toISOString(),
    paymentMethod: row.paymentMethod,
    grandTotal: moneyString(row.grandTotal) ?? '0.00',
    totalVat: moneyString(row.totalVat) ?? '0.00',
    subtotal: moneyString(row.subtotal) ?? '0.00',
    zatcaStatus: row.zatcaStatus,
    zatcaLastError: row.zatcaLastError,
    hasQr: Boolean(row.qrCode?.trim()),
    loyaltyPointsAwarded: row.loyaltyPointsAwarded === true,
    staffName: row.createdByStaff?.name ?? null,
    staffId: row.createdByStaff?.id ?? null,
    orderNumber: kitchen?.orderNumber ?? null,
    creditNotes: (row.creditNotes ?? []).map((n) => ({
      id: n.id,
      noteNumber: n.creditNoteNumber,
    })),
    debitNotes: (row.debitNotes ?? []).map((n) => ({
      id: n.id,
      noteNumber: n.debitNoteNumber,
    })),
  }
}

/**
 * Full invoice JSON for detail page.
 *
 * @param {import('@/generated/prisma/client').Invoice & {
 *   lines: import('@/generated/prisma/client').InvoiceLine[]
 *   createdByStaff?: { id: string, name: string } | null
 *   creditNotes?: Array<object>
 *   debitNotes?: Array<object>
 * }} invoice
 */
export function mapInvoiceDetailToJson(invoice) {
  const lines = [...invoice.lines]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => ({
      id: l.id,
      nameAr: l.nameAr,
      nameEn: l.nameEn,
      quantity: l.quantity,
      unitPrice: moneyString(l.unitPrice) ?? '0.00',
      discount: moneyString(l.discount) ?? '0.00',
      vatPreset: l.vatPreset,
      vatAmount: moneyString(l.vatAmount) ?? '0.00',
      lineTotal: moneyString(l.lineTotal) ?? '0.00',
      modifiersSnapshot: l.modifiersSnapshot ?? null,
    }))

  /** @type {ReturnType<typeof mapNoteSummaryForInvoice>[]} */
  const linkedNotes = []
  for (const n of invoice.creditNotes ?? []) {
    linkedNotes.push(mapNoteSummaryForInvoice('credit', n))
  }
  for (const n of invoice.debitNotes ?? []) {
    linkedNotes.push(mapNoteSummaryForInvoice('debit', n))
  }
  linkedNotes.sort(
    (a, b) =>
      new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
  )

  const kitchen = primaryKitchenOrder(invoice)

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    type: invoice.type,
    invoiceDate: invoice.invoiceDate.toISOString(),
    paymentMethod: invoice.paymentMethod,
    amountTendered: moneyString(invoice.amountTendered),
    changeGiven: moneyString(invoice.changeGiven),
    subtotal: moneyString(invoice.subtotal) ?? '0.00',
    totalVat: moneyString(invoice.totalVat) ?? '0.00',
    grandTotal: moneyString(invoice.grandTotal) ?? '0.00',
    notes: invoice.notes,
    linkedNotes,
    sellerCompanyNameAr: invoice.sellerCompanyNameAr,
    sellerCompanyNameEn: invoice.sellerCompanyNameEn,
    sellerVatNumber: invoice.sellerVatNumber,
    sellerCrNumber: invoice.sellerCrNumber,
    sellerAddressAr: invoice.sellerAddressAr,
    sellerAddressEn: invoice.sellerAddressEn,
    sellerEmail: invoice.sellerEmail ?? null,
    sellerPhone: invoice.sellerPhone ?? null,
    qrCode: invoice.qrCode,
    zatcaStatus: invoice.zatcaStatus,
    zatcaClearedAt: invoice.zatcaClearedAt?.toISOString() ?? null,
    zatcaReportAttempts: invoice.zatcaReportAttempts,
    zatcaLastAttemptAt: invoice.zatcaLastAttemptAt?.toISOString() ?? null,
    zatcaLastError: invoice.zatcaLastError,
    staffName: invoice.createdByStaff?.name ?? null,
    staffId: invoice.createdByStaff?.id ?? null,
    orderNumber: kitchen?.orderNumber ?? null,
    orderStatus: kitchen?.status ?? null,
    lines,
    createdAt: invoice.createdAt.toISOString(),
  }
}

/**
 * Whether ADMIN may force Report to ZATCA (rules.md #19).
 * @param {string | null | undefined} zatcaStatus
 */
export function canReportInvoiceToZatca(zatcaStatus) {
  return (
    !zatcaStatus ||
    zatcaStatus === 'pending' ||
    zatcaStatus === 'failed'
  )
}
