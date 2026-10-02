import QRCode from 'qrcode'

import { jsonError } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  eWaiterOrderAbsoluteUrl,
  eWaiterOrderOriginFromRequest,
} from '@/lib/e-waiter/table-order-url'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

const QR_BITMAP_PX = 512

/**
 * Downloadable / printable PNG for a table’s public order URL.
 */
export async function GET(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    const row = await prisma.table.findFirst({
      where: {
        id,
        businessProfileId: auth.profile.id,
        ...WHERE_NOT_DELETED,
      },
      select: { id: true, name: true, qrToken: true },
    })
    if (!row) return jsonError(404, 'TABLE_NOT_FOUND', 'Table not found')
    if (!auth.profile.slug) {
      return jsonError(400, 'NO_COMPANY', 'Restaurant slug is missing')
    }

    const origin = eWaiterOrderOriginFromRequest(request)
    const orderUrl = eWaiterOrderAbsoluteUrl(
      origin,
      'en',
      auth.profile.slug,
      row.qrToken,
    )

    const png = await QRCode.toBuffer(orderUrl, {
      type: 'png',
      width: QR_BITMAP_PX,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    })

    const safeName = String(row.name)
      .trim()
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 40) || 'table'
    const filename = `table-${safeName}-qr.png`

    return new Response(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/tables/[id]/qr')
  }
}
