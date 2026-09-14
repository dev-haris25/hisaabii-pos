'use client'

import { NoteDetailView } from '@/components/notes/note-detail-view'

/**
 * @param {{
 *   note: Parameters<typeof NoteDetailView>[0]['note']
 *   logoUrl?: string | null
 * }} props
 */
export function DebitNoteDetailView({ note, logoUrl = null }) {
  return (
    <NoteDetailView documentNature="debit" note={note} logoUrl={logoUrl} />
  )
}
