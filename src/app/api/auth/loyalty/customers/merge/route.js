import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { loadOwnedLoyaltyAccount } from '@/lib/loyalty/load-owned-loyalty-account'
import { mergeLoyaltyAccounts } from '@/lib/loyalty/loyalty-account-access'
import { loyaltyMergeBodySchema } from '@/lib/loyalty/loyalty-customer-schemas'
import { mapLoyaltyAccountToJson } from '@/lib/loyalty/map-loyalty-account-json'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * Merge uses `delete` — registry is CRUD-only (no custom `merge` action);
 * merging soft-deletes the duplicate account.
 *
 * @param {import('next/server').NextRequest} request
 */
export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest(request, {
      action: 'delete',
      subject: 'Loyalty',
    })
    if (auth.error) return auth.error
    const { profile } = auth

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = loyaltyMergeBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const { survivorAccountId, duplicateAccountId } = parsed.data

    const [survivorOwned, duplicateOwned] = await Promise.all([
      loadOwnedLoyaltyAccount(profile.id, survivorAccountId),
      loadOwnedLoyaltyAccount(profile.id, duplicateAccountId),
    ])
    if (!survivorOwned || !duplicateOwned) {
      return jsonError(
        404,
        'LOYALTY_ACCOUNT_NOT_FOUND',
        'One or both loyalty accounts were not found',
      )
    }

    const result = await mergeLoyaltyAccounts(
      survivorAccountId,
      duplicateAccountId,
    )

    if ('error' in result) {
      if (result.error === 'SAME_ACCOUNT') {
        return jsonError(400, 'LOYALTY_MERGE_SAME_ACCOUNT', result.message)
      }
      if (result.error === 'ACCOUNT_ALREADY_DELETED') {
        return jsonError(400, 'LOYALTY_ACCOUNT_ALREADY_DELETED', result.message)
      }
      return jsonError(404, 'LOYALTY_ACCOUNT_NOT_FOUND', result.message)
    }

    return jsonOk({
      customer: mapLoyaltyAccountToJson(result.survivor),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/loyalty/customers/merge')
  }
}
