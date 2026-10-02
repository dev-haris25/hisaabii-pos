import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  loadPublicTableSessionRounds,
  mapPublicRoundJson,
} from '@/lib/e-waiter/resolve-e-waiter-order-lines'
import { resolvePublicOrderTable } from '@/lib/e-waiter/resolve-public-order-table'

/**
 * List all non-cancelled rounds for the open table session (public guest).
 *
 * @param {import('next/server').NextRequest} _request
 * @param {{ params: Promise<{ slug: string, qrToken: string }> }} context
 */
export async function GET(_request, context) {
  try {
    const { slug, qrToken } = await context.params
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    const rows = await loadPublicTableSessionRounds(
      resolved.profile,
      resolved.table,
    )

    return jsonOk({
      rounds: rows.map((row) =>
        mapPublicRoundJson(row, resolved.profile.slug),
      ),
    })
  } catch (err) {
    return handleRouteError(
      err,
      'GET /api/public/order/[slug]/[qrToken]/rounds',
    )
  }
}
