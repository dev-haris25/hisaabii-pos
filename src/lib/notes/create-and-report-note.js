import { extractInvoiceUuid } from '@talha7k/zatca'

import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  computeInvoiceTotals,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { allocateCreditNoteNumber, allocateDebitNoteNumber } from '@/lib/notes/allocate-note-number'
import {
  assertCreditWithinBalance,
  computeInvoiceOutstanding,
  noteTaxableCents,
} from '@/lib/notes/invoice-outstanding'
import { loadInvoiceNotes, lockInvoiceRow } from '@/lib/notes/load-invoice-outstanding'
import { voidInvoiceIfFullyCredited } from '@/lib/notes/void-invoice'
import { emitZatcaReportFailed } from '@/lib/notifications/emit-zatca-report-failed'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'
import { reconcileLoyaltyPointsForInvoice } from '@/lib/loyalty/reconcile-loyalty-points-for-invoice'
import { prisma } from '@/lib/prisma'
import { reportDocumentToZatca } from '@/lib/zatca/zatca-document-chain'

/**
 * Seller snapshot fields copied from a profile or invoice onto a note.
 * @param {{
 *   companyNameAr?: string
 *   companyNameEn?: string | null
 *   vatNumber?: string
 *   crNumber?: string
 *   addressAr?: string
 *   addressEn?: string | null
 *   streetAr?: string
 *   streetEn?: string
 *   districtAr?: string
 *   districtEn?: string
 *   cityAr?: string
 *   cityEn?: string
 *   buildingNumber?: string
 *   secondaryNumber?: string
 *   postalCode?: string
 *   shortAddress?: string
 *   email?: string | null
 *   phone?: string | null
 *   sellerCompanyNameAr?: string
 *   sellerCompanyNameEn?: string | null
 *   sellerVatNumber?: string
 *   sellerCrNumber?: string
 *   sellerAddressAr?: string
 *   sellerAddressEn?: string | null
 *   sellerStreetAr?: string
 *   sellerStreetEn?: string
 *   sellerDistrictAr?: string
 *   sellerDistrictEn?: string
 *   sellerCityAr?: string
 *   sellerCityEn?: string
 *   sellerBuildingNumber?: string
 *   sellerSecondaryNumber?: string
 *   sellerPostalCode?: string
 *   sellerShortAddress?: string
 *   sellerCountryCode?: string
 *   sellerEmail?: string | null
 *   sellerPhone?: string | null
 * }} source
 */
export function sellerSnapshotFromSource(source) {
  return {
    sellerCompanyNameAr:
      source.sellerCompanyNameAr ?? source.companyNameAr ?? '',
    sellerCompanyNameEn:
      source.sellerCompanyNameEn ?? source.companyNameEn ?? null,
    sellerVatNumber: source.sellerVatNumber ?? source.vatNumber ?? '',
    sellerCrNumber: source.sellerCrNumber ?? source.crNumber ?? '',
    sellerAddressAr: source.sellerAddressAr ?? source.addressAr ?? '',
    sellerAddressEn: source.sellerAddressEn ?? source.addressEn ?? null,
    sellerStreetAr: source.sellerStreetAr ?? source.streetAr ?? '',
    sellerStreetEn: source.sellerStreetEn ?? source.streetEn ?? '',
    sellerDistrictAr: source.sellerDistrictAr ?? source.districtAr ?? '',
    sellerDistrictEn: source.sellerDistrictEn ?? source.districtEn ?? '',
    sellerCityAr: source.sellerCityAr ?? source.cityAr ?? '',
    sellerCityEn: source.sellerCityEn ?? source.cityEn ?? '',
    sellerBuildingNumber:
      source.sellerBuildingNumber ?? source.buildingNumber ?? '',
    sellerSecondaryNumber:
      source.sellerSecondaryNumber ?? source.secondaryNumber ?? '',
    sellerPostalCode: source.sellerPostalCode ?? source.postalCode ?? '',
    sellerShortAddress: source.sellerShortAddress ?? source.shortAddress ?? '',
    sellerCountryCode: source.sellerCountryCode ?? 'SA',
    sellerEmail:
      source.sellerEmail ??
      (typeof source.email === 'string' ? source.email.trim() || null : null),
    sellerPhone:
      source.sellerPhone ??
      (typeof source.phone === 'string' ? source.phone.trim() || null : null),
  }
}

/**
 * @param {string | null | undefined} xmlPayload
 */
export function resolveOriginalInvoiceUuid(xmlPayload) {
  if (!xmlPayload?.trim()) return ''
  try {
    return extractInvoiceUuid(xmlPayload) || ''
  } catch {
    return ''
  }
}

/** @param {string} code @param {string} message */
function noteError(code, message) {
  return Object.assign(new Error(message), { code })
}

/**
 * Create a credit / debit note for an invoice, then report it to ZATCA.
 *
 * Inside one transaction holding a row lock on the invoice: re-read the
 * invoice and its notes, refuse while another note is not yet reported,
 * compute the outstanding state, let `plan` build the note lines from it,
 * apply the credit cap and create the note (credit lines keep their invoice
 * line link + units covered). Reporting runs after the commit; on ZATCA
 * failure the note stays `failed` (rules.md #19). A credit note accepted by
 * ZATCA voids the invoice once nothing is left outstanding.
 *
 * @param {{
 *   profileId: string
 *   staffId: string
 *   invoiceId: string
 *   reasonAr: string
 *   reasonEn?: string | null
 *   plan: (outstanding: import('@/lib/notes/invoice-outstanding').InvoiceOutstanding) => {
 *     documentNature: 'credit' | 'debit'
 *     noteLines: Array<{
 *       nameAr: string
 *       nameEn?: string | null
 *       quantity: number
 *       unitPrice: string
 *       vatPreset: string
 *       invoiceLineId?: string
 *       unitsCovered?: number
 *     }>
 *   }
 * }} opts
 */
export async function createAndReportNote(opts) {
  const { profileId, staffId, invoiceId, reasonAr, reasonEn, plan } = opts

  if (!String(reasonAr ?? '').trim()) {
    throw noteError('NOTE_REASON_REQUIRED', 'Arabic reason is required')
  }

  const created = await prisma.$transaction(async (tx) => {
    if (!(await lockInvoiceRow(tx, invoiceId, profileId))) {
      throw noteError('NOT_FOUND', 'Invoice not found')
    }
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, businessProfileId: profileId, ...WHERE_NOT_DELETED },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!invoice) throw noteError('NOT_FOUND', 'Invoice not found')
    if (invoice.status === 'voided') {
      throw noteError('INVOICE_VOIDED', 'Invoice is already cancelled')
    }
    if (invoice.zatcaStatus !== 'reported' && invoice.zatcaStatus !== 'cleared') {
      throw noteError('INVOICE_NOT_REPORTED', 'Report the invoice to ZATCA first')
    }

    const { creditNotes, debitNotes } = await loadInvoiceNotes(tx, invoice.id)
    const outstanding = computeInvoiceOutstanding({
      invoiceLines: invoice.lines,
      creditNotes,
      debitNotes,
    })
    if (outstanding.pendingNoteCount > 0) {
      throw noteError(
        'NOTE_PENDING_FOR_INVOICE',
        'A credit or debit note for this invoice is not reported to ZATCA yet',
      )
    }

    const { documentNature, noteLines } = plan(outstanding)
    if (noteLines.length === 0) {
      throw noteError('NOTE_AMOUNT_INVALID', 'Note amount must be greater than zero')
    }
    const totals = computeInvoiceTotals(
      noteLines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: '0',
        vatPreset: l.vatPreset,
      })),
    )
    if (parseMoney(totals.grandTotal) <= 0) {
      throw noteError('NOTE_AMOUNT_INVALID', 'Note amount must be greater than zero')
    }
    if (documentNature === 'credit') {
      assertCreditWithinBalance(outstanding, noteTaxableCents(noteLines))
    }

    const invoiceUuid = resolveOriginalInvoiceUuid(invoice.xmlPayload)
    if (!invoiceUuid) {
      throw noteError(
        'INVOICE_NOT_REPORTED',
        'Original invoice has no ZATCA UUID — report it first',
      )
    }

    const seller = sellerSnapshotFromSource(invoice)
    const lineCreates = noteLines.map((l, idx) => {
      const a = totals.perLine[idx]
      /** @type {Record<string, unknown>} */
      const row = {
        nameAr: l.nameAr,
        nameEn: l.nameEn ?? null,
        quantity: a.quantity,
        unitPrice: l.unitPrice,
        vatPreset: /** @type {import('@/generated/prisma/client').VatPreset} */ (
          l.vatPreset
        ),
        vatAmount: a.vatAmountStr,
        lineTotal: a.lineTotalStr,
        sortOrder: idx,
      }
      if (documentNature === 'credit' && l.invoiceLineId) {
        row.invoiceLineId = l.invoiceLineId
        row.unitsCovered = l.unitsCovered ?? null
      }
      return row
    })
    const header = {
      businessProfileId: profileId,
      invoiceId: invoice.id,
      invoiceNumberSnapshot: invoice.invoiceNumber,
      invoiceUuidSnapshot: invoiceUuid,
      invoiceIssueDateSnapshot: invoice.invoiceDate,
      reasonAr: reasonAr.trim(),
      reasonEn: reasonEn?.trim() || null,
      createdByStaffId: staffId,
      ...seller,
      subtotal: totals.subtotal,
      totalVat: totals.totalVat,
      grandTotal: totals.grandTotal,
      zatcaStatus: /** @type {const} */ ('pending'),
      lines: { create: lineCreates },
    }

    const note =
      documentNature === 'credit'
        ? await tx.creditNote.create({
            data: {
              ...header,
              creditNoteNumber: await allocateCreditNoteNumber(profileId, tx),
            },
            include: NOTE_INCLUDE,
          })
        : await tx.debitNote.create({
            data: {
              ...header,
              debitNoteNumber: await allocateDebitNoteNumber(profileId, tx),
            },
            include: NOTE_INCLUDE,
          })
    return { note, documentNature, invoice }
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

  const { note, documentNature, invoice } = created
  const noteNumber =
    documentNature === 'credit' ? note.creditNoteNumber : note.debitNoteNumber
  void notifyPosAudience({
    businessProfileId: profileId,
    audience: 'salesOps',
    type: documentNature === 'credit' ? 'credit_note_created' : 'debit_note_created',
    kind: 'salesOps',
    vars: {
      detail: `${documentNature === 'credit' ? 'Credit' : 'Debit'} note ${noteNumber} for invoice ${invoice.invoiceNumber}`,
    },
    link:
      documentNature === 'credit'
        ? `/invoices/credit-notes/${note.id}`
        : `/invoices/debit-notes/${note.id}`,
    dedupeKey: `note-created:${documentNature}:${note.id}`,
    actorUserId: staffId,
  })

  try {
    await reportDocumentToZatca({
      kind: documentNature,
      id: note.id,
      businessProfileId: profileId,
    })
  } catch (err) {
    void emitZatcaReportFailed({
      businessProfileId: profileId,
      actorUserId: staffId,
      documentKind: documentNature === 'credit' ? 'credit' : 'debit',
      documentId: note.id,
      documentNumber: noteNumber,
    })
    // The invoice is voided only after ZATCA accepts the note (also through
    // the credit note's own Report action) — leave it as is on failure.
    throw Object.assign(
      new Error(err instanceof Error ? err.message : String(err)),
      { code: 'ZATCA_ERROR', noteId: note.id, documentNature },
    )
  }

  const voided =
    documentNature === 'credit'
      ? await voidInvoiceIfFullyCredited({
          invoiceId: invoice.id,
          businessProfileId: profileId,
          actorUserId: staffId,
        })
      : false

  // Loyalty is a post-success side-effect (a void reconciles on its own).
  // Never remap failures to ZATCA_ERROR — the note already committed.
  if (!voided) {
    try {
      await reconcileLoyaltyPointsForInvoice({
        invoice,
        cashierUserId: staffId,
      })
    } catch (loyaltyErr) {
      console.error(
        '[loyalty] reconcile after note failed (document already finalized):',
        loyaltyErr instanceof Error ? loyaltyErr.message : loyaltyErr,
        { invoiceId: invoice.id, noteId: note.id, documentNature },
      )
    }
  }

  return documentNature === 'credit'
    ? prisma.creditNote.findUnique({ where: { id: note.id }, include: NOTE_INCLUDE })
    : prisma.debitNote.findUnique({ where: { id: note.id }, include: NOTE_INCLUDE })
}

const NOTE_INCLUDE = {
  lines: { orderBy: { sortOrder: /** @type {const} */ ('asc') } },
  createdByStaff: { select: { id: true, name: true } },
}
