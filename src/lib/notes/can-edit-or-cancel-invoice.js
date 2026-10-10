/**
 * True once a document has been Phase-2 signed into the ZATCA chain (it has a
 * stored hash). Works on raw Prisma rows and on list JSON (`zatcaSigned`).
 *
 * @param {{
 *   zatcaSigned?: boolean
 *   cryptographicStamp?: string | null
 * } | null | undefined} doc
 */
export function isZatcaSignedDocument(doc) {
  if (!doc) return false
  if (doc.zatcaSigned === true) return true
  return typeof doc.cryptographicStamp === 'string' && Boolean(doc.cryptographicStamp.trim())
}

/**
 * Whether an unreported invoice may be repaired in-place (mutate lines, then report).
 * Only before it was ever signed: a signed invoice already holds its place in
 * the ZATCA chain, so retries must resend that exact document (rules §18).
 * Fix a signed-but-rejected sale by soft-deleting it and selling again.
 *
 * @param {{
 *   status?: string
 *   zatcaStatus?: string | null
 *   deletedAt?: Date | string | null
 *   zatcaSigned?: boolean
 *   cryptographicStamp?: string | null
 * } | null | undefined} invoice
 */
export function canRepairFailedInvoice(invoice) {
  return canSoftDeleteInvoice(invoice) && !isZatcaSignedDocument(invoice)
}

/**
 * Soft-delete gate for invoices — pending/failed, not voided.
 *
 * @param {{
 *   status?: string
 *   zatcaStatus?: string | null
 *   deletedAt?: Date | string | null
 * } | null | undefined} invoice
 */
export function canSoftDeleteInvoice(invoice) {
  if (!invoice || invoice.deletedAt) return false
  if (invoice.status === 'voided') return false
  const status = invoice.zatcaStatus
  return !status || status === 'pending' || status === 'failed'
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
