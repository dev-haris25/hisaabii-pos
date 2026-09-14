/**
 * Build the print-bridge receipt DTO from a stored credit/debit note.
 *
 * @param {{
 *   note: {
 *     id: string
 *     creditNoteNumber?: string
 *     debitNoteNumber?: string
 *     noteDate: Date
 *     reasonAr: string
 *     reasonEn?: string | null
 *     invoiceNumberSnapshot: string
 *     sellerCompanyNameAr: string
 *     sellerCompanyNameEn: string | null
 *     sellerVatNumber: string
 *     sellerCrNumber: string
 *     subtotal: string
 *     totalVat: string
 *     grandTotal: string
 *     qrCode: string | null
 *     lines: Array<{
 *       nameAr: string
 *       nameEn: string | null
 *       quantity: number
 *       unitPrice: string
 *       lineTotal: string
 *     }>
 *     createdByStaff?: { name: string } | null
 *   }
 *   documentNature: 'credit' | 'debit'
 *   locale?: string
 *   logoPngBase64?: string | null
 * }} opts
 */
export function buildReceiptPayloadFromNote({
  note,
  documentNature,
  locale = 'en',
  logoPngBase64 = null,
}) {
  const qrCode = note.qrCode?.trim() || ''
  if (!qrCode) {
    throw Object.assign(new Error('Note has no Phase-2 QR'), {
      code: 'QR_REQUIRED',
    })
  }

  const isAr = locale === 'ar'
  const restaurantName = isAr
    ? note.sellerCompanyNameAr
    : note.sellerCompanyNameEn?.trim() || note.sellerCompanyNameAr

  const noteNumber = note.creditNoteNumber || note.debitNoteNumber || ''
  const documentLabel = isAr
    ? documentNature === 'credit'
      ? 'إشعار دائن'
      : 'إشعار مدين'
    : documentNature === 'credit'
      ? 'CREDIT NOTE'
      : 'DEBIT NOTE'

  const reason = isAr
    ? note.reasonAr
    : note.reasonEn?.trim() || note.reasonAr

  const lines = note.lines.map((l) => ({
    name: isAr ? l.nameAr : l.nameEn?.trim() || l.nameAr,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
  }))

  const logo =
    typeof logoPngBase64 === 'string' && logoPngBase64.trim()
      ? logoPngBase64.trim()
      : null

  return {
    invoiceId: note.id,
    restaurantName,
    logoPngBase64: logo,
    vatNumber: note.sellerVatNumber,
    crNumber: note.sellerCrNumber,
    sellerEmail: note.sellerEmail ?? null,
    sellerPhone: note.sellerPhone ?? null,
    invoiceNumber: noteNumber,
    invoiceDate: note.noteDate.toISOString(),
    staffName: note.createdByStaff?.name || null,
    lines,
    subtotal: note.subtotal,
    discount: '0.00',
    totalVat: note.totalVat,
    grandTotal: note.grandTotal,
    paymentMethod: null,
    amountTendered: null,
    changeGiven: null,
    qrCode,
    documentLabel,
    referenceInvoiceNumber: note.invoiceNumberSnapshot,
    reason,
  }
}
