const { randomUUID, createPublicKey, X509Certificate, createDecipheriv, createHash } =
  require('node:crypto')
const {
  asCertificatePem,
  DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH,
  extractCertificateSignature,
  extractInvoiceTimestamp,
  extractInvoiceUuid,
  generateInvoiceXml,
  signInvoice,
  normalizeZatcaBuildingNumber,
  normalizeZatcaPostalCode,
} = require('@talha7k/zatca')

const { computeLineAmounts, parseMoney } = require('../pos/money.cjs')

const ZATCA_SANDBOX_DUMMY_VAT = '300000000000003'

/**
 * @param {string | null | undefined} xml
 */
function extractQrTlvBase64FromInvoiceXml(xml) {
  if (!xml?.trim()) return null

  const match = xml.match(
    /<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)<\/cbc:EmbeddedDocumentBinaryObject>/,
  )

  const payload = match?.[1]?.trim()
  return payload || null
}

function getMasterKey() {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret) {
    throw new Error('AUTH_SECRET is required to decrypt ZATCA keys')
  }
  return createHash('sha256').update(`zatca:${secret}`).digest()
}

/** @param {string} payload */
function decryptZatcaSecret(payload) {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted ZATCA payload')
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getMasterKey(),
    Buffer.from(ivB64, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return (
    decipher.update(Buffer.from(dataB64, 'base64url'), undefined, 'utf8') +
    decipher.final('utf8')
  )
}

/**
 * @param {unknown} secrets
 */
function resolvePrivateKeyPem(secrets) {
  if (secrets?.privateKeyPem?.trim()) {
    return String(secrets.privateKeyPem).trim()
  }
  if (secrets?.privateKeyEnc?.trim() && process.env.AUTH_SECRET?.trim()) {
    return decryptZatcaSecret(String(secrets.privateKeyEnc).trim())
  }
  throw new Error('ZATCA private key is missing')
}

/**
 * @param {string | null | undefined} raw
 */
function normalizeZatcaEnvironment(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (v === 'simulation' || v === 'production') return v
  return 'sandbox'
}

function getZatcaEnvironment(override) {
  return normalizeZatcaEnvironment(override ?? process.env.ZATCA_ENV)
}

/** @param {string | null | undefined} vat */
function isValidZatcaVatNumber(vat) {
  return /^3\d{13}3$/.test(String(vat ?? '').replace(/\D/g, ''))
}

/** @param {string | null | undefined} vat */
function normalizeSandboxVat(vat) {
  const v = String(vat ?? '').replace(/\D/g, '')
  return isValidZatcaVatNumber(v) ? v : ZATCA_SANDBOX_DUMMY_VAT
}

/**
 * @param {string} certificateRaw
 */
function extractVatFromZatcaCertificate(certificateRaw) {
  if (!certificateRaw?.trim()) return null
  try {
    const cert = new X509Certificate(asCertificatePem(certificateRaw))
    const cn = cert.subject.match(/CN=([^,\n]+)/)?.[1]?.trim() ?? ''
    const segments = cn.split('-')
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const digits = segments[i].replace(/\D/g, '')
      if (isValidZatcaVatNumber(digits)) return digits
    }
    const subjectDigits = cert.subject.replace(/\D/g, '')
    const match = subjectDigits.match(/3\d{13}3/)
    return match?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * @param {string} certificateRaw
 * @param {string} privateKeyPem
 */
function zatcaCertificateMatchesPrivateKey(certificateRaw, privateKeyPem) {
  if (!certificateRaw?.trim() || !privateKeyPem?.trim()) return false
  try {
    const certificatePem = asCertificatePem(certificateRaw)
    const privateSpki = Buffer.from(
      createPublicKey(privateKeyPem).export({ type: 'spki', format: 'der' }),
    ).toString('base64')
    const certificateSpki = Buffer.from(
      new X509Certificate(certificatePem).publicKey.export({
        type: 'spki',
        format: 'der',
      }),
    ).toString('base64')
    return privateSpki === certificateSpki
  } catch {
    return false
  }
}

/**
 * @param {{ productionCsid?: string, complianceCsid?: string }} device
 * @param {string} privateKeyPem
 * @param {string | null | undefined} environment
 */
function resolveZatcaSigningCertificateRaw(device, privateKeyPem, environment) {
  const env = normalizeZatcaEnvironment(environment ?? device?.environment)
  const productionRaw = device.productionCsid?.trim() || ''
  const complianceRaw = device.complianceCsid?.trim() || ''

  if (productionRaw && zatcaCertificateMatchesPrivateKey(productionRaw, privateKeyPem)) {
    return productionRaw
  }

  if (env === 'production') {
    if (productionRaw) {
      throw new Error(
        'Your production ZATCA certificate does not match your stored credentials.',
      )
    }
    return null
  }

  if (
    complianceRaw &&
    zatcaCertificateMatchesPrivateKey(complianceRaw, privateKeyPem)
  ) {
    return complianceRaw
  }

  return null
}

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100
}

/** @param {Date} date */
function riyadhIssueParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  /** @type {Record<string, string>} */
  const parts = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value
  }
  return {
    issueDate: `${parts.year}-${parts.month}-${parts.day}`,
    issueTime: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}

/** @param {{ vatPreset: string }} line */
function vatPresetToTax(line) {
  if (line.vatPreset === 'zero') return { taxCategoryId: 'Z', taxPercent: 0 }
  if (line.vatPreset === 'exempt') return { taxCategoryId: 'E', taxPercent: 0 }
  return { taxCategoryId: 'S', taxPercent: 15 }
}

/**
 * @param {Array<{ quantity: number, unitPrice: string, discount?: string, vatPreset: string }>} lines
 */
function buildTaxSubtotals(lines) {
  /** @type {Map<string, { taxableAmount: number, taxAmount: number, percent: number, taxCategoryId: string }>} */
  const groups = new Map()
  for (const line of lines) {
    const amounts = computeLineAmounts(line)
    const { taxCategoryId, taxPercent } = vatPresetToTax(line)
    const key = `${taxCategoryId}:${taxPercent}`
    const prev = groups.get(key) ?? {
      taxableAmount: 0,
      taxAmount: 0,
      percent: taxPercent,
      taxCategoryId,
    }
    prev.taxableAmount += amounts.taxable
    prev.taxAmount += amounts.vatAmount
    groups.set(key, prev)
  }
  return [...groups.values()].map((g) => ({
    taxableAmount: round2(g.taxableAmount),
    taxAmount: round2(g.taxAmount),
    percent: g.percent,
    taxCategoryId: g.taxCategoryId,
  }))
}

/**
 * @param {Record<string, unknown>} fields
 */
function buildPostalAddressFromFields(fields) {
  const street = String(
    fields.street ?? fields.streetAr ?? fields.addressAr ?? '',
  ).trim()
  const building = String(fields.building ?? fields.buildingNumber ?? '').trim()
  const district = String(fields.district ?? fields.districtAr ?? '').trim()
  const city = String(fields.city ?? fields.cityAr ?? '').trim()
  const postalCode = String(fields.postalCode ?? '').trim()
  const countryCode = String(fields.countryCode ?? 'SA').trim() || 'SA'

  return {
    street,
    building: normalizeZatcaBuildingNumber(building),
    district,
    city,
    postalCode: normalizeZatcaPostalCode(postalCode),
    countryCode,
  }
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Array<Record<string, unknown>>} lines
 * @param {{
 *   invoiceCounter: number
 *   previousInvoiceHash: string
 *   sellerVatNumber?: string | null
 *   environment?: string | null
 * }} chain
 */
function mapInvoiceToZatcaDocument(invoice, lines, chain) {
  const sorted = [...lines].sort(
    (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
  )
  const env = getZatcaEnvironment(chain.environment)
  const isSandbox = env === 'sandbox'
  const sellerVat = isSandbox
    ? chain.sellerVatNumber?.trim() ||
      normalizeSandboxVat(String(invoice.sellerVatNumber ?? ''))
    : String(invoice.sellerVatNumber ?? '').replace(/\D/g, '')

  const invoiceDate =
    invoice.invoiceDate instanceof Date
      ? invoice.invoiceDate
      : new Date(String(invoice.invoiceDate ?? Date.now()))
  const { issueDate, issueTime } = riyadhIssueParts(invoiceDate)
  const uuid =
    (invoice.xmlPayload && extractInvoiceUuid(String(invoice.xmlPayload))) ||
    randomUUID()

  let taxExclusive = 0
  let taxTotal = 0

  const invoiceLines = sorted.map((line, index) => {
    const amounts = computeLineAmounts(line)
    const { taxCategoryId, taxPercent } = vatPresetToTax(line)
    taxExclusive += amounts.taxable
    taxTotal += amounts.vatAmount
    const itemName = String(line.nameEn || line.nameAr || '')
      .trim()
      .slice(0, 200)
    return {
      id: index + 1,
      quantity: amounts.quantity,
      unitCode: 'C62',
      lineExtensionAmount: round2(amounts.taxable),
      taxAmount: round2(amounts.vatAmount),
      itemName,
      taxCategoryId,
      taxPercent,
      priceAmount: round2(parseMoney(line.unitPrice)),
      ...(amounts.discount > 0
        ? {
            allowanceCharges: [
              {
                chargeIndicator: false,
                reason: 'Discount',
                amount: round2(amounts.discount),
              },
            ],
          }
        : {}),
    }
  })

  const taxExclusiveR = round2(taxExclusive)
  const taxTotalR = round2(taxTotal)
  const grandTotalR = round2(taxExclusiveR + taxTotalR)

  return {
    invoiceNumber: String(invoice.invoiceNumber),
    uuid,
    issueDate,
    issueTime,
    invoiceTypeCode: '388',
    invoiceTypeCodeName: '0200000',
    profileId: 'reporting:1.0',
    currencyCode: 'SAR',
    invoiceCounter: chain.invoiceCounter,
    previousInvoiceHash:
      chain.previousInvoiceHash || DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH,
    supplier: {
      nameAr: String(invoice.sellerCompanyNameAr ?? '').trim(),
      nameEn: String(
        invoice.sellerCompanyNameEn || invoice.sellerCompanyNameAr || '',
      ).trim(),
      vatNumber: sellerVat,
      crNumber: String(invoice.sellerCrNumber ?? '').trim(),
      address: buildPostalAddressFromFields({
        streetAr: invoice.sellerStreetAr,
        addressAr: invoice.sellerAddressAr,
        buildingNumber: invoice.sellerBuildingNumber,
        districtAr: invoice.sellerDistrictAr,
        cityAr: invoice.sellerCityAr,
        postalCode: invoice.sellerPostalCode,
        countryCode: invoice.sellerCountryCode,
      }),
    },
    lineExtensionAmount: taxExclusiveR,
    taxExclusiveAmount: taxExclusiveR,
    taxInclusiveAmount: grandTotalR,
    payableAmount: grandTotalR,
    taxAmount: taxTotalR,
    taxSubtotals: buildTaxSubtotals(sorted),
    invoiceLines,
  }
}

/**
 * @param {{
 *   invoice: Record<string, unknown>
 *   lines: Array<Record<string, unknown>>
 *   deviceMeta?: unknown
 *   secrets: {
 *     privateKeyPem?: string
 *     privateKeyEnc?: string
 *     productionCsid?: string
 *     productionSecret?: string
 *     complianceCsid?: string
 *   }
 *   tip: { invoiceCounter: number, lastInvoiceHash?: string, environment?: string }
 * }} input
 */
function signOfflineInvoice(input) {
  const privateKeyPem = resolvePrivateKeyPem(input.secrets)
  const env = getZatcaEnvironment(
    input.tip.environment ?? input.secrets.environment,
  )

  const device = {
    productionCsid: input.secrets.productionCsid,
    complianceCsid: input.secrets.complianceCsid,
    environment: env,
  }

  const signingRaw = resolveZatcaSigningCertificateRaw(device, privateKeyPem, env)
  if (!signingRaw) {
    throw new Error(
      'No ZATCA certificate matches the stored private key. Re-run ZATCA onboarding.',
    )
  }
  const certificatePem = asCertificatePem(signingRaw)
  const authVatNumber = extractVatFromZatcaCertificate(device.productionCsid)

  let certificateSignature
  try {
    certificateSignature = extractCertificateSignature(certificatePem)
  } catch {
    throw new Error('Could not read the ZATCA certificate signature')
  }

  const nextCounter = Number(input.tip.invoiceCounter) + 1
  const previousHash =
    String(input.tip.lastInvoiceHash ?? '').trim() ||
    DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH

  const zatcaDocument = mapInvoiceToZatcaDocument(input.invoice, input.lines, {
    invoiceCounter: nextCounter,
    previousInvoiceHash: previousHash,
    sellerVatNumber: authVatNumber,
    environment: env,
  })

  const xml = generateInvoiceXml(zatcaDocument)
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

  const qrCodeBase64 = extractQrTlvBase64FromInvoiceXml(signedXml)
  if (!qrCodeBase64) {
    throw new Error('Signed invoice XML is missing embedded ZATCA QR payload')
  }

  return {
    signedXml,
    invoiceHash,
    qrCodeBase64,
    zatcaUuid: zatcaDocument.uuid,
    nextCounter,
    previousHash,
    pih: previousHash,
  }
}

module.exports = {
  extractQrTlvBase64FromInvoiceXml,
  signOfflineInvoice,
}
