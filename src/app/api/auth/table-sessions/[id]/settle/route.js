import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  settleTableSession,
  settleTableSessionBodySchema,
} from '@/lib/e-waiter/settle-table-session'
import { isOfferErrorCode } from '@/lib/offers/resolve-cart-offers'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * POST /api/auth/table-sessions/[id]/settle
 * Close E-Waiter session → invoice via checkoutPosSale settlement mode.
 * RBAC: TableSession update.
 */
export async function POST(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id) {
      return jsonError(400, 'VALIDATION_ERROR', 'Missing session id')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = settleTableSessionBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    try {
      const result = await settleTableSession({
        profileId: auth.profile.id,
        staffId: auth.session.id,
        sessionId: id,
        body: parsed.data,
      })
      return jsonOk(result)
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      const message = e instanceof Error ? e.message : String(e)

      if (isOfferErrorCode(code)) {
        return jsonError(409, code, message)
      }
      if (code === 'SESSION_NOT_FOUND') {
        return jsonError(404, code, message)
      }
      if (
        code === 'SESSION_ALREADY_CLOSED' ||
        code === 'SESSION_ALREADY_SETTLED' ||
        code === 'SESSION_EMPTY_NO_ROUNDS' ||
        code === 'SESSION_EMPTY_NO_LINES' ||
        code === 'SESSION_ROUNDS_NOT_READY'
      ) {
        return jsonError(409, code, message)
      }
      if (code === 'BUSINESS_PROFILE_REQUIRED' || code === 'ZATCA_NOT_ONBOARDED') {
        return jsonError(403, code, message)
      }
      if (code === 'INVALID_MENU_ITEM') {
        return jsonError(400, code, 'One or more menu items are invalid')
      }
      if (code === 'INVALID_VARIANT' || code === 'INVALID_CUSTOMIZATION') {
        return jsonError(400, code, 'One or more item options are invalid')
      }
      if (code === 'INSUFFICIENT_TENDER') {
        return jsonError(400, code, 'Amount tendered is less than the total')
      }
      if (
        code === 'LOYALTY_ACCOUNT_NOT_FOUND' ||
        code === 'LOYALTY_MODULE_DISABLED' ||
        code === 'LOYALTY_BELOW_MIN_BALANCE' ||
        code === 'LOYALTY_BELOW_MIN_ORDER' ||
        code === 'LOYALTY_NO_REDEEMABLE_ITEMS' ||
        code === 'LOYALTY_REDEEM_AMOUNT_INVALID' ||
        code === 'LOYALTY_REDEEM_AMOUNT_NOT_POSITIVE' ||
        code === 'LOYALTY_REDEEM_EXCEEDS_CEILING' ||
        code === 'LOYALTY_BALANCE_CHANGED_RETRY' ||
        code === 'LOYALTY_ACCOUNT_ID_REQUIRED' ||
        code === 'LOYALTY_REDEEM_POINTS_REQUIRED' ||
        code === 'COUPON_AND_LOYALTY_CONFLICT' ||
        code === 'LOYALTY_AND_MANUAL_DISCOUNT_CONFLICT' ||
        code === 'COUPON_AND_MANUAL_DISCOUNT_CONFLICT' ||
        code === 'COUPON_NOT_FOUND' ||
        code === 'COUPON_NOT_ELIGIBLE' ||
        code === 'COUPON_USAGE_LIMIT' ||
        code === 'INVALID_COUPON_CODE' ||
        code === 'COUPON_INACTIVE' ||
        code === 'COUPON_EXPIRED' ||
        code === 'COUPON_BELOW_MIN_ORDER' ||
        code === 'DISCOUNT_EXCEEDS_CAP' ||
        code === 'INVALID_DISCOUNT'
      ) {
        const status = code === 'LOYALTY_ACCOUNT_NOT_FOUND' ? 404 : 400
        return jsonError(status, code, message)
      }
      if (
        code.startsWith('SETTLEMENT_KITCHEN_ORDER') ||
        code === 'SETTLEMENT_KITCHEN_ORDERS_REQUIRED'
      ) {
        return jsonError(409, code, message)
      }
      if (code === 'ZATCA_ERROR') {
        console.error('[table-sessions/settle] ZATCA_ERROR:', message)
        return jsonError(
          502,
          'ZATCA_ERROR',
          'Could not report the invoice to ZATCA',
        )
      }
      throw e
    }
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/table-sessions/[id]/settle')
  }
}
