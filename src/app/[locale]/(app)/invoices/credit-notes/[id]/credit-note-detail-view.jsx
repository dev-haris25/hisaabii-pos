'use client'

import { NoteDetailView } from '@/components/notes/note-detail-view'

/**
 * @param {{
 *   note: Parameters<typeof NoteDetailView>[0]['note']
 *   logoUrl?: string | null
 * }} props
 */
export function CreditNoteDetailView({ note, logoUrl = null }) {
  return (
    <NoteDetailView documentNature="credit" note={note} logoUrl={logoUrl} />
  )
}
