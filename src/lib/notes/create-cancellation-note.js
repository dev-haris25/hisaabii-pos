import { createAndReportNote } from '@/lib/notes/create-and-report-note'
import { planInvoiceCancellation } from '@/lib/notes/invoice-outstanding'

/** Fixed Arabic cancel reason (KSA-10 / legally authoritative). */
export const CANCEL_REASON_AR = 'تم إلغاء الفاتورة'

/** Optional English display translation of the cancel reason. */
export const CANCEL_REASON_EN = 'Invoice cancelled'

/**
 * Cancellation credit note: every invoice line's remaining before-VAT amount
 * (linked) plus every item added by debit notes, i.e. exactly the outstanding
 * amount. The invoice is voided once ZATCA accepts the note.
 *
 * @param {{ profileId: string, invoiceId: string, staffId: string }} opts
 */
export async function createCancellationNote(opts) {
  const { profileId, invoiceId, staffId } = opts

  const note = await createAndReportNote({
    profileId,
    staffId,
    invoiceId,
    reasonAr: CANCEL_REASON_AR,
    reasonEn: CANCEL_REASON_EN,
    plan: (outstanding) => planInvoiceCancellation(outstanding),
  })

  return { note, documentNature: /** @type {const} */ ('credit') }
}
