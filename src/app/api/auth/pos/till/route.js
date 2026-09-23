import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import { prisma } from '@/lib/prisma'
import { mapTillToJson } from '@/lib/tills/map-till-json'

export async function GET(request) {
  try {
    const auth = await requirePosRestaurant()
    if (auth.error) return auth.error

    const tillId = new URL(request.url).searchParams.get('id')?.trim()
    if (!tillId) {
      return jsonError(400, 'VALIDATION_ERROR', 'Till id required')
    }

    const [row, profile] = await Promise.all([
      prisma.posTill.findFirst({
        where: { id: tillId, businessProfileId: auth.profileId },
      }),
      prisma.businessProfile.findUnique({
        where: { id: auth.profileId },
        select: { primaryPosTillId: true },
      }),
    ])
    if (!row) return jsonError(404, 'NOT_FOUND', 'Till not found')

    return jsonOk({
      primaryPosTillId: profile?.primaryPosTillId ?? null,
      till: mapTillToJson(row, profile?.primaryPosTillId),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/pos/till')
  }
}
