/**
 * Offline-synced (or otherwise already Phase-2 signed) invoice ready for
 * HTTP reporting without re-signing or advancing the device counter.
 *
 * @param {{
 *   xmlPayload?: string | null
 *   cryptographicStamp?: string | null
 *   qrCode?: string | null
 * } | null | undefined} invoice
 */
export function isPreSignedInvoiceReady(invoice) {
  if (!invoice) return false
  const xml = typeof invoice.xmlPayload === 'string' ? invoice.xmlPayload.trim() : ''
  const hash =
    typeof invoice.cryptographicStamp === 'string'
      ? invoice.cryptographicStamp.trim()
      : ''
  const qr = typeof invoice.qrCode === 'string' ? invoice.qrCode.trim() : ''
  return Boolean(xml && hash && qr)
}
