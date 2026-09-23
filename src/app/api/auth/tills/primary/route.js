import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { mapTillToJson } from '@/lib/tills/map-till-json'
import { setPrimaryPosTillId } from '@/lib/tills/primary-pos-till'
import { assertPrimarySwitchAllowed } from '@/lib/tills/primary-switch-status'
import { setPrimaryTillBodySchema } from '@/lib/tills/set-primary-till-body-schema'

/**
 * POST /api/auth/tills/primary
 * Body: { tillId }
 * Blocked when current primary is offline or has pending outbox (Step 8).
 */
export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = setPrimaryTillBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    try {
      await assertPrimarySwitchAllowed(auth.profile.id, parsed.data.tillId)
      await setPrimaryPosTillId(auth.profile.id, parsed.data.tillId)
    } catch (err) {
      if (err?.code === 'TILL_NOT_FOUND') {
        return jsonError(404, 'NOT_FOUND', 'Till not found')
      }
      if (err?.code === 'PRIMARY_TILL_OFFLINE') {
        return jsonError(
          409,
          'PRIMARY_TILL_OFFLINE',
          'The current primary till is offline',
          err.details,
        )
      }
      if (err?.code === 'PRIMARY_TILL_SYNCING') {
        return jsonError(
          409,
          'PRIMARY_TILL_SYNCING',
          'The primary till still has data waiting to sync',
          err.details,
        )
      }
      throw err
    }

    const [profile, rows] = await Promise.all([
      prisma.businessProfile.findUnique({
        where: { id: auth.profile.id },
        select: { primaryPosTillId: true },
      }),
      prisma.posTill.findMany({
        where: { businessProfileId: auth.profile.id },
        orderBy: [{ createdAt: 'asc' }],
      }),
    ])

    const primaryPosTillId = profile?.primaryPosTillId ?? null
    return jsonOk({
      primaryPosTillId,
      tills: rows.map((row) => mapTillToJson(row, primaryPosTillId)),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/tills/primary')
  }
}
