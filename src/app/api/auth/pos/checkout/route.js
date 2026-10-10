import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import {
  checkoutPosSale,
  posCheckoutBodySchema,
} from '@/lib/pos/checkout-pos-sale'
import { primaryKitchenOrder } from '@/lib/orders/primary-kitchen-order'
import { isOfferErrorCode } from '@/lib/offers/resolve-cart-offers'

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

    const parsed = posCheckoutBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    try {
      const invoice = await checkoutPosSale({
        profileId: auth.profileId,
        staffId: auth.session.id,
        body: parsed.data,
      })
      return jsonOk({
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          grandTotal: invoice.grandTotal,
          totalVat: invoice.totalVat,
          subtotal: invoice.subtotal,
          paymentMethod: invoice.paymentMethod,
          amountTendered: invoice.amountTendered,
          changeGiven: invoice.changeGiven,
          qrCode: invoice.qrCode,
          zatcaStatus: invoice.zatcaStatus,
          orderNumber: primaryKitchenOrder(invoice)?.orderNumber ?? null,
          invoiceDate: invoice.invoiceDate.toISOString(),
          sellerCompanyNameAr: invoice.sellerCompanyNameAr,
          sellerCompanyNameEn: invoice.sellerCompanyNameEn,
          sellerVatNumber: invoice.sellerVatNumber,
          sellerCrNumber: invoice.sellerCrNumber,
          sellerEmail: invoice.sellerEmail ?? null,
          sellerPhone: invoice.sellerPhone ?? null,
          staffName: auth.session.name ?? null,
          lines: invoice.lines.map((l) => ({
            id: l.id,
            nameAr: l.nameAr,
            nameEn: l.nameEn,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            lineTotal: l.lineTotal,
            vatAmount: l.vatAmount,
            modifiersSnapshot: l.modifiersSnapshot ?? null,
          })),
        },
      })
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      const message = e instanceof Error ? e.message : String(e)
      if (isOfferErrorCode(code)) {
        return jsonError(409, code, message, { offerId: e.offerId ?? null })
      }
      if (code === 'VALIDATION_ERROR') {
        return jsonError(400, code, message)
      }
      if (code === 'BUSINESS_PROFILE_REQUIRED') {
        return jsonError(403, code, 'Complete restaurant profile first')
      }
      if (code === 'ZATCA_NOT_ONBOARDED') {
        return jsonError(403, code, 'Complete ZATCA onboarding first')
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
      if (code === 'DISCOUNT_EXCEEDS_CAP') {
        return jsonError(400, code, 'Discount is above the restaurant cap')
      }
      if (code === 'COUPON_AND_MANUAL_DISCOUNT_CONFLICT') {
        return jsonError(400, code, message)
      }
      if (
        code === 'COUPON_AND_LOYALTY_CONFLICT' ||
        code === 'LOYALTY_AND_MANUAL_DISCOUNT_CONFLICT'
      ) {
        return jsonError(400, code, message)
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
        code === 'LOYALTY_REDEEM_POINTS_REQUIRED'
      ) {
        const status = code === 'LOYALTY_ACCOUNT_NOT_FOUND' ? 404 : 400
        return jsonError(status, code, message)
      }
      if (
        code === 'INVALID_COUPON_CODE' ||
        code === 'COUPON_INACTIVE' ||
        code === 'COUPON_NOT_YET_ACTIVE' ||
        code === 'COUPON_EXPIRED' ||
        code === 'COUPON_USAGE_LIMIT_REACHED' ||
        code === 'COUPON_CODE_USAGE_LIMIT_REACHED' ||
        code === 'COUPON_BELOW_MIN_ORDER' ||
        code === 'COUPON_BOGO_REQUIREMENTS_NOT_MET' ||
        code === 'COUPON_GET_ITEM_NOT_IN_CART' ||
        code === 'COUPON_COMBO_REQUIREMENTS_NOT_MET' ||
        code === 'COUPON_COMBO_NO_SAVINGS' ||
        code === 'COUPON_UNSUPPORTED_DISCOUNT_KIND' ||
        code === 'COUPON_DISCOUNT_CALCULATION_INVALID'
      ) {
        const status = code === 'INVALID_COUPON_CODE' ? 404 : 400
        return jsonError(status, code, message)
      }
      if (code === 'INSUFFICIENT_STOCK' || code === 'INSUFFICIENT_STOCK_CONFIRM') {
        const shortfalls =
          e && typeof e === 'object' && 'shortfalls' in e ? e.shortfalls : []
        return jsonError(
          409,
          code,
          code === 'INSUFFICIENT_STOCK_CONFIRM'
            ? 'Not enough stock — allow negative stock to continue'
            : 'Not enough stock for this order',
          shortfalls,
        )
      }
      if (
        code === 'NO_KITCHEN_STOCK_CONFIRM' ||
        code === 'NO_ALLOTMENT_CONFIRM'
      ) {
        const shortfalls =
          e && typeof e === 'object' && 'shortfalls' in e ? e.shortfalls : []
        return jsonError(
          409,
          'NO_KITCHEN_STOCK_CONFIRM',
          'Some items do not have enough kitchen stock',
          shortfalls,
        )
      }
      if (code === 'ZATCA_ERROR') {
        const raw = e instanceof Error ? e.message : String(e)
        console.error('[pos/checkout] ZATCA_ERROR:', raw)
        return jsonError(
          502,
          'ZATCA_ERROR',
          'Could not report the invoice to ZATCA',
        )
      }
      throw e
    }
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/pos/checkout')
  }
}
