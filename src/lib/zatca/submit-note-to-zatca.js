import {
  extractInvoiceTimestamp,
  extractInvoiceUuid,
  generateInvoiceXml,
  signInvoice,
} from '@talha7k/zatca'

import { extractQrTlvBase64FromInvoiceXml } from '@/lib/invoices/extract-qr-from-xml'
import { assertNoteReadyForZatcaSubmit } from '@/lib/zatca/assert-zatca-note-submit-ready'
import { patchCreditDebitNoteXml } from '@/lib/zatca/credit-debit-note-xml-patch'
import { mapStoredNoteToZatcaDocument } from '@/lib/zatca/map-note-to-zatca'

/**
 * Phase-2 sign a stored Simplified credit/debit note. Local only — no HTTP.
 * Same chain as invoices; the caller holds the device lock (rules §18).
 *
 * Uses generateInvoiceXml + patchCreditDebitNoteXml (not generateCreditNoteXml —
 * that omits empty AccountingCustomerParty and fails ZATCA XSD for B2C notes).
 *
 * @param {object} note CreditNote or DebitNote with lines
 * @param {ReturnType<typeof import('@/lib/zatca/zatca-signing-context').loadZatcaSigningContext>} ctx
 * @param {'credit' | 'debit'} documentNature
 * @param {{ invoiceCounter: number, previousInvoiceHash: string }} chain
 * @returns {{ signedXml: string, invoiceHash: string, qrCodeBase64: string, uuid: string }}
 */
export function signStoredNoteForZatca(note, ctx, documentNature, chain) {
  assertNoteReadyForZatcaSubmit(note)

  const zatcaDocument = mapStoredNoteToZatcaDocument(note, {
    invoiceCounter: chain.invoiceCounter,
    previousInvoiceHash: chain.previousInvoiceHash,
    sellerVatNumber: ctx.authVatNumber,
    documentNature,
    environment: ctx.env,
  })

  let xml = generateInvoiceXml(zatcaDocument)
  xml = patchCreditDebitNoteXml(xml, {
    reason: zatcaDocument.reason,
    originalInvoiceNumber: zatcaDocument.originalInvoiceNumber,
    originalInvoiceUuid: zatcaDocument.originalInvoiceUuid,
    originalInvoiceDate: zatcaDocument.originalInvoiceDate,
  })

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
    throw new Error('Signed note XML is missing embedded ZATCA QR payload')
  }

  return {
    signedXml,
    invoiceHash,
    qrCodeBase64,
    uuid: extractInvoiceUuid(signedXml) || zatcaDocument.uuid,
  }
}
