import { assertLinesValidForSend } from '@/lib/invoices/invoice-validate'
import { assertSellerPartyForZatca } from '@/lib/zatca/seller-party-validate'

/**
 * Preflight checks before signing/reporting a Simplified credit/debit note.
 *
 * @param {{
 *   reasonAr?: string | null
 *   sellerCompanyNameAr: string
 *   sellerVatNumber: string
 *   sellerCrNumber: string
 *   sellerAddressAr: string
 *   lines: Array<{
 *     quantity: number
 *     unitPrice: string
 *     nameAr?: string | null
 *     nameEn?: string | null
 *   }>
 * }} note
 */
export function assertNoteReadyForZatcaSubmit(note) {
  if (!String(note.reasonAr ?? '').trim()) {
    throw Object.assign(new Error('Credit/debit note reason is required'), {
      code: 'NOTE_REASON_REQUIRED',
      message: 'Credit/debit note reason is required for ZATCA submission',
    })
  }
  assertSellerPartyForZatca(note)
  assertLinesValidForSend({
    lines: note.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      nameAr: l.nameAr,
      nameEn: l.nameEn,
    })),
  })
}
