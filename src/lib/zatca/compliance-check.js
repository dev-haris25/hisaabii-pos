import {
  asCertificatePem,
  buildComplianceInvoiceXml,
  extractCertificateSignature,
  extractInvoiceTimestamp,
  extractXmlValue,
  signComplianceInvoice,
  signInvoice,
} from '@talha7k/zatca'

import { normalizeSandboxBuyerVat } from '@/lib/zatca/env'

/**
 * Synthetic buyer used only for ZATCA sandbox STANDARD_* compliance checks during
 * CSID onboarding — not for live invoice/credit-note submission. ZATCA expects a
 * distinct standard buyer VAT in that test flow; see normalizeSandboxBuyerVat.
 *
 * @param {import('@talha7k/zatca').SupplierInfo} supplier
 */
function sandboxStandardCustomer(supplier) {
  return {
    name: 'Compliance Test Customer',
    vatNumber: normalizeSandboxBuyerVat(null, supplier.vatNumber),
    address: { ...supplier.address },
  }
}

/**
 * `@talha7k/zatca`'s `generateInvoiceXml` (used for INVOICE + DEBIT_NOTE checks)
 * emits an empty `<cac:AccountingCustomerParty></cac:AccountingCustomerParty>`
 * when no customer is given — required by ZATCA's UBL 2.1 schema even for
 * anonymous Simplified (B2C) documents. `generateCreditNoteXml` (CREDIT_NOTE
 * checks) has no such fallback and omits the element entirely when
 * `customer` is unset, which fails schema validation with:
 *   "Invalid content ... PaymentMeans. One of AccountingCustomerParty is
 *   expected." (cvc-complex-type.2.4.a — wrong/missing element order).
 * This patches the element back in when missing, matching the invoice
 * generator's own behavior.
 *
 * @param {string} xml
 */
function ensureAccountingCustomerPartyPresent(xml) {
  if (xml.includes('<cac:AccountingCustomerParty>')) return xml
  return xml.replace(
    /(<\/cac:AccountingSupplierParty>)/,
    `$1\n\n  <cac:AccountingCustomerParty>\n  </cac:AccountingCustomerParty>`,
  )
}

/**
 * ZATCA sandbox compliance checks require reporting:1.0 (BT-23) even for standard
 * invoices, but @talha7k/zatca uses clearance:1.0 for STANDARD_* types.
 *
 * Also patches in the empty `AccountingCustomerParty` for *_CREDIT_NOTE checks
 * missing a customer (see {@link ensureAccountingCustomerPartyPresent}).
 *
 * @param {import('@talha7k/zatca').SignComplianceInvoiceInput} input
 * @param {{ patchProfileIdToReporting?: boolean }} [options]
 */
function signPatchedComplianceInvoice(input, options = {}) {
  const { patchProfileIdToReporting = false } = options
  const certificatePem = asCertificatePem(input.certificatePem)
  const built = buildComplianceInvoiceXml({
    checkType: input.checkType,
    supplier: input.supplier,
    customer: input.customer,
    invoiceCounter: input.invoiceCounter,
    previousInvoiceHash: input.previousInvoiceHash,
  })

  let invoiceXml = built.invoiceXml
  if (patchProfileIdToReporting) {
    invoiceXml = invoiceXml.replace(
      /<cbc:ProfileID>clearance:1\.0<\/cbc:ProfileID>/,
      '<cbc:ProfileID>reporting:1.0</cbc:ProfileID>',
    )
  }
  if (input.checkType.endsWith('CREDIT_NOTE')) {
    invoiceXml = ensureAccountingCustomerPartyPresent(invoiceXml)
  }

  let certificateSignature = 'AA=='
  try {
    certificateSignature = extractCertificateSignature(certificatePem)
  } catch {
    // QR tag 9 placeholder — ZATCA sandbox accepts this for compliance checks.
  }

  const signed = signInvoice({
    xml: invoiceXml,
    privateKeyPem: input.privateKeyPem,
    certificatePem,
    qrData: {
      sellerName: input.supplier.nameAr,
      vatNumber: input.supplier.vatNumber,
      timestamp: extractInvoiceTimestamp(invoiceXml),
      totalWithVat:
        extractXmlValue(invoiceXml, 'TaxInclusiveAmount') ?? '115.00',
      vatTotal: extractXmlValue(invoiceXml, 'TaxAmount') ?? '15.00',
      certificateSignature,
    },
  })

  const uuid = built.uuid ?? input.uuid
  if (!uuid) {
    throw new Error('Compliance invoice XML is missing cbc:UUID')
  }

  return {
    checkType: input.checkType,
    invoiceXml,
    signedXml: signed.signedXml,
    invoiceHash: signed.invoiceHash,
    uuid,
    base64SignedXml: Buffer.from(signed.signedXml).toString('base64'),
  }
}

/**
 * @param {import('@talha7k/zatca').SignComplianceInvoiceInput} input
 */
export function signSandboxComplianceInvoice(input) {
  const base = {
    ...input,
    invoiceCounter: input.invoiceCounter ?? 1,
  }

  if (input.checkType.startsWith('STANDARD')) {
    return signPatchedComplianceInvoice(
      {
        ...base,
        customer: input.customer ?? sandboxStandardCustomer(input.supplier),
      },
      { patchProfileIdToReporting: true },
    )
  }

  // SIMPLIFIED_CREDIT_NOTE has no customer (anonymous B2C) and hits the
  // library's generateCreditNoteXml bug above — needs the same patch, but
  // no profileId patch (Simplified already builds with reporting:1.0).
  if (input.checkType === 'SIMPLIFIED_CREDIT_NOTE') {
    return signPatchedComplianceInvoice(base)
  }

  return signComplianceInvoice(base)
}
