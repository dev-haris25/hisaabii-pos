import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { riyadhOrderDate } from '@/lib/orders/riyadh-order-date'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import {
  ensureDayEndDraft,
  listDayEndReports,
  mapDayEndReportToJson,
} from '@/lib/stock/day-end-report'
import { prisma } from '@/lib/prisma'

export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? 10) || 10))
    const fromRaw = (searchParams.get('from') ?? '').trim()
    const toRaw = (searchParams.get('to') ?? '').trim()
    const from = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : null
    const to = toRaw ? new Date(`${toRaw}T00:00:00.000Z`) : null
    const { total, reports } = await listDayEndReports(prisma, auth.profile.id, {
      skip: (page - 1) * limit,
      take: limit,
      from,
      to,
    })
    return jsonOk({
      reports: reports.map(mapDayEndReportToJson),
      total,
      page,
      limit,
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/stock/day-end')
  }
}

const openSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const body = openSchema.parse(await request.json().catch(() => ({})))
    const reportDate = body.date
      ? new Date(`${body.date}T00:00:00.000Z`)
      : riyadhOrderDate()
    const report = await ensureDayEndDraft(prisma, {
      businessProfileId: auth.profile.id,
      reportDate,
      userId: auth.session.id,
    })
    return jsonOk({ report: mapDayEndReportToJson(report) })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/stock/day-end')
  }
}
