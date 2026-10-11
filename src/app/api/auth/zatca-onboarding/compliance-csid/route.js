import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { zatcaOnboardBodySchema } from '@/lib/auth/schemas'
import { getBusinessProfileAccess } from '@/lib/rbac/business-profile-access'
import { isZatcaEnabled } from '@/lib/zatca/env'
import {
  buildSupplierFromProfile,
  mapZatcaDeviceStatus,
  onboardZatca,
} from '@/lib/zatca/onboard'
import { prisma } from '@/lib/prisma'

/**
 * Target restaurant (explicit id or the active one) plus what the user may do
 * on it, judged by THAT restaurant's ability.
 *
 * @param {{ id: string }} session
 * @param {string | null | undefined} businessProfileId
 * @returns {Promise<
 *   | { error: Response }
 *   | { profile: import('@/generated/prisma/client').BusinessProfile, access: Awaited<ReturnType<typeof getBusinessProfileAccess>> }
 * >}
 */
async function resolveTargetProfile(session, businessProfileId) {
  if (businessProfileId) {
    const access = await getBusinessProfileAccess(session.id, businessProfileId)
    if (!access.member) {
      return { error: jsonError(403, 'FORBIDDEN', 'Invalid restaurant profile') }
    }
    const profile = await prisma.businessProfile.findUnique({
      where: { id: businessProfileId },
    })
    if (!profile) {
      return { error: jsonError(400, 'NO_COMPANY', 'No restaurant profile') }
    }
    return { profile, access }
  }
  const profile = await getResolvedActiveBusinessProfile(session.id)
  if (!profile) {
    return { error: jsonError(400, 'NO_COMPANY', 'No restaurant profile') }
  }
  return { profile, access: await getBusinessProfileAccess(session.id, profile.id) }
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

    const target = await resolveTargetProfile(session, businessProfileId)
    if ('error' in target) return target.error
    if (!target.access.canRead) {
      return jsonError(403, 'FORBIDDEN', 'Not allowed')
    }
    const { profile } = target

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

    const target = await resolveTargetProfile(
      session,
      parsed.data.businessProfileId ?? null,
    )
    if ('error' in target) return target.error
    // Must run before any call to ZATCA.
    if (!target.access.canManage) {
      return jsonError(403, 'FORBIDDEN', 'Not allowed')
    }
    const { profile } = target

    if (!isZatcaEnabled()) {
      return jsonError(503, 'ZATCA_DISABLED', 'ZATCA integration is disabled')
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

    // Same shape as GET /api/auth/me (with RBAC), so the client lands right.
    const user = await getSessionUser()

    return jsonOk({
      device: mapZatcaDeviceStatus(device),
      complianceChecksPassed: result.complianceChecksPassed,
      sandboxVatUsed: result.sandboxVatUsed,
      user: user ?? null,
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/zatca-onboarding/compliance-csid')
  }
}
