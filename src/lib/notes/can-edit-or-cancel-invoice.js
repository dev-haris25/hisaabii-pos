/**
 * Whether an unreported invoice may be repaired in-place (mutate lines, then report).
 * Covers pending / failed / unset ZATCA status. Reported/cleared use credit/debit notes
 * instead ({@link canEditOrCancelInvoice}).
 *
 * @param {{
 *   status?: string
 *   zatcaStatus?: string | null
 *   deletedAt?: Date | string | null
 * } | null | undefined} invoice
 */
export function canRepairFailedInvoice(invoice) {
  if (!invoice || invoice.deletedAt) return false
  if (invoice.status === 'voided') return false
  const status = invoice.zatcaStatus
  return !status || status === 'pending' || status === 'failed'
}

/**
 * Soft-delete gate for invoices — same as repair (pending/failed, not voided).
 *
 * @param {{
 *   status?: string
 *   zatcaStatus?: string | null
 *   deletedAt?: Date | string | null
 * } | null | undefined} invoice
 */
export function canSoftDeleteInvoice(invoice) {
  return canRepairFailedInvoice(invoice)
}

/**
 * Whether an invoice may be edited (credit/debit note) or cancelled (full reversal).
 *
 * @param {{ status?: string, zatcaStatus?: string | null } | null | undefined} invoice
 */
export function canEditOrCancelInvoice(invoice) {
  if (!invoice || invoice.status === 'voided') return false
  return invoice.zatcaStatus === 'reported' || invoice.zatcaStatus === 'cleared'
}
