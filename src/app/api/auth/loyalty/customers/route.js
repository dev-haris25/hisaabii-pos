import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { mapLoyaltyAccountToJson } from '@/lib/loyalty/map-loyalty-account-json'
import { normalizeLoyaltyPhone } from '@/lib/loyalty/normalize-loyalty-phone'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * Build phone search filter:
 * - Full valid Saudi mobile → exact match on normalized phone (index-friendly)
 * - Otherwise → digits-only `contains` for partial fragments (e.g. "05012")
 *
 * @param {string} searchRaw
 * @returns {Record<string, unknown> | null}
 */
function phoneSearchWhere(searchRaw) {
  const trimmed = searchRaw.trim()
  if (!trimmed) return null

  const normalized = normalizeLoyaltyPhone(trimmed)
  if (normalized.valid) {
    return { phone: normalized.normalized }
  }

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  return { phone: { contains: digits } }
}

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request, {
      action: 'read',
      subject: 'Loyalty',
    })
    if (auth.error) return auth.error
    const { profile } = auth

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim()

    /** @type {Record<string, unknown>} */
    const where = { businessProfileId: profile.id, ...WHERE_NOT_DELETED }
    const phoneFilter = phoneSearchWhere(search)
    if (phoneFilter) Object.assign(where, phoneFilter)

    const orderBy = [{ createdAt: 'desc' }, { phone: 'asc' }]

    if (shouldPaginateListRequest(searchParams)) {
      const { page, limit, skip } = parseListPagination(searchParams, {
        defaultLimit: 10,
      })
      const [total, rows] = await Promise.all([
        prisma.loyaltyAccount.count({ where }),
        prisma.loyaltyAccount.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
      ])
      return jsonOk({
        customers: rows.map(mapLoyaltyAccountToJson),
        pagination: buildPaginationMeta(page, limit, total),
      })
    }

    const rows = await prisma.loyaltyAccount.findMany({
      where,
      orderBy,
    })
    return jsonOk({
      customers: rows.map(mapLoyaltyAccountToJson),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/loyalty/customers')
  }
}
