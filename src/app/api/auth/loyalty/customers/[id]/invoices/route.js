import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { mapInvoiceListItemToJson } from '@/lib/invoices/map-invoice-json'
import { loadOwnedLoyaltyAccount } from '@/lib/loyalty/load-owned-loyalty-account'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

const invoiceListSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  invoiceDate: true,
  paymentMethod: true,
  grandTotal: true,
  totalVat: true,
  subtotal: true,
  zatcaStatus: true,
  zatcaLastError: true,
  qrCode: true,
  cryptographicStamp: true,
  loyaltyPointsRedeemed: true,
  loyaltyDiscountAmount: true,
  createdByStaff: { select: { id: true, name: true } },
}

/** @param {import('next/server').NextRequest} request */
export async function GET(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request, {
      action: 'read',
      subject: 'Loyalty',
    })
    if (auth.error) return auth.error
    const { id } = await context.params

    const account = await loadOwnedLoyaltyAccount(auth.profile.id, id)
    if (!account) {
      return jsonError(
        404,
        'LOYALTY_ACCOUNT_NOT_FOUND',
        'Loyalty account not found',
      )
    }

    const { searchParams } = new URL(request.url)
    const where = {
      businessProfileId: auth.profile.id,
      loyaltyAccountId: id,
    }
    const orderBy = { createdAt: 'desc' }

    if (!shouldPaginateListRequest(searchParams)) {
      const rows = await prisma.invoice.findMany({
        where,
        orderBy,
        take: 100,
        select: invoiceListSelect,
      })
      return jsonOk({
        invoices: rows.map((row) => ({
          ...mapInvoiceListItemToJson(row),
          loyaltyPointsRedeemed: row.loyaltyPointsRedeemed ?? null,
          loyaltyDiscountAmount: row.loyaltyDiscountAmount ?? null,
        })),
      })
    }

    const { page, limit, skip } = parseListPagination(searchParams)
    const [total, rows] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: invoiceListSelect,
      }),
    ])

    return jsonOk({
      invoices: rows.map((row) => ({
        ...mapInvoiceListItemToJson(row),
        loyaltyPointsRedeemed: row.loyaltyPointsRedeemed ?? null,
        loyaltyDiscountAmount: row.loyaltyDiscountAmount ?? null,
      })),
      pagination: buildPaginationMeta(page, limit, total),
    })
  } catch (err) {
    return handleRouteError(
      err,
      'GET /api/auth/loyalty/customers/[id]/invoices',
    )
  }
}
