import {
  AUTH_USER_SELECT,
  buildAuthUserFromRow,
} from '@/lib/auth/auth-user-json'
import { userCanAccessBusinessProfile } from '@/lib/auth/accessible-business-profiles'
import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { zatcaSkipBodySchema } from '@/lib/auth/schemas'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/auth/zatca-onboarding/skip
 * Mark restaurant `zatcaOnboardingSkipped`. Optional `businessProfileId` targets
 * a specific membership restaurant (create flow / list modal).
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
      const canAccess = await userCanAccessBusinessProfile(
        session.id,
        requestedProfileId,
      )
      if (!canAccess) {
        return jsonError(403, 'FORBIDDEN', 'Invalid restaurant profile')
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

      await prisma.businessProfile.update({
        where: { id: profile.id },
        data: { zatcaOnboardingSkipped: true },
      })
    }

    const row = await prisma.user.findUnique({
      where: { id: session.id },
      select: AUTH_USER_SELECT,
    })
    if (!row) {
      return jsonError(500, 'SERVER_ERROR', 'User not found')
    }

    return jsonOk({ user: buildAuthUserFromRow(row) })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/zatca-onboarding/skip')
  }
}
