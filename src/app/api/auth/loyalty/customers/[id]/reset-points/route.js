import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { adjustLoyaltyAccountBalance } from '@/lib/loyalty/loyalty-account-access'
import { loadOwnedLoyaltyAccount } from '@/lib/loyalty/load-owned-loyalty-account'
import { mapLoyaltyAccountToJson } from '@/lib/loyalty/map-loyalty-account-json'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * Reset balance to zero — uses `update` (record kept; not a soft-delete).
 * Confirmation dialogs belong in UI (Step 15); this route executes immediately.
 *
 * @param {import('next/server').NextRequest} request
 */
export async function POST(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request, {
      action: 'update',
      subject: 'Loyalty',
    })
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedLoyaltyAccount(auth.profile.id, id)
    if (!existing) {
      return jsonError(
        404,
        'LOYALTY_ACCOUNT_NOT_FOUND',
        'Loyalty account not found',
      )
    }

    const result = await adjustLoyaltyAccountBalance(id, '0', 'absolute')
    if ('error' in result) {
      return jsonError(404, 'LOYALTY_ACCOUNT_NOT_FOUND', result.message)
    }

    return jsonOk({
      customer: mapLoyaltyAccountToJson(result.account),
    })
  } catch (err) {
    return handleRouteError(
      err,
      'POST /api/auth/loyalty/customers/[id]/reset-points',
    )
  }
}
