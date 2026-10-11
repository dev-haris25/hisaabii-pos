import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { zatcaSkipBodySchema } from '@/lib/auth/schemas'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { getBusinessProfileAccess } from '@/lib/rbac/business-profile-access'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/auth/zatca-onboarding/skip
 * Mark restaurant `zatcaOnboardingSkipped`. Optional `businessProfileId` targets
 * a specific membership restaurant (create flow / list modal).
 * Requires full access or update BusinessProfile on THAT restaurant.
 */
export async function POST(request) {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }

    let rawBody = {}
    try {
      rawBody = await request.json()
    } catch {
      rawBody = {}
    }

    const parsed = zatcaSkipBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
    }

    const requestedProfileId = parsed.data.businessProfileId ?? null

    if (requestedProfileId) {
      const access = await getBusinessProfileAccess(
        session.id,
        requestedProfileId,
      )
      if (!access.member) {
        return jsonError(403, 'FORBIDDEN', 'Invalid restaurant profile')
      }
      if (!access.canManage) {
        return jsonError(403, 'FORBIDDEN', 'Not allowed')
      }
      await prisma.businessProfile.update({
        where: { id: requestedProfileId },
        data: { zatcaOnboardingSkipped: true },
      })
    } else {
      if (session.needsBusinessProfileOnboarding) {
        return jsonError(
          400,
          'BUSINESS_PROFILE_REQUIRED',
          'Complete restaurant profile first',
        )
      }

      if (!session.needsZatcaOnboarding) {
        return jsonError(400, 'NOT_APPLICABLE', 'ZATCA onboarding is not active')
      }

      const profile = await getResolvedActiveBusinessProfile(session.id)
      if (!profile) {
        return jsonError(400, 'NO_COMPANY', 'No restaurant profile')
      }
      const access = await getBusinessProfileAccess(session.id, profile.id)
      if (!access.canManage) {
        return jsonError(403, 'FORBIDDEN', 'Not allowed')
      }

      await prisma.businessProfile.update({
        where: { id: profile.id },
        data: { zatcaOnboardingSkipped: true },
      })
    }

    // Same shape as GET /api/auth/me (with RBAC), so the client lands right.
    const user = await getSessionUser()
    if (!user) {
      return jsonError(500, 'SERVER_ERROR', 'User not found')
    }

    return jsonOk({ user })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/zatca-onboarding/skip')
  }
}
