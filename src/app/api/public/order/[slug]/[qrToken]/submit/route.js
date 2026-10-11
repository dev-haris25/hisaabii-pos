import { jsonError, jsonOk } from '@/lib/api/json-response'
import { qrTableKey, rateLimitResponse } from '@/lib/api/rate-limit'
import { handleRouteError } from '@/lib/api/route-error'
import {
  eWaiterSubmitBodySchema,
  submitEWaiterOrder,
} from '@/lib/e-waiter/submit-e-waiter-order'
import { resolvePublicOrderTable } from '@/lib/e-waiter/resolve-public-order-table'
import { prisma } from '@/lib/prisma'

/**
 * Public E-Waiter order submit (unauthenticated).
 * Geofence enforced server-side on first round only.
 */
export async function POST(request, context) {
  try {
    const { slug, qrToken } = await context.params
    const limited = rateLimitResponse([
      ['qrSubmitTable', qrTableKey(slug, qrToken)],
    ])
    if (limited) return limited
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = eWaiterSubmitBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { id: resolved.profile.id },
      select: {
        id: true,
        locationLat: true,
        locationLng: true,
        locationRadiusMeters: true,
      },
    })
    if (!profile) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    const result = await submitEWaiterOrder({
      profile,
      table: resolved.table,
      body: parsed.data,
    })

    if (!result.ok) {
      return jsonError(result.status, result.code, result.message)
    }

    return jsonOk({
      sessionId: result.sessionId,
      kitchenOrderId: result.kitchenOrderId,
      orderNumber: result.orderNumber,
      roundNumber: result.roundNumber,
      status: result.status,
      createdSession: result.createdSession,
      loyaltyAccountId: result.loyaltyAccountId ?? null,
      tableName: resolved.table.name,
    })
  } catch (err) {
    return handleRouteError(
      err,
      'POST /api/public/order/[slug]/[qrToken]/submit',
    )
  }
}
