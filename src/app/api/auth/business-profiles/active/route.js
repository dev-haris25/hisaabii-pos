import {
  AUTH_USER_SELECT,
  buildAuthUserFromRowAsync,
} from '@/lib/auth/auth-user-json'
import { userCanAccessBusinessProfile } from '@/lib/auth/accessible-business-profiles'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/auth/business-profiles/active — switch active restaurant.
 * Any member with access to the target restaurant may switch.
 */
export async function PATCH(request) {
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

    const businessProfileId = body?.businessProfileId
    if (typeof businessProfileId !== 'string' || !businessProfileId.trim()) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid businessProfileId')
    }

    const profileId = businessProfileId.trim()
    const canAccess = await userCanAccessBusinessProfile(session.id, profileId)
    if (!canAccess) {
      return jsonError(404, 'NOT_FOUND', 'Profile not found')
    }

    await prisma.user.update({
      where: { id: session.id },
      data: { activeBusinessProfileId: profileId },
    })

    const row = await prisma.user.findUnique({
      where: { id: session.id },
      select: AUTH_USER_SELECT,
    })
    if (!row) {
      return jsonError(500, 'SERVER_ERROR', 'User not found')
    }

    return jsonOk({ user: await buildAuthUserFromRowAsync(row) })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/business-profiles/active')
  }
}
