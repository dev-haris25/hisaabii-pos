import { isPreSignedInvoiceReady } from '@/lib/zatca/is-pre-signed-invoice-ready'
import { runInvoiceZatcaSend } from '@/lib/zatca/run-invoice-zatca-send'
import { runPreSignedInvoiceZatcaSend } from '@/lib/zatca/run-pre-signed-invoice-zatca-send'

/**
 * Report one invoice to ZATCA.
 * Pre-signed offline invoices: HTTP only (reuse UUID/hash, no counter bump).
 * Otherwise: full sign + report + device tip update.
 *
 * @param {{
 *   invoice: import('@/generated/prisma/client').Invoice & {
 *     lines?: import('@/generated/prisma/client').InvoiceLine[]
 *   }
 *   device: import('@/generated/prisma/client').ZatcaDevice
 *   selectedEnvironment: string | null | undefined
 *   onStage?: (stage: string) => void | Promise<void>
 *   withTransientRetry?: boolean
 * }} opts
 */
export async function reportInvoiceToZatca(opts) {
  if (isPreSignedInvoiceReady(opts.invoice)) {
    return runPreSignedInvoiceZatcaSend({
      invoice: opts.invoice,
      device: opts.device,
      selectedEnvironment: opts.selectedEnvironment,
      onStage: opts.onStage,
      withTransientRetry: opts.withTransientRetry,
    })
  }

  if (!Array.isArray(opts.invoice.lines)) {
    throw new Error('Invoice lines are required to sign for ZATCA reporting')
  }

  const result = await runInvoiceZatcaSend({
    invoice: /** @type {import('@/generated/prisma/client').Invoice & { lines: import('@/generated/prisma/client').InvoiceLine[] }} */ (
      opts.invoice
    ),
    device: opts.device,
    selectedEnvironment: opts.selectedEnvironment,
    onStage: opts.onStage,
  })
  return { ...result, path: /** @type {const} */ ('sign_and_send') }
}
