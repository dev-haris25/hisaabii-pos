'use client'

import { NotesListView } from '@/components/notes/notes-list-view'

/**
 * @param {{
 *   notes: Array<{
 *     id: string
 *     noteNumber: string
 *     noteDate: string
 *     invoiceNumber: string | null
 *     reasonAr: string
 *     reasonEn: string | null
 *     grandTotal: string
 *     zatcaStatus: string | null
 *     hasQr: boolean
 *   }>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { search: string, zatca: string }
 *   cashierWindowOnly?: boolean
 * }} props
 */
export function CreditNotesListView({
  notes,
  pagination,
  filters,
  cashierWindowOnly = false,
}) {
  return (
    <NotesListView
      documentNature="credit"
      notes={notes}
      pagination={pagination}
      filters={filters}
      cashierWindowOnly={cashierWindowOnly}
    />
  )
}
