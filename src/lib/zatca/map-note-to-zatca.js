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
 * Map a stored CreditNote or DebitNote to @talha7k/zatca CreditNoteData.
 * Always Simplified / reporting (B2C-only POS — no buyer party).
 *
 * @param {{
 *   creditNoteNumber?: string
 *   debitNoteNumber?: string
 *   noteDate: Date
 *   xmlPayload?: string | null
 *   reasonAr: string
 *   invoiceNumberSnapshot: string
 *   invoiceUuidSnapshot: string
 *   invoiceIssueDateSnapshot?: Date | null
 *   sellerCompanyNameAr: string
 *   sellerCompanyNameEn?: string | null
 *   sellerVatNumber: string
 *   sellerCrNumber: string
 *   sellerAddressAr: string
 *   sellerStreetAr?: string
 *   sellerBuildingNumber?: string
 *   sellerDistrictAr?: string
 *   sellerCityAr?: string
 *   sellerPostalCode?: string
 *   sellerCountryCode?: string
 *   lines: Array<{
 *     nameAr: string
 *     nameEn?: string | null
 *     quantity: number
 *     unitPrice: string
 *     vatPreset: string
 *     sortOrder: number
 *   }>
 * }} note
 * @param {{
 *   invoiceCounter: number
 *   previousInvoiceHash: string
 *   sellerVatNumber?: string | null
 *   documentNature: 'credit' | 'debit'
 *   environment?: string | null
 * }} chain
 */
export function mapStoredNoteToZatcaDocument(note, chain) {
  const lines = [...note.lines].sort((a, b) => a.sortOrder - b.sortOrder)
  const env = getZatcaEnvironment(chain.environment)
  const isSandbox = env === 'sandbox'
  const sellerVat = isSandbox
    ? chain.sellerVatNumber?.trim() || normalizeSandboxVat(note.sellerVatNumber)
    : String(note.sellerVatNumber ?? '').replace(/\D/g, '')

  const { issueDate, issueTime } = riyadhIssueParts(note.noteDate ?? new Date())
  const uuid =
    (note.xmlPayload && extractInvoiceUuid(note.xmlPayload)) || randomUUID()

  let taxExclusive = 0
  let taxTotal = 0

  const invoiceLines = lines.map((line, index) => {
    const amounts = computeLineAmounts({ ...line, discount: '0' })
    const { taxCategoryId, taxPercent } = vatPresetToTax(line)
    taxExclusive += amounts.taxable
    taxTotal += amounts.vatAmount
    const itemName = (line.nameEn || line.nameAr || '').trim().slice(0, 200)
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
    }
  })

  const taxExclusiveR = round2(taxExclusive)
  const taxTotalR = round2(taxTotal)
  const grandTotalR = round2(taxExclusiveR + taxTotalR)

  const linesForTax = lines.map((l) => ({ ...l, discount: '0' }))

  /** @type {import('@talha7k/zatca').CreditNoteData} */
  const document = {
    invoiceNumber: note.creditNoteNumber || note.debitNoteNumber || '',
    uuid,
    issueDate,
    issueTime,
    invoiceTypeCode: chain.documentNature === 'credit' ? '381' : '383',
    invoiceTypeCodeName: '0200000',
    profileId: 'reporting:1.0',
    currencyCode: 'SAR',
    invoiceCounter: chain.invoiceCounter,
    previousInvoiceHash:
      chain.previousInvoiceHash || DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH,
    originalInvoiceNumber: note.invoiceNumberSnapshot,
    originalInvoiceUuid: note.invoiceUuidSnapshot || '',
    originalInvoiceDate: note.invoiceIssueDateSnapshot
      ? riyadhIssueParts(note.invoiceIssueDateSnapshot).issueDate
      : '',
    reason: String(note.reasonAr ?? '').trim(),
    supplier: {
      nameAr: note.sellerCompanyNameAr.trim(),
      nameEn: (note.sellerCompanyNameEn || note.sellerCompanyNameAr).trim(),
      vatNumber: sellerVat,
      crNumber: note.sellerCrNumber.trim(),
      address: buildPostalAddressFromFields({
        streetAr: note.sellerStreetAr,
        addressAr: note.sellerAddressAr,
        buildingNumber: note.sellerBuildingNumber,
        districtAr: note.sellerDistrictAr,
        cityAr: note.sellerCityAr,
        postalCode: note.sellerPostalCode,
        countryCode: note.sellerCountryCode,
      }),
    },
    lineExtensionAmount: taxExclusiveR,
    taxExclusiveAmount: taxExclusiveR,
    taxInclusiveAmount: grandTotalR,
    payableAmount: grandTotalR,
    taxAmount: taxTotalR,
    taxSubtotals: buildTaxSubtotals(linesForTax),
    invoiceLines,
  }

  return document
}
