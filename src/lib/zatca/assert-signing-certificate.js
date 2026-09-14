import { decryptZatcaSecret } from '@/lib/zatca/secrets'
import {
  resolveZatcaSigningCertificateRaw,
  ZatcaProductionCertMismatchError,
} from '@/lib/zatca/key-cert-match'

/**
 * Decrypts the device private key and resolves the signing certificate for the
 * active environment — before any XML generation or ZATCA HTTP calls.
 *
 * Production: throws {@link ZatcaProductionCertMismatchError} when the production
 * CSID does not match the stored key (no compliance fallback).
 *
 * @param {import('@/generated/prisma').ZatcaDevice} device
 * @param {string | null | undefined} environment
 * @returns {string} raw signing certificate (binarySecurityToken)
 */
export function assertZatcaSigningCertificateReady(device, environment) {
  if (!device?.privateKeyEnc) {
    throw new Error(
      'ZATCA private key is missing. Complete ZATCA onboarding first.',
    )
  }
  const privateKeyPem = decryptZatcaSecret(device.privateKeyEnc)
  const signingRaw = resolveZatcaSigningCertificateRaw(
    device,
    privateKeyPem,
    environment,
  )
  if (!signingRaw) {
    throw new Error(
      'No ZATCA certificate matches the stored private key. Re-run ZATCA onboarding for this company.',
    )
  }
  return signingRaw
}

export { ZatcaProductionCertMismatchError }
