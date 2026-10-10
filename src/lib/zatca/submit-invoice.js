import {
  extractInvoiceTimestamp,
  extractInvoiceUuid,
  generateInvoiceXml,
  signInvoice,
} from '@talha7k/zatca'

import { extractQrTlvBase64FromInvoiceXml } from '@/lib/invoices/extract-qr-from-xml'
import { assertInvoiceReadyForZatcaSubmit } from '@/lib/zatca/assert-zatca-submit-ready'
import { mapStoredInvoiceToZatcaDocument } from '@/lib/zatca/map-invoice-to-zatca'

/**
 * Phase-2 sign a stored Simplified (B2C) POS invoice. Local only — no HTTP.
 * The caller owns the chain position (counter + previous hash) and must hold
 * the device lock (see `zatca-document-chain.js`, rules §18).
 *
 * Embeds the 9-tag QR into the signed XML ourselves: the library's
 * `submitInvoice` signs without `qrData` and never inserts KSA-14
 * (QRCODE_INVALID / BR-KSA-27).
 *
 * @param {import('@/generated/prisma/client').Invoice & {
 *   lines: import('@/generated/prisma/client').InvoiceLine[]
 * }} invoice
 * @param {ReturnType<typeof import('@/lib/zatca/zatca-signing-context').loadZatcaSigningContext>} ctx
 * @param {{ invoiceCounter: number, previousInvoiceHash: string }} chain
 * @returns {{ signedXml: string, invoiceHash: string, qrCodeBase64: string, uuid: string }}
 */
export function signStoredInvoiceForZatca(invoice, ctx, chain) {
  assertInvoiceReadyForZatcaSubmit(invoice)

  const zatcaDocument = mapStoredInvoiceToZatcaDocument(invoice, {
    invoiceCounter: chain.invoiceCounter,
    previousInvoiceHash: chain.previousInvoiceHash,
    sellerVatNumber: ctx.authVatNumber,
    environment: ctx.env,
  })

  const xml = generateInvoiceXml(zatcaDocument)
  const { signedXml, invoiceHash } = signInvoice({
    xml,
    privateKeyPem: ctx.privateKeyPem,
    certificatePem: ctx.certificatePem,
    qrData: {
      sellerName: zatcaDocument.supplier.nameAr,
      vatNumber: zatcaDocument.supplier.vatNumber,
      timestamp: extractInvoiceTimestamp(xml),
      totalWithVat: zatcaDocument.payableAmount.toFixed(2),
      vatTotal: zatcaDocument.taxAmount.toFixed(2),
      certificateSignature: ctx.certificateSignature,
    },
  })

  const qrCodeBase64 = extractQrTlvBase64FromInvoiceXml(signedXml)
  if (!qrCodeBase64) {
    throw new Error('Signed invoice XML is missing embedded ZATCA QR payload')
  }

  return {
    signedXml,
    invoiceHash,
    qrCodeBase64,
    uuid: extractInvoiceUuid(signedXml) || zatcaDocument.uuid,
  }
}
