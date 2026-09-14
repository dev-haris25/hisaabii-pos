import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { prisma } from '@/lib/prisma'
import { submitStoredNoteToZatca } from '@/lib/zatca/submit-note-to-zatca'

/**
 * Shared ZATCA submit + persist path for credit/debit notes.
 * Updates the shared device hash-chain tip (same chain as invoices).
 *
 * @param {{
 *   note: { id: string, businessProfileId: string, lines: unknown[] } & Record<string, unknown>
 *   device: import('@/generated/prisma/client').ZatcaDevice
 *   documentNature: 'credit' | 'debit'
 *   selectedEnvironment: string | null | undefined
 *   onStage?: (stage: string) => void | Promise<void>
 * }} opts
 * @returns {Promise<{ zatcaStatus: 'reported' }>}
 */
export async function runNoteZatcaSend({
  note,
  device,
  documentNature,
  selectedEnvironment,
  onStage,
}) {
  const businessProfileId = note.businessProfileId
  const id = note.id

  const submitResult = await submitStoredNoteToZatca(
    note,
    device,
    documentNature,
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

    const artifactData = {
      qrCode: submitResult.qrCodeBase64,
      xmlPayload: submitResult.signedXml,
      cryptographicStamp: submitResult.invoiceHash,
      pih: device.lastInvoiceHash?.trim() || null,
      zatcaStatus,
      zatcaClearedAt: clearedAt,
    }

    if (documentNature === 'credit') {
      await tx.creditNote.update({
        where: { id },
        data: artifactData,
      })
    } else {
      await tx.debitNote.update({
        where: { id },
        data: artifactData,
      })
    }
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

  return { zatcaStatus }
}
