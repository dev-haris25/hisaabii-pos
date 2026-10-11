import { z } from 'zod'

import { jsonError } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import { checkoutReplayResponse } from '@/lib/pos/checkout-replay'

const keySchema = z.string().trim().uuid()

/**
 * GET /api/auth/pos/checkout/lookup?key=<requestKey>
 * Read-only: was a checkout with this key saved in the active restaurant?
 * 200 with the same payload checkout returns, 404 when no sale exists for the
 * key, 409 CHECKOUT_ALREADY_PROCESSED when that sale was voided / deleted.
 */
export async function GET(request) {
  try {
    const auth = await requirePosRestaurant()
    if (auth.error) return auth.error

    const parsed = keySchema.safeParse(
      new URL(request.url).searchParams.get('key') ?? '',
    )
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'A valid request key is required')
    }

    const replay = await checkoutReplayResponse(
      auth.profileId,
      parsed.data,
      auth.session.name ?? null,
    )
    return replay ?? jsonError(404, 'NOT_FOUND', 'No sale was saved for this key')
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/pos/checkout/lookup')
  }
}
