import { assertLinesValidForSend } from '@/lib/invoices/invoice-validate'
import { assertSellerPartyForZatca } from '@/lib/zatca/seller-party-validate'

/**
 * Preflight checks before signing/reporting a Simplified invoice to ZATCA.
 * No buyer-party checks — this POS never issues Standard (B2B) invoices.
 *
 * @param {import('@/generated/prisma/client').Invoice & {
 *   lines: import('@/generated/prisma/client').InvoiceLine[]
 * }} invoice
 */
export function assertInvoiceReadyForZatcaSubmit(invoice) {
  assertSellerPartyForZatca(invoice)
  assertLinesValidForSend({
    lines: invoice.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      nameAr: l.nameAr,
      nameEn: l.nameEn,
    })),
  })
}
