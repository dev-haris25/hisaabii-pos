import { randomUUID } from 'node:crypto'

import {
  DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH,
  extractInvoiceUuid,
} from '@talha7k/zatca'

import { computeLineAmounts, parseMoney } from '@/lib/invoices/invoice-compute-totals'
import { getZatcaEnvironment, normalizeSandboxVat } from '@/lib/zatca/env'
import { buildPostalAddressFromFields } from '@/lib/zatca/postal-address-from-fields'
import {
  buildTaxSubtotals,
  round2,
  riyadhIssueParts,
  vatPresetToTax,
} from '@/lib/zatca/zatca-document-shared'

/**
 * Map a stored POS invoice to the @talha7k/zatca InvoiceData shape.
 * Always Simplified / reporting — this app never issues Standard (B2B) invoices,
 * so there is no customer party and profileId is always reporting:1.0.
 *
 * @param {import('@/generated/prisma/client').Invoice & {
 *   lines: import('@/generated/prisma/client').InvoiceLine[]
 * }} invoice
 * @param {{
 *   invoiceCounter: number
 *   previousInvoiceHash: string
 *   sellerVatNumber?: string | null
 *   environment?: string | null
 * }} chain
 */
export function mapStoredInvoiceToZatcaDocument(invoice, chain) {
  const lines = [...invoice.lines].sort((a, b) => a.sortOrder - b.sortOrder)
  const env = getZatcaEnvironment(chain.environment)
  const isSandbox = env === 'sandbox'
  const sellerVat = isSandbox
    ? chain.sellerVatNumber?.trim() || normalizeSandboxVat(invoice.sellerVatNumber)
    : String(invoice.sellerVatNumber ?? '').replace(/\D/g, '')

  const { issueDate, issueTime } = riyadhIssueParts(invoice.invoiceDate)
  const uuid =
    (invoice.xmlPayload && extractInvoiceUuid(invoice.xmlPayload)) || randomUUID()

  let taxExclusive = 0
  let taxTotal = 0

  const invoiceLines = lines.map((line, index) => {
    const amounts = computeLineAmounts(line)
    const { taxCategoryId, taxPercent } = vatPresetToTax(line)
    taxExclusive += amounts.taxable
    taxTotal += amounts.vatAmount
    const itemName = (line.nameEn || line.nameAr || '').trim().slice(0, 200)
    // Line net (lineExtensionAmount) is AFTER line discount. UBL/ZATCA:
    // qty × price − line allowances = line net. Do NOT also set document
    // allowanceTotalAmount for these — that field is only for document-level
    // allowances and would double-count (BR-CO-15 / monetary total mismatch).
    return {
      id: index + 1,
      quantity: amounts.quantity,
      unitCode: 'C62',
      lineExtensionAmount: round2(amounts.taxable),
      taxAmount: round2(amounts.vatAmount),
      itemName,
      taxCategoryId: /** @type {import('@talha7k/zatca').TaxCategoryId} */ (
        taxCategoryId
      ),
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

  /** @type {import('@talha7k/zatca').InvoiceData} */
  const document = {
    invoiceNumber: invoice.invoiceNumber,
    uuid,
    issueDate,
    issueTime,
    invoiceTypeCode: '388',
    // Simplified tax invoice subtype (B2C)
    invoiceTypeCodeName: '0200000',
    profileId: 'reporting:1.0',
    currencyCode: 'SAR',
    invoiceCounter: chain.invoiceCounter,
    previousInvoiceHash:
      chain.previousInvoiceHash || DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH,
    supplier: {
      nameAr: invoice.sellerCompanyNameAr.trim(),
      nameEn: (invoice.sellerCompanyNameEn || invoice.sellerCompanyNameAr).trim(),
      vatNumber: sellerVat,
      crNumber: invoice.sellerCrNumber.trim(),
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
    taxSubtotals: buildTaxSubtotals(lines),
    invoiceLines,
  }

  return document
}
