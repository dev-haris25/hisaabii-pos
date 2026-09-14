import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  AUTH_USER_SELECT,
  buildAuthUserFromRow,
} from '@/lib/auth/auth-user-json'
import { userCanAccessBusinessProfile } from '@/lib/auth/accessible-business-profiles'
import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { zatcaOnboardBodySchema } from '@/lib/auth/schemas'
import { isZatcaEnabled } from '@/lib/zatca/env'
import {
  buildSupplierFromProfile,
  mapZatcaDeviceStatus,
  onboardZatca,
} from '@/lib/zatca/onboard'
import { prisma } from '@/lib/prisma'

/**
 * @param {{ id: string }} session
 * @param {string | null | undefined} businessProfileId
 */
async function resolveOwnedProfile(session, businessProfileId) {
  if (businessProfileId) {
    const canAccess = await userCanAccessBusinessProfile(
      session.id,
      businessProfileId,
    )
    if (!canAccess) return null
    return prisma.businessProfile.findUnique({
      where: { id: businessProfileId },
    })
  }
  return getResolvedActiveBusinessProfile(session.id)
}

/** GET /api/auth/zatca-onboarding/compliance-csid — device status for the restaurant. */
export async function GET(request) {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }

    const url = new URL(request.url)
    const businessProfileId =
      url.searchParams.get('businessProfileId')?.trim() || null

    const profile = await resolveOwnedProfile(session, businessProfileId)
    if (!profile) {
      return jsonError(400, 'NO_COMPANY', 'No restaurant profile')
    }

    const device = await prisma.zatcaDevice.findUnique({
      where: { businessProfileId: profile.id },
    })

    return jsonOk({
      enabled: isZatcaEnabled(),
      device: device ? mapZatcaDeviceStatus(device) : null,
      supplierPreview: buildSupplierFromProfile(profile),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/zatca-onboarding/compliance-csid')
  }
}

/** POST /api/auth/zatca-onboarding/compliance-csid — full onboard with Fatoora OTP. */
export async function POST(request) {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }

    if (!isZatcaEnabled()) {
      return jsonError(503, 'ZATCA_DISABLED', 'ZATCA integration is disabled')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = zatcaOnboardBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
    }

    const profile = await resolveOwnedProfile(
      session,
      parsed.data.businessProfileId ?? null,
    )
    if (!profile) {
      return jsonError(400, 'NO_COMPANY', 'No restaurant profile')
    }

    const result = await onboardZatca(profile, parsed.data.otp)

    const device = await prisma.zatcaDevice.upsert({
      where: { businessProfileId: profile.id },
      create: {
        businessProfileId: profile.id,
        environment: result.environment,
        egsSerialNumber: result.egsSerialNumber,
        privateKeyEnc: result.privateKeyEnc,
        complianceCsid: result.complianceCsid,
        complianceSecretEnc: result.complianceSecretEnc,
        complianceRequestId: result.complianceRequestId,
        productionCsid: result.productionCsid,
        productionSecretEnc: result.productionSecretEnc,
        onboardedAt: result.onboardedAt,
      },
      update: {
        environment: result.environment,
        egsSerialNumber: result.egsSerialNumber,
        privateKeyEnc: result.privateKeyEnc,
        complianceCsid: result.complianceCsid,
        complianceSecretEnc: result.complianceSecretEnc,
        complianceRequestId: result.complianceRequestId,
        productionCsid: result.productionCsid,
        productionSecretEnc: result.productionSecretEnc,
        onboardedAt: result.onboardedAt,
        lastInvoiceHash: '',
        invoiceCounter: 0,
      },
    })

    await prisma.businessProfile.update({
      where: { id: profile.id },
      data: {
        zatcaOnboardingSkipped: false,
        zatcaEnvironment: result.environment,
      },
    })

    const row = await prisma.user.findUnique({
      where: { id: session.id },
      select: AUTH_USER_SELECT,
    })

    return jsonOk({
      device: mapZatcaDeviceStatus(device),
      complianceChecksPassed: result.complianceChecksPassed,
      sandboxVatUsed: result.sandboxVatUsed,
      user: row ? buildAuthUserFromRow(row) : null,
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/zatca-onboarding/compliance-csid')
  }
}
