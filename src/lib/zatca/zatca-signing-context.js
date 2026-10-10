import {
  asCertificatePem,
  extractCertificateSignature,
} from '@talha7k/zatca'

import { extractVatFromZatcaCertificate } from '@/lib/zatca/certificate-vat'
import { getZatcaEnvironment } from '@/lib/zatca/env'
import { resolveZatcaSigningCertificateRaw } from '@/lib/zatca/key-cert-match'
import { decryptZatcaSecret } from '@/lib/zatca/secrets'

/**
 * Decrypted signing material for one restaurant's ZATCA device.
 * Shared by invoice and credit/debit note signing (same CSID, same chain).
 *
 * @param {import('@/generated/prisma/client').ZatcaDevice} device
 */
export function loadZatcaSigningContext(device) {
  if (!device?.productionCsid || !device.productionSecretEnc) {
    throw new Error(
      'ZATCA production CSID is missing. Complete ZATCA onboarding first.',
    )
  }

  const env = getZatcaEnvironment()
  const privateKeyPem = decryptZatcaSecret(device.privateKeyEnc)
  const signingRaw = resolveZatcaSigningCertificateRaw(device, privateKeyPem, env)
  if (!signingRaw) {
    throw new Error(
      'No ZATCA certificate matches the stored private key. Re-run ZATCA onboarding for this company.',
    )
  }
  const certificatePem = asCertificatePem(signingRaw)

  let certificateSignature
  try {
    certificateSignature = extractCertificateSignature(certificatePem)
  } catch {
    throw new Error('Could not read the ZATCA certificate signature')
  }

  return {
    env,
    privateKeyPem,
    certificatePem,
    certificateSignature,
    authVatNumber: extractVatFromZatcaCertificate(device.productionCsid),
  }
}
