import { isZatcaSignedDocument } from '@/lib/notes/can-edit-or-cancel-invoice'

/**
 * Whether a failed credit/debit note may be repaired in-place (mutate, then
 * re-report). Only before it was ever signed — see `canRepairFailedInvoice`.
 *
 * @param {{
 *   zatcaStatus?: string | null
 *   deletedAt?: Date | string | null
 *   zatcaSigned?: boolean
 *   cryptographicStamp?: string | null
 * } | null | undefined} note
 */
export function canRepairFailedNote(note) {
  return canSoftDeleteNote(note) && !isZatcaSignedDocument(note)
}

/**
 * Soft-delete gate for notes — failed only.
 *
 * @param {{
 *   zatcaStatus?: string | null
 *   deletedAt?: Date | string | null
 * } | null | undefined} note
 */
export function canSoftDeleteNote(note) {
  if (!note || note.deletedAt) return false
  return note.zatcaStatus === 'failed'
}
