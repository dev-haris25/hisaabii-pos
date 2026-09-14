/**
 * Whether a failed credit/debit note may be repaired in-place (mutate, then re-report).
 *
 * @param {{
 *   zatcaStatus?: string | null
 *   deletedAt?: Date | string | null
 * } | null | undefined} note
 */
export function canRepairFailedNote(note) {
  if (!note || note.deletedAt) return false
  return note.zatcaStatus === 'failed'
}

/**
 * Soft-delete gate for notes — same as repair (failed only).
 *
 * @param {{
 *   zatcaStatus?: string | null
 *   deletedAt?: Date | string | null
 * } | null | undefined} note
 */
export function canSoftDeleteNote(note) {
  return canRepairFailedNote(note)
}
