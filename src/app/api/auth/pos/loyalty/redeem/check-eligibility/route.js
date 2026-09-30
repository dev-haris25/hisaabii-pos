import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import { findLoyaltyAccountByPhone } from '@/lib/loyalty/loyalty-account-access'
import { checkLoyaltyRedeemEligibility } from '@/lib/loyalty/loyalty-redeem-eligibility'
import { prisma } from '@/lib/prisma'

const bodySchema = z
  .object({
    phone: z.string().min(1),
  })
  .strict()

/**
 * Map Step 3/4 phone failures via stable `reason` codes (not message text).
 *
 * @param {{ reason?: string, message?: string }} err
 * @returns {{ code: string, message: string }}
 */
function mapPhoneFormatError(err) {
  const message = String(err?.message ?? 'Invalid phone number')
  if (err?.reason === 'invalid_length') {
    return { code: 'LOYALTY_PHONE_INVALID_LENGTH', message }
  }
  if (err?.reason === 'invalid_prefix') {
    return { code: 'LOYALTY_PHONE_INVALID_PREFIX', message }
  }
  return { code: 'LOYALTY_PHONE_INVALID', message }
}

/**
 * POST /api/auth/pos/loyalty/redeem/check-eligibility
 * One-time redeem gate after the phone modal — read-only.
 */
export async function POST(request) {
  try {
    const auth = await requirePosRestaurant()
    if (auth.error) return auth.error

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

    // Read-only: findUnique only — never getOrCreate (would write defaults).
    const settings = await prisma.loyaltySettings.findUnique({
      where: { businessProfileId: auth.profileId },
    })
    if (!settings || settings.enabled !== true) {
      return jsonError(
        400,
        'LOYALTY_MODULE_DISABLED',
        'Loyalty points are not enabled for this restaurant',
      )
    }

    const resolved = await findLoyaltyAccountByPhone(
      auth.profileId,
      parsed.data.phone,
    )
    if (resolved && 'error' in resolved) {
      const mapped = mapPhoneFormatError(resolved)
      return jsonError(400, mapped.code, mapped.message)
    }
    if (!resolved?.account) {
      return jsonError(
        404,
        'LOYALTY_ACCOUNT_NOT_FOUND',
        'Loyalty account not found',
      )
    }

    const account = resolved.account
    const eligibility = checkLoyaltyRedeemEligibility(account, settings)
    if (!eligibility.eligible) {
      return jsonError(
        400,
        'LOYALTY_BELOW_MIN_BALANCE',
        'Balance is below the minimum required to redeem',
      )
    }

    return jsonOk({
      eligible: true,
      accountId: account.id,
      balance: account.balance,
    })
  } catch (err) {
    return handleRouteError(
      err,
      'POST /api/auth/pos/loyalty/redeem/check-eligibility',
    )
  }
}
