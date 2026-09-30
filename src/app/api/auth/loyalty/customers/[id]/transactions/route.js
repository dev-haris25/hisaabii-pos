import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { loadOwnedLoyaltyAccount } from '@/lib/loyalty/load-owned-loyalty-account'
import { mapLoyaltyTransactionToJson } from '@/lib/loyalty/map-loyalty-account-json'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

const transactionInclude = {
  invoice: { select: { id: true, invoiceNumber: true } },
  cashierUser: { select: { id: true, name: true } },
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
    const where = { accountId: id }
    const orderBy = { createdAt: 'desc' }

    if (!shouldPaginateListRequest(searchParams)) {
      const rows = await prisma.loyaltyTransaction.findMany({
        where,
        orderBy,
        take: 100,
        include: transactionInclude,
      })
      return jsonOk({
        transactions: rows.map(mapLoyaltyTransactionToJson),
      })
    }

    const { page, limit, skip } = parseListPagination(searchParams)
    const [total, rows] = await Promise.all([
      prisma.loyaltyTransaction.count({ where }),
      prisma.loyaltyTransaction.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: transactionInclude,
      }),
    ])

    return jsonOk({
      transactions: rows.map(mapLoyaltyTransactionToJson),
      pagination: buildPaginationMeta(page, limit, total),
    })
  } catch (err) {
    return handleRouteError(
      err,
      'GET /api/auth/loyalty/customers/[id]/transactions',
    )
  }
}
