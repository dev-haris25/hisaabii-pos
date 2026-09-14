import {
  computeLineAmounts,
  decimalStringFromNumber,
} from '@/lib/invoices/invoice-compute-totals'
import { createAndReportNote } from '@/lib/notes/create-and-report-note'

/** Fixed Arabic cancel reason (KSA-10 / legally authoritative). */
export const CANCEL_REASON_AR = 'تم إلغاء الفاتورة'

/** Optional English display translation of the cancel reason. */
export const CANCEL_REASON_EN = 'Invoice cancelled'

/**
 * Full-reversal credit note + mark invoice voided after successful ZATCA report.
 *
 * @param {{
 *   profile: import('@/generated/prisma/client').BusinessProfile
 *   device: import('@/generated/prisma/client').ZatcaDevice
 *   invoice: import('@/generated/prisma/client').Invoice & {
 *     lines: import('@/generated/prisma/client').InvoiceLine[]
 *   }
 *   staffId: string
 * }} opts
 */
export async function createCancellationNote(opts) {
  const { profile, device, invoice, staffId } = opts

  if (invoice.status === 'voided') {
    throw Object.assign(new Error('Invoice is already cancelled'), {
      code: 'INVOICE_VOIDED',
    })
  }
  if (invoice.zatcaStatus !== 'reported' && invoice.zatcaStatus !== 'cleared') {
    throw Object.assign(
      new Error('Report the invoice to ZATCA before cancelling'),
      { code: 'INVOICE_NOT_REPORTED' },
    )
  }

  const noteLines = [...invoice.lines]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => {
      const amounts = computeLineAmounts({
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount ?? '0',
        vatPreset: l.vatPreset,
      })
      const qty = Math.max(1, amounts.quantity || 1)
      // Bake line discount into unit price so note totals match the invoice.
      const effectiveUnit =
        qty > 0 ? decimalStringFromNumber(amounts.taxable / qty) : l.unitPrice
      return {
        nameAr: l.nameAr,
        nameEn: l.nameEn,
        quantity: qty,
        unitPrice: effectiveUnit,
        vatPreset: l.vatPreset,
      }
    })

  if (noteLines.length === 0) {
    throw Object.assign(new Error('Invoice has no lines to reverse'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const note = await createAndReportNote({
    documentNature: 'credit',
    profileId: profile.id,
    staffId,
    invoice,
    profile,
    device,
    reasonAr: CANCEL_REASON_AR,
    reasonEn: CANCEL_REASON_EN,
    noteLines,
    markInvoiceVoided: true,
  })

  return { note, documentNature: /** @type {const} */ ('credit') }
}
