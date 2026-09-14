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
 * @param {string | null | undefined} zatcaStatus
 */
export function canReportNoteToZatca(zatcaStatus) {
  return (
    !zatcaStatus || zatcaStatus === 'pending' || zatcaStatus === 'failed'
  )
}

/**
 * @param {'credit' | 'debit'} documentNature
 * @param {object} row
 */
function mapNoteListItem(documentNature, row) {
  const number =
    documentNature === 'credit' ? row.creditNoteNumber : row.debitNoteNumber
  return {
    id: row.id,
    documentNature,
    noteNumber: number,
    noteDate: row.noteDate.toISOString(),
    invoiceId: row.invoiceId ?? null,
    invoiceNumber: row.invoiceNumberSnapshot ?? null,
    reasonAr: row.reasonAr,
    reasonEn: row.reasonEn ?? null,
    grandTotal: moneyString(row.grandTotal) ?? '0.00',
    totalVat: moneyString(row.totalVat) ?? '0.00',
    subtotal: moneyString(row.subtotal) ?? '0.00',
    zatcaStatus: row.zatcaStatus,
    zatcaLastError: row.zatcaLastError,
    hasQr: Boolean(row.qrCode?.trim()),
    staffName: row.createdByStaff?.name ?? null,
    staffId: row.createdByStaff?.id ?? null,
  }
}

/**
 * @param {object} row
 */
export function mapCreditNoteListItemToJson(row) {
  return mapNoteListItem('credit', row)
}

/**
 * @param {object} row
 */
export function mapDebitNoteListItemToJson(row) {
  return mapNoteListItem('debit', row)
}

/**
 * @param {'credit' | 'debit'} documentNature
 * @param {object} note
 */
function mapNoteDetail(documentNature, note) {
  const number =
    documentNature === 'credit' ? note.creditNoteNumber : note.debitNoteNumber
  const lines = [...(note.lines ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => ({
      id: l.id,
      nameAr: l.nameAr,
      nameEn: l.nameEn,
      quantity: l.quantity,
      unitPrice: moneyString(l.unitPrice) ?? '0.00',
      discount: '0.00',
      vatPreset: l.vatPreset,
      vatAmount: moneyString(l.vatAmount) ?? '0.00',
      lineTotal: moneyString(l.lineTotal) ?? '0.00',
    }))

  return {
    id: note.id,
    documentNature,
    noteNumber: number,
    /** Alias so PosThermalReceiptPreview can reuse invoiceNumber field. */
    invoiceNumber: number,
    noteDate: note.noteDate.toISOString(),
    invoiceDate: note.noteDate.toISOString(),
    invoiceId: note.invoiceId ?? null,
    invoiceNumberSnapshot: note.invoiceNumberSnapshot,
    referenceInvoiceNumber: note.invoiceNumberSnapshot,
    reasonAr: note.reasonAr,
    reasonEn: note.reasonEn ?? null,
    paymentMethod: 'card',
    amountTendered: null,
    changeGiven: null,
    subtotal: moneyString(note.subtotal) ?? '0.00',
    totalVat: moneyString(note.totalVat) ?? '0.00',
    grandTotal: moneyString(note.grandTotal) ?? '0.00',
    sellerCompanyNameAr: note.sellerCompanyNameAr,
    sellerCompanyNameEn: note.sellerCompanyNameEn,
    sellerVatNumber: note.sellerVatNumber,
    sellerCrNumber: note.sellerCrNumber,
    sellerAddressAr: note.sellerAddressAr,
    sellerAddressEn: note.sellerAddressEn,
    sellerEmail: note.sellerEmail ?? null,
    sellerPhone: note.sellerPhone ?? null,
    qrCode: note.qrCode,
    zatcaStatus: note.zatcaStatus,
    zatcaClearedAt: note.zatcaClearedAt?.toISOString() ?? null,
    zatcaReportAttempts: note.zatcaReportAttempts,
    zatcaLastAttemptAt: note.zatcaLastAttemptAt?.toISOString() ?? null,
    zatcaLastError: note.zatcaLastError,
    staffName: note.createdByStaff?.name ?? null,
    staffId: note.createdByStaff?.id ?? null,
    lines,
    createdAt: note.createdAt.toISOString(),
  }
}

/**
 * @param {object} note
 */
export function mapCreditNoteDetailToJson(note) {
  return mapNoteDetail('credit', note)
}

/**
 * @param {object} note
 */
export function mapDebitNoteDetailToJson(note) {
  return mapNoteDetail('debit', note)
}

/**
 * Compact note summary for invoice detail grid.
 * @param {'credit' | 'debit'} documentNature
 * @param {object} note
 */
export function mapNoteSummaryForInvoice(documentNature, note) {
  const number =
    documentNature === 'credit' ? note.creditNoteNumber : note.debitNoteNumber
  return {
    id: note.id,
    documentNature,
    noteNumber: number,
    invoiceNumber: number,
    invoiceDate: note.noteDate.toISOString(),
    reasonAr: note.reasonAr,
    reasonEn: note.reasonEn ?? null,
    referenceInvoiceNumber: note.invoiceNumberSnapshot,
    grandTotal: moneyString(note.grandTotal) ?? '0.00',
    totalVat: moneyString(note.totalVat) ?? '0.00',
    subtotal: moneyString(note.subtotal) ?? '0.00',
    zatcaStatus: note.zatcaStatus,
    hasQr: Boolean(note.qrCode?.trim()),
    qrCode: note.qrCode,
    paymentMethod: 'card',
    sellerCompanyNameAr: note.sellerCompanyNameAr,
    sellerCompanyNameEn: note.sellerCompanyNameEn,
    sellerVatNumber: note.sellerVatNumber,
    sellerCrNumber: note.sellerCrNumber,
    sellerEmail: note.sellerEmail ?? null,
    sellerPhone: note.sellerPhone ?? null,
    staffName: note.createdByStaff?.name ?? null,
    lines: [...(note.lines ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({
        id: l.id,
        nameAr: l.nameAr,
        nameEn: l.nameEn,
        quantity: l.quantity,
        unitPrice: moneyString(l.unitPrice) ?? '0.00',
        discount: '0.00',
        lineTotal: moneyString(l.lineTotal) ?? '0.00',
      })),
  }
}
