import {
  computeInvoiceTotals,
  computeLineAmounts,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { createAndReportNote } from '@/lib/notes/create-and-report-note'
import { noteLinesFromSignedDeltas } from '@/lib/notes/note-lines-from-deltas'

/**
 * @param {{
 *   profile: import('@/generated/prisma/client').BusinessProfile
 *   device: import('@/generated/prisma/client').ZatcaDevice
 *   invoice: import('@/generated/prisma/client').Invoice & {
 *     lines: import('@/generated/prisma/client').InvoiceLine[]
 *   }
 *   staffId: string
 *   reasonAr: string
 *   reasonEn?: string | null
 *   editedLines: Array<{
 *     invoiceLineId?: string | null
 *     nameAr: string
 *     nameEn?: string | null
 *     quantity: number
 *     unitPrice: string
 *     vatPreset: string
 *   }>
 * }} opts
 */
export async function createNoteFromInvoiceEdit(opts) {
  const {
    profile,
    device,
    invoice,
    staffId,
    reasonAr,
    reasonEn,
    editedLines,
  } = opts

  if (invoice.status === 'voided') {
    throw Object.assign(new Error('Invoice is already cancelled'), {
      code: 'INVOICE_VOIDED',
    })
  }
  if (invoice.zatcaStatus !== 'reported' && invoice.zatcaStatus !== 'cleared') {
    throw Object.assign(
      new Error('Report the invoice to ZATCA before editing'),
      { code: 'INVOICE_NOT_REPORTED' },
    )
  }
  if (!String(reasonAr ?? '').trim()) {
    throw Object.assign(new Error('Arabic reason is required'), {
      code: 'NOTE_REASON_REQUIRED',
    })
  }
  if (!Array.isArray(editedLines) || editedLines.length === 0) {
    throw Object.assign(new Error('At least one line is required'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const originalLines = [...invoice.lines].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
  const oldTotals = computeInvoiceTotals(
    originalLines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount ?? '0',
      vatPreset: l.vatPreset,
    })),
  )
  const newTotals = computeInvoiceTotals(
    editedLines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: '0',
      vatPreset: l.vatPreset,
    })),
  )

  const oldGrand = parseMoney(oldTotals.grandTotal)
  const newGrand = parseMoney(newTotals.grandTotal)
  const netDelta = Math.round((newGrand - oldGrand) * 100) / 100

  if (Math.abs(netDelta) < 0.01) {
    throw Object.assign(new Error('No financial change to report'), {
      code: 'EDIT_NO_CHANGE',
    })
  }

  const documentNature = /** @type {'credit' | 'debit'} */ (
    netDelta < 0 ? 'credit' : 'debit'
  )

  /** @type {Map<string, (typeof originalLines)[number]>} */
  const originalById = new Map(originalLines.map((l) => [l.id, l]))
  /** @type {Set<string>} */
  const matchedOriginalIds = new Set()

  /** @type {Array<{ nameAr: string, nameEn?: string | null, quantity: number, unitPrice: string, vatPreset: string, signedLineTotal: number }>} */
  const signedDeltas = []

  for (const edited of editedLines) {
    const orig =
      edited.invoiceLineId && originalById.has(edited.invoiceLineId)
        ? originalById.get(edited.invoiceLineId)
        : null

    if (orig) {
      matchedOriginalIds.add(orig.id)
      const oldAmt = computeLineAmounts({
        quantity: orig.quantity,
        unitPrice: orig.unitPrice,
        discount: orig.discount ?? '0',
        vatPreset: orig.vatPreset,
      })
      const newAmt = computeLineAmounts({
        quantity: edited.quantity,
        unitPrice: edited.unitPrice,
        discount: '0',
        vatPreset: edited.vatPreset,
      })
      const signed = Math.round((newAmt.lineTotal - oldAmt.lineTotal) * 100) / 100
      if (Math.abs(signed) < 0.01) continue

      const qtyDelta = edited.quantity - orig.quantity
      signedDeltas.push({
        nameAr: edited.nameAr || orig.nameAr,
        nameEn: edited.nameEn ?? orig.nameEn,
        quantity: qtyDelta !== 0 ? qtyDelta : 1,
        unitPrice:
          qtyDelta !== 0 &&
          parseMoney(edited.unitPrice) === parseMoney(orig.unitPrice)
            ? orig.unitPrice
            : edited.unitPrice,
        vatPreset: edited.vatPreset || orig.vatPreset,
        signedLineTotal: signed,
      })
    } else {
      // Brand-new line → full debit-side amount
      const newAmt = computeLineAmounts({
        quantity: edited.quantity,
        unitPrice: edited.unitPrice,
        discount: '0',
        vatPreset: edited.vatPreset,
      })
      signedDeltas.push({
        nameAr: edited.nameAr,
        nameEn: edited.nameEn,
        quantity: edited.quantity,
        unitPrice: edited.unitPrice,
        vatPreset: edited.vatPreset,
        signedLineTotal: newAmt.lineTotal,
      })
    }
  }

  for (const orig of originalLines) {
    if (matchedOriginalIds.has(orig.id)) continue
    // Fully removed line → full credit-side amount
    const oldAmt = computeLineAmounts({
      quantity: orig.quantity,
      unitPrice: orig.unitPrice,
      discount: orig.discount ?? '0',
      vatPreset: orig.vatPreset,
    })
    signedDeltas.push({
      nameAr: orig.nameAr,
      nameEn: orig.nameEn,
      quantity: -orig.quantity,
      unitPrice: orig.unitPrice,
      vatPreset: orig.vatPreset,
      signedLineTotal: -oldAmt.lineTotal,
    })
  }

  const hasCreditSide = signedDeltas.some((d) => d.signedLineTotal < -0.005)
  const hasDebitSide = signedDeltas.some((d) => d.signedLineTotal > 0.005)
  if (hasCreditSide && hasDebitSide) {
    throw Object.assign(
      new Error(
        'This edit both increases and decreases line totals. Make only increases or only decreases in one edit.',
      ),
      { code: 'EDIT_MIXED_CHANGES' },
    )
  }

  const noteLines = noteLinesFromSignedDeltas(signedDeltas, documentNature)
  if (noteLines.length === 0) {
    throw Object.assign(new Error('No financial change to report'), {
      code: 'EDIT_NO_CHANGE',
    })
  }

  const note = await createAndReportNote({
    documentNature,
    profileId: profile.id,
    staffId,
    invoice,
    profile,
    device,
    reasonAr,
    reasonEn,
    noteLines,
  })

  return { note, documentNature }
}
