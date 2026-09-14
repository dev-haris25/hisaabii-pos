import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { prisma } from '@/lib/prisma'
import { submitStoredInvoiceToZatca } from '@/lib/zatca/submit-invoice'

/**
 * Shared ZATCA submit + persist path used by the background worker (and any
 * future "Report to ZATCA" API).
 *
 * Unlike Hisabi, this never touches `Invoice.status` (`completed | voided` is
 * independent of ZATCA progress — already `completed` at checkout). Only
 * ZATCA artifact fields + the device hash-chain tip are updated. Simplified
 * invoices always resolve to `zatcaStatus: 'reported'` (never `'cleared'`).
 *
 * @param {{
 *   invoice: import('@/generated/prisma/client').Invoice & {
 *     lines: import('@/generated/prisma/client').InvoiceLine[]
 *   }
 *   device: import('@/generated/prisma/client').ZatcaDevice
 *   selectedEnvironment: string | null | undefined
 *   onStage?: (stage: string) => void | Promise<void>
 * }} opts
 * @returns {Promise<{ zatcaStatus: 'reported' }>}
 */
export async function runInvoiceZatcaSend({
  invoice,
  device,
  selectedEnvironment,
  onStage,
}) {
  const businessProfileId = invoice.businessProfileId
  const id = invoice.id

  const submitResult = await submitStoredInvoiceToZatca(
    invoice,
    device,
    (stage) => {
      void Promise.resolve(onStage?.(stage)).catch(() => {})
    },
    selectedEnvironment,
  )

  const zatcaStatus = /** @type {const} */ ('reported')
  const clearedAt = new Date()
  const nextCounter =
    submitResult.newHashChainState?.counter ?? device.invoiceCounter + 1
  const nextHash =
    submitResult.newHashChainState?.lastHash ?? submitResult.invoiceHash

  await prisma.$transaction(async (tx) => {
    await tx.zatcaDevice.update({
      where: { businessProfileId },
      data: {
        lastInvoiceHash: nextHash,
        invoiceCounter: nextCounter,
      },
    })

    await tx.invoice.update({
      where: { id },
      data: {
        // Do NOT touch Invoice.status — POS status is completed|voided only.
        qrCode: submitResult.qrCodeBase64,
        xmlPayload: submitResult.signedXml,
        cryptographicStamp: submitResult.invoiceHash,
        pih: device.lastInvoiceHash?.trim() || null,
        zatcaStatus,
        zatcaClearedAt: clearedAt,
      },
    })
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

  return { zatcaStatus }
}
