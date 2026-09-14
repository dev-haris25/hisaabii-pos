import { createPublicKey, X509Certificate } from 'node:crypto'

import { asCertificatePem } from '@talha7k/zatca'

import { normalizeZatcaEnvironment } from '@/lib/zatca/env'

export const ZATCA_PRODUCTION_CERT_MISMATCH = 'ZATCA_PRODUCTION_CERT_MISMATCH'

const PRODUCTION_CERT_MISMATCH_MESSAGE =
  'Your production ZATCA certificate does not match your stored credentials. Please re-run onboarding for Production before submitting invoices.'

/**
 * Thrown when production-mode signing would otherwise fall back to a compliance CSID
 * (or fail after ZATCA reject). Must be raised before XML signing / submission.
 */
export class ZatcaProductionCertMismatchError extends Error {
  /** @type {typeof ZATCA_PRODUCTION_CERT_MISMATCH} */
  code = ZATCA_PRODUCTION_CERT_MISMATCH

  constructor(message = PRODUCTION_CERT_MISMATCH_MESSAGE) {
    super(message)
    this.name = 'ZatcaProductionCertMismatchError'
  }
}

/**
 * @param {string} certificateRaw binarySecurityToken from ZATCA
 * @param {string} privateKeyPem
 */
export function zatcaCertificateMatchesPrivateKey(certificateRaw, privateKeyPem) {
  if (!certificateRaw?.trim() || !privateKeyPem?.trim()) return false
  try {
    const certificatePem = asCertificatePem(certificateRaw)
    const privateSpki = Buffer.from(
      createPublicKey(privateKeyPem).export({ type: 'spki', format: 'der' }),
    ).toString('base64')
    const certificateSpki = Buffer.from(
      new X509Certificate(certificatePem).publicKey.export({
        type: 'spki',
        format: 'der',
      }),
    ).toString('base64')
    return privateSpki === certificateSpki
  } catch {
    return false
  }
}

/**
 * Resolve which stored CSID certificate to use for signing.
 *
 * Sandbox / simulation: prefer production CSID when it matches the private key;
 * otherwise fall back to compliance CSID (known developer-portal quirk).
 *
 * Production: never fall back to compliance. If a production CSID is present but
 * does not match the private key, throw {@link ZatcaProductionCertMismatchError}
 * immediately — do not attempt signing with a compliance certificate.
 *
 * @param {import('@/generated/prisma').ZatcaDevice} device
 * @param {string} privateKeyPem
 * @param {string | null | undefined} [environment] Active BusinessProfile.zatcaEnvironment
 * @returns {string | null} raw binarySecurityToken to sign with
 */
export function resolveZatcaSigningCertificateRaw(
  device,
  privateKeyPem,
  environment,
) {
  const env = normalizeZatcaEnvironment(environment ?? device?.environment)
  const productionRaw = device.productionCsid?.trim() || ''
  const complianceRaw = device.complianceCsid?.trim() || ''

  if (productionRaw && zatcaCertificateMatchesPrivateKey(productionRaw, privateKeyPem)) {
    return productionRaw
  }

  // Production-specific hard fail: never silently use compliance CSID for live submits.
  if (env === 'production') {
    if (productionRaw) {
      throw new ZatcaProductionCertMismatchError()
    }
    return null
  }

  // Sandbox / simulation: intentional compliance fallback (developer-portal quirk).
  if (
    complianceRaw &&
    zatcaCertificateMatchesPrivateKey(complianceRaw, privateKeyPem)
  ) {
    return complianceRaw
  }

  return null
}
