import { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  queryAllCouponCodes,
  queryCouponCodesPage,
} from '@/lib/coupons/query-coupon-codes'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { csvEscape } from '@/lib/reports/export-csv'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * @param {string} filename
 * @param {string} csv
 */
function csvResponse(filename, csv) {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

/**
 * Load owned, non-deleted coupon; enforce UNIQUE_BATCH for codes list/export.
 * @param {string} businessProfileId
 * @param {string} id
 */
async function loadBatchCoupon(businessProfileId, id) {
  const row = await prisma.coupon.findFirst({
    where: { id, businessProfileId, ...WHERE_NOT_DELETED },
    select: { id: true, codeType: true, nameAr: true },
  })
  if (!row) return { error: jsonError(404, 'COUPON_NOT_FOUND', 'Coupon not found') }
  if (row.codeType !== 'UNIQUE_BATCH') {
    return {
      error: jsonError(
        400,
        'COUPON_CODES_ONLY_FOR_BATCH',
        'Individual codes are only available for unique batch coupons',
      ),
    }
  }
  return { coupon: row }
}

export async function GET(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params
    const loaded = await loadBatchCoupon(auth.profile.id, id)
    if (loaded.error) return loaded.error

    const { searchParams } = new URL(request.url)
    const format = (searchParams.get('format') ?? '').trim().toLowerCase()

    if (format === 'csv') {
      const availableOnly =
        (searchParams.get('availableOnly') ?? '').trim().toLowerCase() ===
          '1' ||
        (searchParams.get('availableOnly') ?? '').trim().toLowerCase() ===
          'true'
      const codes = await queryAllCouponCodes({
        db: prisma,
        couponId: id,
        businessProfileId: auth.profile.id,
        availableOnly,
      })
      const header = [
        'Ticket #',
        'Code',
        'Usage Limit',
        'Used Count',
        'Created Date',
      ]
      const lines = [
        header.map(csvEscape).join(','),
        ...codes.map((row) =>
          [
            row.ticketNumber,
            row.code ?? '',
            row.usageLimit ?? '',
            row.usedCount,
            row.createdAt,
          ]
            .map(csvEscape)
            .join(','),
        ),
      ]
      const safeName = String(loaded.coupon.nameAr ?? 'coupon')
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 40)
      const suffix = availableOnly ? 'available' : 'all'
      return csvResponse(
        `hisabi-pos-coupon-codes-${suffix}-${safeName || id}.csv`,
        `${lines.join('\n')}\n`,
      )
    }

    const result = await queryCouponCodesPage({
      db: prisma,
      couponId: id,
      businessProfileId: auth.profile.id,
      searchParams,
    })

    return jsonOk({
      codes: result.codes,
      pagination: result.pagination,
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/coupons/[id]/codes')
  }
}
