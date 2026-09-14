import { asCertificatePem, ZatcaApiClient } from '@talha7k/zatca'

import { signSandboxComplianceInvoice } from '@/lib/zatca/compliance-check'
import {
  buildCsrForProfile,
  requestZatcaComplianceCsid,
} from '@/lib/zatca/compliance-csid'
import {
  normalizeSandboxVat,
  buildEgsSerialNumber,
  getZatcaEnvironment,
  getZatcaApiConfig,
} from '@/lib/zatca/env'
import { formatZatcaCsidRejection } from '@/lib/zatca/errors'
import { buildPostalAddressFromFields } from '@/lib/zatca/postal-address-from-fields'
import { retryZatcaCall } from '@/lib/zatca/retry-zatca-call'
import { assertBusinessProfileCompleteForZatca } from '@/lib/zatca/seller-party-validate'
import { encryptZatcaSecret } from '@/lib/zatca/secrets'

/**
 * CSR is generated with invoiceType '1100' (Standard + Simplified), which
 * requires ALL SIX compliance categories to pass before ZATCA will issue a
 * Production CSID — reporting only these 2 leaves 4 categories missing and
 * production CSID exchange fails with `Missing-ComplianceSteps`.
 */
const COMPLIANCE_CHECKS = [
  'SIMPLIFIED_INVOICE',
  'SIMPLIFIED_CREDIT_NOTE',
  'SIMPLIFIED_DEBIT_NOTE',
  'STANDARD_INVOICE',
  'STANDARD_CREDIT_NOTE',
  'STANDARD_DEBIT_NOTE',
]

/**
 * Build supplier payload from a business profile without placeholder fallbacks.
 * Does not validate — use {@link assertBusinessProfileCompleteForZatca} first when
 * submitting to ZATCA.
 *
 * @param {import('@/generated/prisma').BusinessProfile} profile
 */
export function buildSupplierFromProfile(profile) {
  const env = getZatcaEnvironment(profile.zatcaEnvironment)
  const vatNumber =
    env === 'sandbox'
      ? normalizeSandboxVat(profile.vatNumber)
      : String(profile.vatNumber ?? '').replace(/\D/g, '')

  return {
    nameAr: profile.companyNameAr.trim(),
    nameEn: (profile.companyNameEn || profile.companyNameAr).trim(),
    vatNumber,
    crNumber: profile.crNumber.trim(),
    address: buildPostalAddressFromFields({
      streetAr: profile.streetAr,
      addressAr: profile.addressAr,
      buildingNumber: profile.buildingNumber,
      districtAr: profile.districtAr,
      cityAr: profile.cityAr,
      postalCode: profile.postalCode,
      countryCode: 'SA',
    }),
  }
}

/**
 * @param {import('@/generated/prisma').BusinessProfile} profile
 */
export function businessProfileToSupplier(profile) {
  assertBusinessProfileCompleteForZatca(profile)
  return buildSupplierFromProfile(profile)
}

/**
 * @param {import('@/generated/prisma').BusinessProfile} profile
 * @param {string} otp
 */
export async function onboardZatca(profile, otp) {
  assertBusinessProfileCompleteForZatca(profile)
  const supplier = buildSupplierFromProfile(profile)
  const env = getZatcaEnvironment(profile.zatcaEnvironment)
  const egsSerialNumber = buildEgsSerialNumber(profile.id)

  const csrResult = buildCsrForProfile(profile, supplier)
  const privateKey = csrResult.privateKey

  const compliance = await requestZatcaComplianceCsid(csrResult.csr, otp, env)

  const client = new ZatcaApiClient(getZatcaApiConfig(env))
  const credentials = {
    binarySecurityToken: compliance.binarySecurityToken,
    secret: compliance.secret,
  }
  const certificatePem = asCertificatePem(compliance.binarySecurityToken)

  for (let i = 0; i < COMPLIANCE_CHECKS.length; i += 1) {
    const checkType = COMPLIANCE_CHECKS[i]
    const signed = signSandboxComplianceInvoice({
      checkType,
      supplier,
      privateKeyPem: privateKey,
      certificatePem,
      invoiceCounter: i + 1,
    })
    const result = await retryZatcaCall(
      () =>
        client.verifyCompliance(
          credentials,
          signed.invoiceHash,
          signed.uuid,
          signed.base64SignedXml,
        ),
      { label: `compliance check (${checkType})`, isTransientResult: () => false },
    )
    if (!result.valid) {
      throw new Error(
        `ZATCA compliance check failed (${checkType}): ${result.messages.join('; ')}`,
      )
    }
  }

  if (!compliance.requestId) {
    throw new Error('ZATCA did not return a compliance request ID')
  }

  const production = await retryZatcaCall(
    () => client.requestProductionCSID(credentials, compliance.requestId),
    {
      label: 'production CSID request',
      isTransientResult: (result) =>
        result?.status === 'REJECTED' &&
        /^HTTP_(429|5\d\d)$/.test(result?.error?.code ?? ''),
    },
  )

  if (production.status !== 'ACCEPTED' || !production.binarySecurityToken) {
    throw new Error(
      formatZatcaCsidRejection(
        production,
        'ZATCA rejected the production CSID request',
      ),
    )
  }

  return {
    environment: env,
    egsSerialNumber,
    privateKeyEnc: encryptZatcaSecret(privateKey),
    complianceCsid: compliance.binarySecurityToken,
    complianceSecretEnc: encryptZatcaSecret(compliance.secret),
    complianceRequestId: compliance.requestId,
    productionCsid: production.binarySecurityToken,
    productionSecretEnc: encryptZatcaSecret(production.secret),
    onboardedAt: new Date(),
    complianceChecksPassed: COMPLIANCE_CHECKS,
    sandboxVatUsed: supplier.vatNumber,
  }
}

/** @param {import('@/generated/prisma').ZatcaDevice} device */
export function mapZatcaDeviceStatus(device) {
  return {
    environment: device.environment,
    egsSerialNumber: device.egsSerialNumber,
    onboardedAt: device.onboardedAt?.toISOString() ?? null,
    hasProductionCsid: Boolean(device.productionCsid),
    invoiceCounter: device.invoiceCounter,
  }
}
