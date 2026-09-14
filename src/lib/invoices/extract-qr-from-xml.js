/**
 * Extract Phase 2 QR TLV (base64) embedded in signed ZATCA invoice XML.
 *
 * @param {string | null | undefined} xml
 * @returns {string | null}
 */
export function extractQrTlvBase64FromInvoiceXml(xml) {
  if (!xml?.trim()) return null

  const match = xml.match(
    /<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)<\/cbc:EmbeddedDocumentBinaryObject>/,
  )

  const payload = match?.[1]?.trim()
  return payload || null
}

/**
 * Prefer QR embedded in signed XML; fall back to stored DB payload.
 *
 * @param {{ qrCode?: string | null, xmlPayload?: string | null }} invoice
 * @returns {string | null}
 */
export function resolveInvoiceQrPayload(invoice) {
  return (
    extractQrTlvBase64FromInvoiceXml(invoice.xmlPayload) ||
    invoice.qrCode?.trim() ||
    null
  )
}
