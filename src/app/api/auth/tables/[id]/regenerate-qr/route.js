import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { allocateUniqueTableQrToken } from '@/lib/e-waiter/allocate-table-qr-token'
import { mapTableToJson } from '@/lib/e-waiter/map-table-json'
import {
  eWaiterOrderAbsoluteUrl,
  eWaiterOrderOriginFromRequest,
} from '@/lib/e-waiter/table-order-url'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

export async function POST(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await prisma.table.findFirst({
      where: {
        id,
        businessProfileId: auth.profile.id,
        ...WHERE_NOT_DELETED,
      },
    })
    if (!existing) return jsonError(404, 'TABLE_NOT_FOUND', 'Table not found')

    const qrToken = await allocateUniqueTableQrToken()
    const row = await prisma.table.update({
      where: { id },
      data: { qrToken },
    })

    const origin = eWaiterOrderOriginFromRequest(request)
    const orderUrl = auth.profile.slug
      ? eWaiterOrderAbsoluteUrl(origin, 'en', auth.profile.slug, row.qrToken)
      : null

    return jsonOk({
      table: mapTableToJson(row, { orderUrl }),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/tables/[id]/regenerate-qr')
  }
}
