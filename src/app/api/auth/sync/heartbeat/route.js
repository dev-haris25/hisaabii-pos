import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { tillHeartbeatBodySchema } from '@/lib/tills/till-heartbeat-body-schema'
import { isTillHeartbeatFresh } from '@/lib/tills/till-heartbeat'

/**
 * POST /api/auth/sync/heartbeat
 * Desktop till liveness + pending outbox count (every ~15–20s).
 */
export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest({
      request,
      skipPermissionCheck: true,
    })
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = tillHeartbeatBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const tillId = parsed.data.tillId
    const till = await prisma.posTill.findFirst({
      where: {
        id: tillId,
        businessProfileId: auth.profile.id,
      },
      select: { id: true },
    })
    if (!till) {
      return jsonError(404, 'NOT_FOUND', 'Till not found')
    }

    const now = new Date()
    /** @type {{ lastHeartbeatAt: Date, pendingUploadCount?: number }} */
    const data = { lastHeartbeatAt: now }
    if (typeof parsed.data.pendingUploadCount === 'number') {
      data.pendingUploadCount = parsed.data.pendingUploadCount
    }

    const updated = await prisma.posTill.update({
      where: { id: tillId },
      data,
      select: {
        id: true,
        lastHeartbeatAt: true,
        pendingUploadCount: true,
      },
    })

    return jsonOk({
      tillId: updated.id,
      lastHeartbeatAt: updated.lastHeartbeatAt?.toISOString() ?? null,
      pendingUploadCount: updated.pendingUploadCount,
      online: isTillHeartbeatFresh(updated.lastHeartbeatAt, now.getTime()),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/sync/heartbeat')
  }
}
