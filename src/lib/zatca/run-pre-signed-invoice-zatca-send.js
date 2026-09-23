import { prisma } from '@/lib/prisma'
import { submitPreSignedInvoiceToZatca } from '@/lib/zatca/submit-pre-signed-invoice-to-zatca'

/**
 * Persist reported status for a pre-signed invoice after successful HTTP submit.
 * Does not update ZatcaDevice counter/hash tip (already set at offline sync).
 *
 * @param {{
 *   invoice: import('@/generated/prisma/client').Invoice
 *   device: import('@/generated/prisma/client').ZatcaDevice
 *   selectedEnvironment: string | null | undefined
 *   onStage?: (stage: string) => void | Promise<void>
 *   withTransientRetry?: boolean
 * }} opts
 * @returns {Promise<{ zatcaStatus: 'reported', path: 'pre_signed' }>}
 */
export async function runPreSignedInvoiceZatcaSend({
  invoice,
  device,
  selectedEnvironment,
  onStage,
  withTransientRetry = true,
}) {
  const submitResult = await submitPreSignedInvoiceToZatca(
    invoice,
    device,
    (stage) => {
      void Promise.resolve(onStage?.(stage)).catch(() => {})
    },
    selectedEnvironment,
    { withTransientRetry },
  )

  const clearedAt = new Date()
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      zatcaStatus: 'reported',
      zatcaClearedAt: clearedAt,
      // Keep existing artifacts; fill QR if somehow missing from row.
      ...(submitResult.qrCodeBase64 && !invoice.qrCode
        ? { qrCode: submitResult.qrCodeBase64 }
        : {}),
    },
  })

  return { zatcaStatus: 'reported', path: 'pre_signed' }
}
