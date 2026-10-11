import {
  centsToMoney,
  computeLineAmounts,
  lineTaxableCents,
  moneyToCents,
  scaleCents,
} from '@/lib/invoices/invoice-compute-totals'
import { noteLineForTaxable } from '@/lib/notes/note-lines-from-deltas'

/**
 * Outstanding state of a reported invoice and the note plans built from it.
 * Pure (server + edit screen) so the screen shows exactly what the server
 * will issue. Everything is tracked on before-VAT (taxable) amounts in whole
 * halalas; VAT on each note line is whatever the per-line rounding gives.
 *
 * Callers pass only NON-DELETED credit / debit notes of the invoice.
 */

/** @param {string} code @param {string} message */
function noteError(code, message) {
  return Object.assign(new Error(message), { code })
}

/** @param {string | null | undefined} status */
export function isNoteReported(status) {
  return status === 'reported' || status === 'cleared'
}

/**
 * VAT-inclusive total of note / invoice lines in halalas (per-line rounding).
 * @param {Array<{ quantity: number, unitPrice: string, discount?: string | null, vatPreset: string }>} lines
 */
function linesTotalCents(lines) {
  let total = 0
  for (const l of lines) {
    total += moneyToCents(
      computeLineAmounts({ ...l, discount: l.discount ?? '0' }).lineTotal,
    )
  }
  return total
}

/**
 * @param {Array<{ quantity: number, unitPrice: string, vatPreset: string }>} lines
 */
export function noteTaxableCents(lines) {
  let sum = 0
  for (const l of lines) sum += lineTaxableCents({ ...l, discount: '0' })
  return sum
}

/**
 * @param {{
 *   invoiceLines: Array<{ id: string, nameAr: string, nameEn?: string | null, quantity: number, unitPrice: string, discount?: string | null, vatPreset: string, sortOrder?: number }>
 *   creditNotes: Array<{ id: string, creditNoteNumber?: string, zatcaStatus?: string | null, lines: Array<{ invoiceLineId?: string | null, unitsCovered?: number | null, quantity: number, unitPrice: string, vatPreset: string }> }>
 *   debitNotes: Array<{ id: string, debitNoteNumber?: string, zatcaStatus?: string | null, lines: Array<{ id?: string, nameAr: string, nameEn?: string | null, quantity: number, unitPrice: string, vatPreset: string }> }>
 * }} input
 */
export function computeInvoiceOutstanding({ invoiceLines, creditNotes, debitNotes }) {
  /** @type {Map<string, { cents: number, units: number }>} */
  const creditedByLine = new Map()
  let creditTaxableCents = 0
  let creditTotalCents = 0
  for (const note of creditNotes) {
    for (const l of note.lines) {
      const cents = lineTaxableCents({ ...l, discount: '0' })
      creditTaxableCents += cents
      if (l.invoiceLineId) {
        const prev = creditedByLine.get(l.invoiceLineId) ?? { cents: 0, units: 0 }
        creditedByLine.set(l.invoiceLineId, {
          cents: prev.cents + cents,
          units: prev.units + (Number(l.unitsCovered) || 0),
        })
      }
    }
    creditTotalCents += linesTotalCents(note.lines)
  }

  const sorted = [...invoiceLines].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )
  let invoiceTaxableCents = 0
  const lines = sorted.map((l) => {
    const taxableCents = lineTaxableCents(l)
    invoiceTaxableCents += taxableCents
    const credited = creditedByLine.get(l.id) ?? { cents: 0, units: 0 }
    return {
      invoiceLineId: l.id,
      nameAr: l.nameAr,
      nameEn: l.nameEn ?? null,
      unitPrice: l.unitPrice,
      vatPreset: l.vatPreset,
      quantity: l.quantity,
      discount: l.discount ?? '0',
      taxableCents,
      creditedCents: credited.cents,
      creditedUnits: credited.units,
      remainingQuantity: Math.max(0, l.quantity - credited.units),
      remainingTaxableCents: Math.max(0, taxableCents - credited.cents),
    }
  })

  let debitTaxableCents = 0
  let debitTotalCents = 0
  const addedItems = []
  for (const note of debitNotes) {
    for (const l of note.lines) {
      const taxableCents = lineTaxableCents({ ...l, discount: '0' })
      debitTaxableCents += taxableCents
      addedItems.push({
        debitNoteId: note.id,
        debitNoteNumber: note.debitNoteNumber ?? null,
        debitNoteLineId: l.id ?? null,
        nameAr: l.nameAr,
        nameEn: l.nameEn ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatPreset: l.vatPreset,
        taxableCents,
      })
    }
    debitTotalCents += linesTotalCents(note.lines)
  }

  const invoiceTotalCents = linesTotalCents(sorted)
  const pendingNoteCount =
    creditNotes.filter((n) => !isNoteReported(n.zatcaStatus)).length +
    debitNotes.filter((n) => !isNoteReported(n.zatcaStatus)).length

  return {
    lines,
    addedItems,
    invoiceTaxableCents,
    debitTaxableCents,
    creditTaxableCents,
    /** Before-VAT amount still on the invoice: invoice + debits − credits. */
    outstandingTaxableCents:
      invoiceTaxableCents + debitTaxableCents - creditTaxableCents,
    /** VAT-inclusive balance (display): invoice + debits − credits. */
    outstandingTotalCents: invoiceTotalCents + debitTotalCents - creditTotalCents,
    pendingNoteCount,
  }
}

/** @typedef {ReturnType<typeof computeInvoiceOutstanding>} InvoiceOutstanding */

/**
 * Net unit price of a line (taxable / quantity), rounded to halalas.
 * @param {InvoiceOutstanding['lines'][number]} line
 */
function netUnitPrice(line) {
  return centsToMoney(scaleCents(line.taxableCents, 1, line.quantity || 1))
}

/**
 * Before-VAT amount credited when a line goes from its remaining quantity
 * down to `qty`: closing the line credits exactly what is left; a partial
 * credit uses the net unit price and never more than what is left.
 *
 * @param {InvoiceOutstanding['lines'][number]} line
 * @param {number} qty requested quantity (below the remaining quantity)
 */
function removalCreditCents(line, qty) {
  const removed = line.remainingQuantity - qty
  if (qty === 0) return line.remainingTaxableCents
  return Math.min(
    scaleCents(line.taxableCents, removed, line.quantity),
    line.remainingTaxableCents,
  )
}

/**
 * Display amount (VAT-inclusive, per-line rounding) of an existing line at a
 * requested quantity during a correction — same math as the note plan.
 *
 * @param {InvoiceOutstanding['lines'][number]} line
 * @param {number} qty
 */
export function correctionLineTotal(line, qty) {
  const q = Math.max(0, Math.round(Number(qty) || 0))
  let cents = line.remainingTaxableCents
  if (q < line.remainingQuantity) {
    cents -= removalCreditCents(line, q)
  } else if (q > line.remainingQuantity) {
    cents += lineTaxableCents({
      quantity: q - line.remainingQuantity,
      unitPrice: line.unitPrice,
      vatPreset: line.vatPreset,
    })
  }
  return computeLineAmounts({
    quantity: 1,
    unitPrice: centsToMoney(cents),
    vatPreset: line.vatPreset,
  }).lineTotal
}

/**
 * Plan the note for a correction: compare requested quantities with each
 * line's remaining quantity. Stored names / prices / VAT presets are used for
 * existing lines; client values only for brand-new items.
 *
 * @param {InvoiceOutstanding} outstanding
 * @param {Array<{ invoiceLineId?: string | null, nameAr?: string, nameEn?: string | null, quantity: number, unitPrice?: string, vatPreset?: string }>} requested
 * @returns {{ documentNature: 'credit' | 'debit', noteLines: Array<{ nameAr: string, nameEn: string | null, quantity: number, unitPrice: string, vatPreset: string, invoiceLineId?: string, unitsCovered?: number }> }}
 */
export function planInvoiceCorrection(outstanding, requested) {
  const byId = new Map(outstanding.lines.map((l) => [l.invoiceLineId, l]))
  /** @type {Set<string>} */
  const seen = new Set()
  const credit = []
  const debit = []

  /** @param {InvoiceOutstanding['lines'][number]} line @param {number} qty */
  function changeLine(line, qty) {
    const remaining = line.remainingQuantity
    if (qty === remaining) return
    if (qty < remaining) {
      const removed = remaining - qty
      const cents = removalCreditCents(line, qty)
      if (cents <= 0) return
      credit.push({
        ...noteLineForTaxable({
          nameAr: line.nameAr,
          nameEn: line.nameEn,
          vatPreset: line.vatPreset,
          units: removed,
          unitPrice: netUnitPrice(line),
          taxableCents: cents,
        }),
        invoiceLineId: line.invoiceLineId,
        unitsCovered: removed,
      })
      return
    }
    // More units than remain: extra units at the full unit price, no discount.
    const extra = qty - remaining
    const cents = lineTaxableCents({
      quantity: extra,
      unitPrice: line.unitPrice,
      vatPreset: line.vatPreset,
    })
    if (cents <= 0) return
    debit.push(
      noteLineForTaxable({
        nameAr: line.nameAr,
        nameEn: line.nameEn,
        vatPreset: line.vatPreset,
        units: extra,
        unitPrice: line.unitPrice,
        taxableCents: cents,
      }),
    )
  }

  for (const r of requested) {
    const qty = Math.max(0, Math.round(Number(r.quantity) || 0))
    if (r.invoiceLineId) {
      if (seen.has(r.invoiceLineId)) {
        throw noteError('VALIDATION_ERROR', 'An invoice line is listed twice')
      }
      seen.add(r.invoiceLineId)
      const line = byId.get(r.invoiceLineId)
      if (!line || line.remainingQuantity <= 0) {
        throw noteError(
          'INVOICE_CHANGED',
          'This invoice changed. Reload the page and try again.',
        )
      }
      changeLine(line, qty)
      continue
    }
    if (qty <= 0) continue
    // Brand-new item: debited at full price.
    const cents = lineTaxableCents({
      quantity: qty,
      unitPrice: String(r.unitPrice ?? '0'),
      vatPreset: String(r.vatPreset ?? 'standard'),
    })
    if (cents <= 0) continue
    debit.push(
      noteLineForTaxable({
        nameAr: String(r.nameAr ?? ''),
        nameEn: r.nameEn ?? null,
        vatPreset: String(r.vatPreset ?? 'standard'),
        units: qty,
        unitPrice: String(r.unitPrice ?? '0'),
        taxableCents: cents,
      }),
    )
  }

  // Lines still open but left out of the request are removed.
  for (const line of outstanding.lines) {
    if (line.remainingQuantity > 0 && !seen.has(line.invoiceLineId)) {
      changeLine(line, 0)
    }
  }

  if (credit.length > 0 && debit.length > 0) {
    throw noteError(
      'EDIT_MIXED_CHANGES',
      'This edit both increases and decreases lines. Make only increases or only decreases in one edit.',
    )
  }
  if (credit.length === 0 && debit.length === 0) {
    throw noteError('EDIT_NO_CHANGE', 'No financial change to report')
  }
  return credit.length > 0
    ? { documentNature: 'credit', noteLines: credit }
    : { documentNature: 'debit', noteLines: debit }
}

/**
 * Cancellation: credit every invoice line's remaining amount (linked) plus
 * every item added by debit notes. Before-VAT total = outstanding amount when
 * all earlier credits are linked; otherwise the cap rejects it.
 *
 * @param {InvoiceOutstanding} outstanding
 */
export function planInvoiceCancellation(outstanding) {
  const noteLines = []
  for (const line of outstanding.lines) {
    if (line.remainingTaxableCents <= 0) continue
    noteLines.push({
      ...noteLineForTaxable({
        nameAr: line.nameAr,
        nameEn: line.nameEn,
        vatPreset: line.vatPreset,
        units: line.remainingQuantity,
        unitPrice: netUnitPrice(line),
        taxableCents: line.remainingTaxableCents,
      }),
      invoiceLineId: line.invoiceLineId,
      unitsCovered: line.remainingQuantity,
    })
  }
  for (const item of outstanding.addedItems) {
    if (item.taxableCents <= 0) continue
    noteLines.push(
      noteLineForTaxable({
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        vatPreset: item.vatPreset,
        units: item.quantity,
        unitPrice: item.unitPrice,
        taxableCents: item.taxableCents,
      }),
    )
  }
  return { documentNature: /** @type {const} */ ('credit'), noteLines }
}

/**
 * Cap: total non-deleted credits (before VAT) may not exceed the invoice's
 * taxable total plus non-deleted debits. No tolerance.
 *
 * @param {InvoiceOutstanding} outstanding
 * @param {number} newCreditCents before-VAT amount of the credit note being issued
 * @param {number} [replacedCreditCents] before-VAT amount of a credit note being replaced (repair)
 */
export function assertCreditWithinBalance(outstanding, newCreditCents, replacedCreditCents = 0) {
  const credits = outstanding.creditTaxableCents - replacedCreditCents + newCreditCents
  if (credits > outstanding.invoiceTaxableCents + outstanding.debitTaxableCents) {
    throw noteError(
      'CREDIT_EXCEEDS_INVOICE_BALANCE',
      'This credit note would credit more than the invoice balance',
    )
  }
}

/** @param {InvoiceOutstanding} outstanding */
export function isInvoiceFullyCredited(outstanding) {
  return outstanding.outstandingTaxableCents === 0
}
