import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { getClientIp, qrTableKey, rateLimitResponse } from '@/lib/api/rate-limit'
import { handleRouteError } from '@/lib/api/route-error'
import { isLoyaltyEnabledForProfile } from '@/lib/e-waiter/loyalty-enabled'
import { resolvePublicOrderTable } from '@/lib/e-waiter/resolve-public-order-table'
import { findOrCreateLoyaltyAccount } from '@/lib/loyalty/loyalty-account-access'

const bodySchema = z.object({
  phone: z.string().trim().min(1).max(32),
})

/**
 * Public loyalty phone login — find/create account only.
 * Does NOT create or touch TableSession.
 */
export async function POST(request, context) {
  try {
    const { slug, qrToken } = await context.params
    const limited = rateLimitResponse([
      ['qrLoginLoyaltyTable', qrTableKey(slug, qrToken)],
      ['qrLoginLoyaltyIp', getClientIp(request)],
    ])
    if (limited) return limited
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    if (!(await isLoyaltyEnabledForProfile(resolved.profile.id))) {
      return jsonError(
        400,
        'LOYALTY_MODULE_DISABLED',
        'Loyalty points are not enabled for this restaurant',
      )
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const result = await findOrCreateLoyaltyAccount(
      resolved.profile.id,
      parsed.data.phone,
    )
    if ('error' in result) {
      return jsonError(400, result.error, result.message)
    }

    return jsonOk({
      loyaltyAccountId: result.account.id,
      balance: result.account.balance,
      phone: result.account.phone,
    })
  } catch (err) {
    return handleRouteError(
      err,
      'POST /api/public/order/[slug]/[qrToken]/login-loyalty',
    )
  }
}
