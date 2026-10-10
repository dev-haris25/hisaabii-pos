import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { mapOfferAdminJson } from '@/lib/offers/map-offer-json'
import { queryOffersList } from '@/lib/offers/query-offers'
import { saveOffer } from '@/lib/offers/save-offer'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/** GET /api/auth/offers — server-side search / kind / status / pagination. */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const { page, limit } = parseListPagination(searchParams)
    const result = await queryOffersList({
      businessProfileId: auth.profile.id,
      search: searchParams.get('search') ?? '',
      kind: searchParams.get('kind') ?? '',
      status: searchParams.get('status') ?? '',
      page,
      limit,
    })
    return jsonOk({
      offers: result.offers,
      pagination: buildPaginationMeta(page, limit, result.total),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/offers')
  }
}

/** POST /api/auth/offers — create an offer / deal. */
export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const saved = await saveOffer({ businessProfileId: auth.profile.id, body })
    if (!saved.ok) {
      return jsonError(saved.status, saved.code, saved.message, saved.details)
    }
    return jsonOk({ offer: mapOfferAdminJson(saved.offer) })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/offers')
  }
}
