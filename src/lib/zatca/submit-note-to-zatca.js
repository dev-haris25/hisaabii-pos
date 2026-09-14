import {
  asCertificatePem,
  DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH,
  extractCertificateSignature,
  extractInvoiceTimestamp,
  generateInvoiceXml,
  signInvoice,
  ZatcaApiClient,
} from '@talha7k/zatca'

import { extractQrTlvBase64FromInvoiceXml } from '@/lib/invoices/extract-qr-from-xml'
import { assertNoteReadyForZatcaSubmit } from '@/lib/zatca/assert-zatca-note-submit-ready'
import { extractVatFromZatcaCertificate } from '@/lib/zatca/certificate-vat'
import { patchCreditDebitNoteXml } from '@/lib/zatca/credit-debit-note-xml-patch'
import { getZatcaApiConfig, getZatcaEnvironment } from '@/lib/zatca/env'
import { resolveZatcaSigningCertificateRaw } from '@/lib/zatca/key-cert-match'
import { mapStoredNoteToZatcaDocument } from '@/lib/zatca/map-note-to-zatca'
import { decryptZatcaSecret } from '@/lib/zatca/secrets'
import { formatZatcaSubmitRejection } from '@/lib/zatca/submit-errors'

/**
 * @param {import('@/generated/prisma/client').ZatcaDevice} device
 * @param {string} privateKeyPem
 * @param {string | null | undefined} [environment]
 */
function resolveSigningCertificatePem(device, privateKeyPem, environment) {
  const signingRaw = resolveZatcaSigningCertificateRaw(
    device,
    privateKeyPem,
    environment,
  )
  if (!signingRaw) {
    throw new Error(
      'No ZATCA certificate matches the stored private key. Re-run ZATCA onboarding for this company.',
    )
  }
  return asCertificatePem(signingRaw)
}

/**
 * Sign + report a stored Simplified credit/debit note to ZATCA.
 * Uses generateInvoiceXml + patchCreditDebitNoteXml (not generateCreditNoteXml —
 * that omits empty AccountingCustomerParty and fails ZATCA XSD for B2C notes).
 * Always reporting (never clearance) — B2C-only POS.
 *
 * @param {object} note CreditNote or DebitNote with lines
 * @param {import('@/generated/prisma/client').ZatcaDevice} device
 * @param {'credit' | 'debit'} documentNature
 * @param {(stage: string) => void} [onStage]
 * @param {string | null | undefined} [environmentOverride]
 */
export async function submitStoredNoteToZatca(
  note,
  device,
  documentNature,
  onStage,
  environmentOverride,
) {
  if (!device.productionCsid || !device.productionSecretEnc) {
    throw new Error(
      'ZATCA production CSID is missing. Complete ZATCA onboarding first.',
    )
  }

  const env = getZatcaEnvironment(environmentOverride ?? device.environment)

  const privateKeyPem = decryptZatcaSecret(device.privateKeyEnc)
  const productionSecret = decryptZatcaSecret(device.productionSecretEnc)
  const certificatePem = resolveSigningCertificatePem(device, privateKeyPem, env)
  const authVatNumber = extractVatFromZatcaCertificate(device.productionCsid)

  let certificateSignature
  try {
    certificateSignature = extractCertificateSignature(certificatePem)
  } catch {
    throw new Error('Could not read the ZATCA certificate signature')
  }

  const nextCounter = device.invoiceCounter + 1
  const previousHash =
    device.lastInvoiceHash?.trim() || DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH

  assertNoteReadyForZatcaSubmit(note)

  const zatcaDocument = mapStoredNoteToZatcaDocument(note, {
    invoiceCounter: nextCounter,
    previousInvoiceHash: previousHash,
    sellerVatNumber: authVatNumber,
    documentNature,
    environment: env,
  })

  const credentials = {
    binarySecurityToken: device.productionCsid,
    secret: productionSecret,
  }

  onStage?.('xml_generated')
  let xml = generateInvoiceXml(zatcaDocument)
  xml = patchCreditDebitNoteXml(xml, {
    reason: zatcaDocument.reason,
    originalInvoiceNumber: zatcaDocument.originalInvoiceNumber,
    originalInvoiceUuid: zatcaDocument.originalInvoiceUuid,
    originalInvoiceDate: zatcaDocument.originalInvoiceDate,
  })

  const { signedXml, invoiceHash } = signInvoice({
    xml,
    privateKeyPem,
    certificatePem,
    qrData: {
      sellerName: zatcaDocument.supplier.nameAr,
      vatNumber: zatcaDocument.supplier.vatNumber,
      timestamp: extractInvoiceTimestamp(xml),
      totalWithVat: zatcaDocument.payableAmount.toFixed(2),
      vatTotal: zatcaDocument.taxAmount.toFixed(2),
      certificateSignature,
    },
  })
  onStage?.('signed')

  const qrCodeBase64 = extractQrTlvBase64FromInvoiceXml(signedXml)
  if (!qrCodeBase64) {
    throw new Error('Signed note XML is missing embedded ZATCA QR payload')
  }

  onStage?.('submitting')
  const client = new ZatcaApiClient(getZatcaApiConfig(env))
  const zatcaResult = await client.submitForReporting(credentials, {
    invoiceHash,
    uuid: zatcaDocument.uuid,
    invoice: Buffer.from(signedXml).toString('base64'),
  })
  onStage?.('zatca_responded')

  if (!zatcaResult.success) {
    throw new Error(
      `ZATCA submission rejected: ${formatZatcaSubmitRejection(zatcaResult)}`,
    )
  }

  return {
    success: true,
    signedXml,
    invoiceHash,
    qrCodeBase64,
    zatcaUuid: zatcaDocument.uuid,
    submissionType: /** @type {const} */ ('reporting'),
    newHashChainState: {
      lastHash: invoiceHash,
      lastUuid: zatcaDocument.uuid,
      counter: nextCounter,
      updatedAt: new Date().toISOString(),
    },
  }
}
