import { jsonError, jsonOk } from '@/lib/api/json-response'
import {
  primaryKitchenOrder,
  primaryKitchenOrderInclude,
} from '@/lib/orders/primary-kitchen-order'
import { prisma } from '@/lib/prisma'

/**
 * Receipt payload for a saved sale — the same shape for a fresh checkout, a
 * sale whose ZATCA report failed, and a replay of an earlier request key.
 *
 * @param {any} invoice invoice with `lines` and `kitchenOrders`
 * @param {string | null} staffName
 */
export function checkoutInvoiceJson(invoice, staffName) {
  return {
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
    staffName,
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
  }
}

/**
 * The sale already saved for a checkout request key, as the response a
 * checkout would give for it — or null when no sale exists for the key.
 * A sale that was voided or soft-deleted since → 409 CHECKOUT_ALREADY_PROCESSED.
 *
 * @param {string} businessProfileId
 * @param {string} requestKey
 * @param {string | null} fallbackStaffName
 * @returns {Promise<Response | null>}
 */
export async function checkoutReplayResponse(
  businessProfileId,
  requestKey,
  fallbackStaffName,
) {
  const invoice = await prisma.invoice.findUnique({
    where: {
      businessProfileId_checkoutRequestKey: {
        businessProfileId,
        checkoutRequestKey: requestKey,
      },
    },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      kitchenOrders: primaryKitchenOrderInclude(),
      createdByStaff: { select: { name: true } },
    },
  })
  if (!invoice) return null
  if (invoice.deletedAt || invoice.status === 'voided') {
    return jsonError(
      409,
      'CHECKOUT_ALREADY_PROCESSED',
      'This sale was already processed and has since been cancelled',
    )
  }
  const reported =
    Boolean(invoice.qrCode) &&
    (invoice.zatcaStatus === 'reported' || invoice.zatcaStatus === 'cleared')
  return jsonOk({
    invoice: checkoutInvoiceJson(
      invoice,
      invoice.createdByStaff?.name ?? fallbackStaffName,
    ),
    ...(reported ? {} : { zatcaReportFailed: true }),
  })
}
