import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { decryptZatcaSecret } from '@/lib/zatca/secrets'

/**
 * GET /api/auth/sync/zatca-secrets
 * Returns CSID material decrypted for Electron safeStorage (HTTPS + session).
 * Never store these plaintext values in SQLite.
 */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest({
      request,
      skipPermissionCheck: true,
    })
    if (auth.error) return auth.error

    const device = await prisma.zatcaDevice.findUnique({
      where: { businessProfileId: auth.profile.id },
    })
    if (!device) {
      return jsonOk({
        businessProfileId: auth.profile.id,
        hasDevice: false,
        secrets: null,
      })
    }

    if (!device.productionCsid || !device.privateKeyEnc) {
      return jsonOk({
        businessProfileId: auth.profile.id,
        hasDevice: true,
        secrets: null,
        message: 'ZATCA onboarding incomplete',
      })
    }

    let privateKeyPem
    let productionSecret
    try {
      privateKeyPem = decryptZatcaSecret(device.privateKeyEnc)
      productionSecret = device.productionSecretEnc
        ? decryptZatcaSecret(device.productionSecretEnc)
        : null
    } catch {
      return jsonError(
        500,
        'ZATCA_SECRETS_DECRYPT_FAILED',
        'Could not prepare ZATCA signing material for this till',
      )
    }

    if (!productionSecret) {
      return jsonOk({
        businessProfileId: auth.profile.id,
        hasDevice: true,
        secrets: null,
        message: 'ZATCA production secret missing',
      })
    }

    return jsonOk({
      businessProfileId: auth.profile.id,
      hasDevice: true,
      secrets: {
        environment: device.environment,
        egsSerialNumber: device.egsSerialNumber,
        privateKeyPem,
        productionCsid: device.productionCsid,
        productionSecret,
        complianceCsid: device.complianceCsid,
        invoiceCounter: device.invoiceCounter,
        lastInvoiceHash: device.lastInvoiceHash || '',
        onboardedAt: device.onboardedAt?.toISOString() ?? null,
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/sync/zatca-secrets')
  }
}
