import {
  extractInvoiceUuid,
  ZatcaApiClient,
} from '@talha7k/zatca'

import { getZatcaApiConfig, getZatcaEnvironment } from '@/lib/zatca/env'
import { decryptZatcaSecret } from '@/lib/zatca/secrets'
import { formatZatcaSubmitRejection } from '@/lib/zatca/submit-errors'
import { retryZatcaCall } from '@/lib/zatca/retry-zatca-call'

/**
 * Report an already-signed Simplified invoice to ZATCA (reuse hash + UUID).
 * Does not re-sign and does not advance ZatcaDevice.invoiceCounter (rules §18).
 *
 * @param {import('@/generated/prisma/client').Invoice} invoice
 * @param {import('@/generated/prisma/client').ZatcaDevice} device
 * @param {(stage: string) => void} [onStage]
 * @param {string | null | undefined} [environmentOverride]
 * @param {{ withTransientRetry?: boolean }} [opts]
 */
export async function submitPreSignedInvoiceToZatca(
  invoice,
  device,
  onStage,
  environmentOverride,
  opts = {},
) {
  if (!device.productionCsid || !device.productionSecretEnc) {
    throw new Error(
      'ZATCA production CSID is missing. Complete ZATCA onboarding first.',
    )
  }

  const xml = String(invoice.xmlPayload || '').trim()
  const invoiceHash = String(invoice.cryptographicStamp || '').trim()
  if (!xml || !invoiceHash) {
    throw new Error('Invoice is missing signed XML or hash for ZATCA reporting')
  }

  const uuid = extractInvoiceUuid(xml)
  if (!uuid) {
    throw new Error('Signed invoice XML is missing UUID')
  }

  const env = getZatcaEnvironment(environmentOverride ?? device.environment)
  const productionSecret = decryptZatcaSecret(device.productionSecretEnc)
  const credentials = {
    binarySecurityToken: device.productionCsid,
    secret: productionSecret,
  }

  const client = new ZatcaApiClient(getZatcaApiConfig(env))
  onStage?.('submitting')

  const submitOnce = () =>
    client.submitForReporting(credentials, {
      invoiceHash,
      uuid,
      invoice: Buffer.from(xml).toString('base64'),
    })

  const zatcaResult =
    opts.withTransientRetry === false
      ? await submitOnce()
      : await retryZatcaCall(submitOnce, {
          label: `pre-signed report ${invoice.invoiceNumber}`,
          isTransientResult: (result) => {
            const status =
              /** @type {{ httpStatus?: number, success?: boolean } } */ (result)
                ?.httpStatus
            return (
              status === 429 ||
              status === 500 ||
              status === 502 ||
              status === 503 ||
              status === 504
            )
          },
        })

  onStage?.('zatca_responded')

  if (!zatcaResult?.success) {
    throw new Error(
      `ZATCA submission rejected: ${formatZatcaSubmitRejection(zatcaResult)}`,
    )
  }

  return {
    success: true,
    signedXml: xml,
    invoiceHash,
    qrCodeBase64: String(invoice.qrCode || '').trim() || null,
    zatcaUuid: uuid,
    zatcaResult,
    submissionType: /** @type {const} */ ('reporting'),
  }
}
