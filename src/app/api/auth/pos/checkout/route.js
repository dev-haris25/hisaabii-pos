import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import {
  checkoutPosSale,
  posCheckoutBodySchema,
} from '@/lib/pos/checkout-pos-sale'

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
          orderNumber: invoice.kitchenOrder?.orderNumber ?? null,
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
          })),
        },
      })
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      if (code === 'BUSINESS_PROFILE_REQUIRED') {
        return jsonError(403, code, 'Complete restaurant profile first')
      }
      if (code === 'ZATCA_NOT_ONBOARDED') {
        return jsonError(403, code, 'Complete ZATCA onboarding first')
      }
      if (code === 'INVALID_MENU_ITEM') {
        return jsonError(400, code, 'One or more menu items are invalid')
      }
      if (code === 'INSUFFICIENT_TENDER') {
        return jsonError(400, code, 'Amount tendered is less than the total')
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
