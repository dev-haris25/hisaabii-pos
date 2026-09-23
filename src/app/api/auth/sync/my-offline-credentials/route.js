import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/auth/sync/my-offline-credentials
 * After cloud login, desktop refreshes the local SQLite password hash.
 * Returns only the signed-in user's credential fields (never other users).
 */
export async function GET() {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }

    const row = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        active: true,
        emailVerified: true,
        preferredLocale: true,
        activeBusinessProfileId: true,
      },
    })
    if (!row) {
      return jsonError(404, 'NOT_FOUND', 'User not found')
    }

    return jsonOk({
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        passwordHash: row.passwordHash,
        active: row.active,
        emailVerified: row.emailVerified,
        preferredLocale: row.preferredLocale,
        activeBusinessProfileId: row.activeBusinessProfileId,
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/sync/my-offline-credentials')
  }
}
