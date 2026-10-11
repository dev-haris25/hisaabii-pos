import { createAndReportNote } from '@/lib/notes/create-and-report-note'
import { planInvoiceCorrection } from '@/lib/notes/invoice-outstanding'

/**
 * Correct a reported invoice with one credit or debit note. The change is
 * planned against the invoice's outstanding state (remaining quantities and
 * before-VAT amounts) inside the locked transaction of `createAndReportNote`.
 * Existing lines use their stored name, unit price and VAT preset; client
 * values are used only for brand-new items.
 *
 * @param {{
 *   profileId: string
 *   invoiceId: string
 *   staffId: string
 *   reasonAr: string
 *   reasonEn?: string | null
 *   editedLines: Array<{
 *     invoiceLineId?: string | null
 *     nameAr: string
 *     nameEn?: string | null
 *     quantity: number
 *     unitPrice: string
 *     vatPreset: string
 *   }>
 * }} opts
 */
export async function createNoteFromInvoiceEdit(opts) {
  const { profileId, invoiceId, staffId, reasonAr, reasonEn, editedLines } = opts

  if (!Array.isArray(editedLines) || editedLines.length === 0) {
    throw Object.assign(new Error('At least one line is required'), {
      code: 'VALIDATION_ERROR',
    })
  }

  /** @type {'credit' | 'debit' | null} */
  let documentNature = null
  const note = await createAndReportNote({
    profileId,
    staffId,
    invoiceId,
    reasonAr,
    reasonEn,
    plan: (outstanding) => {
      const planned = planInvoiceCorrection(outstanding, editedLines)
      documentNature = planned.documentNature
      return planned
    },
  })

  return { note, documentNature }
}
