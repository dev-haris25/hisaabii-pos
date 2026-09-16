'use client'

import { AuthApiError, authGet, authPost } from '@/lib/api/auth-client'
import { isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'
import { downloadThermalReceiptPdf } from '@/lib/print/download-thermal-receipt-pdf'
import { printWithElectron } from '@/lib/print/print-with-electron'

/**
 * Electron: thermal print. Chrome: download a thermal-look PDF.
 *
 * @param {{
 *   invoiceId?: string
 *   noteId?: string
 *   noteType?: 'credit' | 'debit'
 *   invoice?: Record<string, unknown>
 *   logoUrl?: string | null
 *   documentLabel?: string | null
 *   filename?: string
 * }} body
 */
export async function printDocument(body) {
  const printBody = {
    invoiceId: body.invoiceId,
    noteId: body.noteId,
    noteType: body.noteType,
  }

  if (isHisabiDesktop()) {
    const prepared = await authPost('/pos/print', printBody)
    return printWithElectron(prepared)
  }

  let invoice = body.invoice
  let logoUrl = body.logoUrl ?? null
  if (!invoice && body.invoiceId) {
    const data = await authGet(`/invoices/${body.invoiceId}`)
    invoice = data.invoice
    logoUrl = data.logoUrl ?? logoUrl
  }
  if (!invoice && body.noteId && body.noteType) {
    const path =
      body.noteType === 'credit'
        ? `/credit-notes/${body.noteId}`
        : `/debit-notes/${body.noteId}`
    const data = await authGet(path)
    invoice = data.note
    logoUrl = data.logoUrl ?? logoUrl
  }
  if (!invoice) {
    throw new AuthApiError(400, 'VALIDATION_ERROR', 'Missing document')
  }
  const qr = String(invoice.qrCode ?? '').trim()
  if (!qr) {
    throw new AuthApiError(409, 'QR_REQUIRED', 'Wait for ZATCA QR')
  }

  const number = String(invoice.invoiceNumber || invoice.noteNumber || 'receipt')
  await downloadThermalReceiptPdf({
    invoice,
    logoUrl,
    documentLabel: body.documentLabel ?? invoice.documentLabel ?? null,
    filename: body.filename || `${number}-receipt.pdf`,
  })
  return { downloaded: true }
}
