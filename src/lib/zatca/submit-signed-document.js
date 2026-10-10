import { extractInvoiceUuid, ZatcaApiClient } from '@talha7k/zatca'

import { getZatcaApiConfig, getZatcaEnvironment } from '@/lib/zatca/env'
import { retryZatcaCall } from '@/lib/zatca/retry-zatca-call'
import { decryptZatcaSecret } from '@/lib/zatca/secrets'
import { formatZatcaSubmitRejection } from '@/lib/zatca/submit-errors'

/**
 * Report an already-signed Simplified document (invoice / credit / debit note)
 * to ZATCA. HTTP only: reuses the stored XML, hash and UUID — never re-signs and
 * never touches the device counter (rules §18). Safe to call repeatedly.
 *
 * @param {{ xmlPayload?: string | null, cryptographicStamp?: string | null }} doc
 * @param {import('@/generated/prisma/client').ZatcaDevice} device
 * @param {{ label: string, withTransientRetry?: boolean }} opts
 */
export async function submitSignedDocumentToZatca(doc, device, opts) {
  if (!device?.productionCsid || !device.productionSecretEnc) {
    throw new Error(
      'ZATCA production CSID is missing. Complete ZATCA onboarding first.',
    )
  }

  const xml = String(doc.xmlPayload || '').trim()
  const invoiceHash = String(doc.cryptographicStamp || '').trim()
  if (!xml || !invoiceHash) {
    throw new Error('Document is missing signed XML or hash for ZATCA reporting')
  }

  const uuid = extractInvoiceUuid(xml)
  if (!uuid) {
    throw new Error('Signed document XML is missing UUID')
  }

  const credentials = {
    binarySecurityToken: device.productionCsid,
    secret: decryptZatcaSecret(device.productionSecretEnc),
  }
  const client = new ZatcaApiClient(getZatcaApiConfig(getZatcaEnvironment()))

  const submitOnce = () =>
    client.submitForReporting(credentials, {
      invoiceHash,
      uuid,
      invoice: Buffer.from(xml).toString('base64'),
    })

  const zatcaResult =
    opts.withTransientRetry === false
      ? await submitOnce()
      : await retryZatcaCall(submitOnce, { label: `report ${opts.label}` })

  if (!zatcaResult?.success) {
    throw new Error(
      `ZATCA submission rejected: ${formatZatcaSubmitRejection(zatcaResult)}`,
    )
  }

  return { uuid, invoiceHash }
}
