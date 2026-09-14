import { generateCSR } from '@talha7k/zatca'

import {
  buildEgsSerialNumber,
  getZatcaBaseUrl,
  getZatcaEnvironment,
} from '@/lib/zatca/env'
import { parseZatcaCsidHttpError } from '@/lib/zatca/errors'

/**
 * @param {import('@/generated/prisma').BusinessProfile} profile
 * @param {ReturnType<import('@/lib/zatca/onboard').businessProfileToSupplier>} supplier
 */
export function buildCsrForProfile(profile, supplier) {
  const env = getZatcaEnvironment(profile.zatcaEnvironment)
  return generateCSR(
    {
      organizationNameAr: supplier.nameAr,
      organizationNameEn: supplier.nameEn,
      vatNumber: supplier.vatNumber,
      crNumber: supplier.crNumber,
      country: 'SA',
      commonName: supplier.nameEn,
      invoiceType: '1100',
      location: {
        city: supplier.address.city,
        district: supplier.address.district,
        street: supplier.address.street,
        buildingNumber: supplier.address.building,
        postalCode: supplier.address.postalCode,
      },
      egsSerialNumber: buildEgsSerialNumber(profile.id),
    },
    env,
  )
}

/**
 * @param {string} csrPem
 * @param {string} otp
 * @param {string | null | undefined} [envOverride]
 */
export async function requestZatcaComplianceCsid(csrPem, otp, envOverride) {
  const csrBase64 = Buffer.from(csrPem, 'utf8').toString('base64')
  const baseUrl = getZatcaBaseUrl(envOverride)

  const response = await fetch(`${baseUrl}/compliance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': 'en',
      'Accept-Version': 'V2',
      OTP: otp,
    },
    body: JSON.stringify({ csr: csrBase64 }),
  })

  const body = await response.text()
  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error(parseZatcaCsidHttpError(body, response.status))
  }

  const token = data.binarySecurityToken || ''
  const secret = data.secret || ''
  const requestId =
    data.requestID != null
      ? String(data.requestID)
      : data.requestId != null
        ? String(data.requestId)
        : undefined

  if (response.status < 200 || response.status >= 300 || !token) {
    throw new Error(parseZatcaCsidHttpError(body, response.status))
  }

  return {
    binarySecurityToken: token,
    secret,
    requestId,
    dispositionMessage: data.dispositionMessage,
  }
}
