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
import { assertInvoiceReadyForZatcaSubmit } from '@/lib/zatca/assert-zatca-submit-ready'
import { extractVatFromZatcaCertificate } from '@/lib/zatca/certificate-vat'
import { getZatcaApiConfig, getZatcaEnvironment } from '@/lib/zatca/env'
import { resolveZatcaSigningCertificateRaw } from '@/lib/zatca/key-cert-match'
import { mapStoredInvoiceToZatcaDocument } from '@/lib/zatca/map-invoice-to-zatca'
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
 * Simplified (B2C) invoices only: embed Phase-2 QR into signed XML, then REPORTING.
 * Must not use library `submitInvoice` — that signs without `qrData` and never
 * inserts KSA-14 into the XML ZATCA validates (QRCODE_INVALID / BR-KSA-27).
 *
 * @param {import('@talha7k/zatca').InvoiceData} zatcaDocument
 * @param {{
 *   privateKeyPem: string
 *   certificatePem: string
 *   certificateSignature: string
 *   credentials: import('@talha7k/zatca').ZatcaCredentials
 *   hashChainState?: import('@talha7k/zatca').HashChainState
 *   environment?: string | null
 *   onStage?: (stage: string) => void
 * }} options
 */
async function submitSimplifiedInvoice(zatcaDocument, options) {
  const xml = generateInvoiceXml(zatcaDocument)
  options.onStage?.('xml_generated')

  const { signedXml, invoiceHash } = signInvoice({
    xml,
    privateKeyPem: options.privateKeyPem,
    certificatePem: options.certificatePem,
    qrData: {
      sellerName: zatcaDocument.supplier.nameAr,
      vatNumber: zatcaDocument.supplier.vatNumber,
      timestamp: extractInvoiceTimestamp(xml),
      totalWithVat: zatcaDocument.payableAmount.toFixed(2),
      vatTotal: zatcaDocument.taxAmount.toFixed(2),
      certificateSignature: options.certificateSignature,
    },
  })
  options.onStage?.('signed')

  const qrCodeBase64 = extractQrTlvBase64FromInvoiceXml(signedXml)
  if (!qrCodeBase64) {
    throw new Error('Signed invoice XML is missing embedded ZATCA QR payload')
  }

  const client = new ZatcaApiClient(getZatcaApiConfig(options.environment))
  options.onStage?.('submitting')

  const zatcaResult = await client.submitForReporting(options.credentials, {
    invoiceHash,
    uuid: zatcaDocument.uuid,
    invoice: Buffer.from(signedXml).toString('base64'),
  })
  options.onStage?.('zatca_responded')

  /** @type {import('@talha7k/zatca').HashChainState | undefined} */
  let newHashChainState
  if (zatcaResult.success) {
    newHashChainState = {
      lastHash: invoiceHash,
      lastUuid: zatcaDocument.uuid,
      counter: (options.hashChainState?.counter ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    }
  }

  return {
    success: zatcaResult.success,
    signedXml,
    invoiceHash,
    qrCodeBase64,
    zatcaResult,
    newHashChainState,
  }
}

/**
 * Sign + report a stored Simplified POS invoice to ZATCA.
 * Always uses reporting (never clearance) — this app only issues B2C invoices.
 *
 * @param {import('@/generated/prisma/client').Invoice & {
 *   lines: import('@/generated/prisma/client').InvoiceLine[]
 * }} invoice
 * @param {import('@/generated/prisma/client').ZatcaDevice} device
 * @param {(stage: string) => void} [onStage]
 * @param {string | null | undefined} [environmentOverride]
 */
export async function submitStoredInvoiceToZatca(
  invoice,
  device,
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

  assertInvoiceReadyForZatcaSubmit(invoice)

  const zatcaDocument = mapStoredInvoiceToZatcaDocument(invoice, {
    invoiceCounter: nextCounter,
    previousInvoiceHash: previousHash,
    sellerVatNumber: authVatNumber,
    environment: env,
  })

  const credentials = {
    binarySecurityToken: device.productionCsid,
    secret: productionSecret,
  }
  const hashChainState = {
    lastHash: previousHash,
    lastUuid: '',
    counter: device.invoiceCounter,
    updatedAt: device.updatedAt.toISOString(),
  }

  const result = await submitSimplifiedInvoice(zatcaDocument, {
    privateKeyPem,
    certificatePem,
    certificateSignature,
    credentials,
    hashChainState,
    environment: env,
    onStage,
  })

  if (!result.success) {
    throw new Error(
      `ZATCA submission rejected: ${formatZatcaSubmitRejection(result.zatcaResult)}`,
    )
  }

  return {
    ...result,
    zatcaUuid: zatcaDocument.uuid,
    submissionType: /** @type {const} */ ('reporting'),
  }
}
