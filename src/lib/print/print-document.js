'use client'

import { authPost } from '@/lib/api/auth-client'
import { printWithQzTray } from '@/lib/print/print-with-qz-tray'

/**
 * Prepare receipt on the server, then print via QZ Tray on this PC.
 *
 * @param {{ invoiceId?: string, noteId?: string, noteType?: 'credit' | 'debit' }} body
 */
export async function printDocument(body) {
  const prepared = await authPost('/pos/print', body)
  return printWithQzTray(prepared)
}
