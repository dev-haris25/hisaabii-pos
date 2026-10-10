import { extractInvoiceUuid } from '@talha7k/zatca'

import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import {
  computeInvoiceTotals,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { allocateCreditNoteNumber, allocateDebitNoteNumber } from '@/lib/notes/allocate-note-number'
import { emitZatcaReportFailed } from '@/lib/notifications/emit-zatca-report-failed'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'
import { reconcileLoyaltyPointsForInvoice } from '@/lib/loyalty/reconcile-loyalty-points-for-invoice'
import { cancelKitchenOrderForInvoice } from '@/lib/orders/sync-kitchen-order'
import { prisma } from '@/lib/prisma'
import { humanizeZatcaError } from '@/lib/zatca/humanize-zatca-error'
import { runNoteZatcaSend } from '@/lib/zatca/run-note-zatca-send'

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

/**
 * Persist a note + report to ZATCA immediately. On ZATCA failure the note stays
 * (rules.md #19) with zatcaStatus failed for manual retry.
 *
 * @param {{
 *   documentNature: 'credit' | 'debit'
 *   profileId: string
 *   staffId: string
 *   invoice: import('@/generated/prisma/client').Invoice & {
 *     lines: import('@/generated/prisma/client').InvoiceLine[]
 *   }
 *   profile: import('@/generated/prisma/client').BusinessProfile
 *   device: import('@/generated/prisma/client').ZatcaDevice
 *   reasonAr: string
 *   reasonEn?: string | null
 *   noteLines: Array<{
 *     nameAr: string
 *     nameEn?: string | null
 *     quantity: number
 *     unitPrice: string
 *     vatPreset: string
 *   }>
 *   markInvoiceVoided?: boolean
 * }} opts
 */
export async function createAndReportNote(opts) {
  const {
    documentNature,
    profileId,
    staffId,
    invoice,
    profile,
    device,
    reasonAr,
    reasonEn,
    noteLines,
    markInvoiceVoided = false,
  } = opts

  const totals = computeInvoiceTotals(
    noteLines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: '0',
      vatPreset: l.vatPreset,
    })),
  )

  if (parseMoney(totals.grandTotal) <= 0) {
    throw Object.assign(new Error('Note amount must be greater than zero'), {
      code: 'NOTE_AMOUNT_INVALID',
    })
  }

  const invoiceUuid = resolveOriginalInvoiceUuid(invoice.xmlPayload)
  if (!invoiceUuid) {
    throw Object.assign(
      new Error('Original invoice has no ZATCA UUID — report it first'),
      { code: 'INVOICE_NOT_REPORTED' },
    )
  }

  const seller = sellerSnapshotFromSource(invoice)
  const lineCreates = noteLines.map((l, idx) => {
    const a = totals.perLine[idx]
    return {
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
  })

  const note = await prisma.$transaction(async (tx) => {
    if (documentNature === 'credit') {
      const creditNoteNumber = await allocateCreditNoteNumber(profileId, tx)
      return tx.creditNote.create({
        data: {
          businessProfileId: profileId,
          creditNoteNumber,
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
          zatcaStatus: 'pending',
          lines: { create: lineCreates },
        },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
          createdByStaff: { select: { id: true, name: true } },
        },
      })
    }

    const debitNoteNumber = await allocateDebitNoteNumber(profileId, tx)
    return tx.debitNote.create({
      data: {
        businessProfileId: profileId,
        debitNoteNumber,
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
        zatcaStatus: 'pending',
        lines: { create: lineCreates },
      },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        createdByStaff: { select: { id: true, name: true } },
      },
    })
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

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
    await runNoteZatcaSend({
      note,
      device,
      documentNature,
      selectedEnvironment: profile.zatcaEnvironment,
    })
    if (documentNature === 'credit') {
      await prisma.creditNote.update({
        where: { id: note.id },
        data: {
          zatcaReportAttempts: { increment: 1 },
          zatcaLastAttemptAt: new Date(),
          zatcaLastError: null,
        },
      })
    } else {
      await prisma.debitNote.update({
        where: { id: note.id },
        data: {
          zatcaReportAttempts: { increment: 1 },
          zatcaLastAttemptAt: new Date(),
          zatcaLastError: null,
        },
      })
    }
    if (markInvoiceVoided) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'voided' },
      })
      await cancelKitchenOrderForInvoice(prisma, invoice.id)
      void notifyPosAudience({
        businessProfileId: profileId,
        audience: 'salesOps',
        type: 'invoice_voided',
        kind: 'salesOps',
        vars: { detail: `Invoice ${invoice.invoiceNumber} was voided` },
        link: `/invoices/${invoice.id}`,
        dedupeKey: `invoice-voided:${invoice.id}`,
        actorUserId: staffId,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const humanized = humanizeZatcaError(msg)
    const first = humanized.issues?.[0]
    const summary = first?.message
      ? [first.title, first.message, first.actionHint]
          .filter(Boolean)
          .join(' — ')
      : msg
    const failData = {
      zatcaStatus: /** @type {const} */ ('failed'),
      zatcaReportAttempts: { increment: 1 },
      zatcaLastAttemptAt: new Date(),
      zatcaLastError: summary.slice(0, 1000),
    }
    if (documentNature === 'credit') {
      await prisma.creditNote.update({ where: { id: note.id }, data: failData })
    } else {
      await prisma.debitNote.update({ where: { id: note.id }, data: failData })
    }
    void emitZatcaReportFailed({
      businessProfileId: profileId,
      actorUserId: staffId,
      documentKind: documentNature === 'credit' ? 'credit' : 'debit',
      documentId: note.id,
      documentNumber: noteNumber,
    })
    // Cancel still voids only after successful report — leave invoice completed on failure.
    throw Object.assign(new Error(msg), {
      code: 'ZATCA_ERROR',
      noteId: note.id,
      documentNature,
    })
  }

  // Loyalty is a post-success side-effect. Never remap failures to ZATCA_ERROR —
  // the note (and void, when applicable) already committed.
  try {
    if (markInvoiceVoided) {
      await reconcileLoyaltyPointsForInvoice({
        invoice: { ...invoice, status: 'voided' },
        cashierUserId: staffId,
      })
    } else {
      await reconcileLoyaltyPointsForInvoice({
        invoice,
        cashierUserId: staffId,
      })
    }
  } catch (loyaltyErr) {
    console.error(
      '[loyalty] reconcile after note/cancel failed (document already finalized):',
      loyaltyErr instanceof Error ? loyaltyErr.message : loyaltyErr,
      {
        invoiceId: invoice.id,
        noteId: note.id,
        documentNature,
        markInvoiceVoided: Boolean(markInvoiceVoided),
      },
    )
  }

  if (documentNature === 'credit') {
    return prisma.creditNote.findUnique({
      where: { id: note.id },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        createdByStaff: { select: { id: true, name: true } },
      },
    })
  }
  return prisma.debitNote.findUnique({
    where: { id: note.id },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      createdByStaff: { select: { id: true, name: true } },
    },
  })
}
