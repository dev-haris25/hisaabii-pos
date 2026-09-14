/**
 * Build the print-bridge receipt DTO from a stored invoice.
 * Printing is forbidden without a Phase-2 QR (rules.md #20).
 *
 * @param {{
 *   invoice: {
 *     id: string
 *     invoiceNumber: string
 *     invoiceDate: Date
 *     sellerCompanyNameAr: string
 *     sellerCompanyNameEn: string | null
 *     sellerVatNumber: string
 *     sellerCrNumber: string
 *     subtotal: string
 *     totalVat: string
 *     grandTotal: string
 *     paymentMethod: string
 *     amountTendered: string | null
 *     changeGiven: string | null
 *     qrCode: string | null
 *     lines: Array<{
 *       nameAr: string
 *       nameEn: string | null
 *       quantity: number
 *       unitPrice: string
 *       discount: string
 *       lineTotal: string
 *     }>
 *     createdByStaff?: { name: string } | null
 *   }
 *   locale?: string
 *   logoPngBase64?: string | null
 * }} opts
 */
export function buildReceiptPayloadFromInvoice({
  invoice,
  locale = 'en',
  logoPngBase64 = null,
}) {
  const qrCode = invoice.qrCode?.trim() || ''
  if (!qrCode) {
    throw Object.assign(new Error('Invoice has no Phase-2 QR'), {
      code: 'QR_REQUIRED',
    })
  }

  const isAr = locale === 'ar'
  const restaurantName = isAr
    ? invoice.sellerCompanyNameAr
    : invoice.sellerCompanyNameEn?.trim() || invoice.sellerCompanyNameAr

  let discountTotal = 0
  const lines = invoice.lines.map((l) => {
    const d = Number.parseFloat(String(l.discount || '0'))
    if (Number.isFinite(d)) discountTotal += d
    return {
      name: isAr ? l.nameAr : l.nameEn?.trim() || l.nameAr,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    }
  })

  const logo =
    typeof logoPngBase64 === 'string' && logoPngBase64.trim()
      ? logoPngBase64.trim()
      : null

  return {
    invoiceId: invoice.id,
    restaurantName,
    /** When set, print bridge prints the logo and skips the restaurant name. */
    logoPngBase64: logo,
    vatNumber: invoice.sellerVatNumber,
    crNumber: invoice.sellerCrNumber,
    sellerEmail: invoice.sellerEmail ?? null,
    sellerPhone: invoice.sellerPhone ?? null,
    invoiceNumber: invoice.invoiceNumber,
    orderNumber: invoice.kitchenOrder?.orderNumber ?? null,
    invoiceDate: invoice.invoiceDate.toISOString(),
    staffName: invoice.createdByStaff?.name || null,
    lines,
    subtotal: invoice.subtotal,
    discount: discountTotal > 0 ? discountTotal.toFixed(2) : '0.00',
    totalVat: invoice.totalVat,
    grandTotal: invoice.grandTotal,
    paymentMethod: invoice.paymentMethod,
    amountTendered: invoice.amountTendered,
    changeGiven: invoice.changeGiven,
    qrCode,
  }
}
