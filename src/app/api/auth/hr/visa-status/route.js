import { jsonOk, jsonError } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { prisma } from '@/lib/prisma'
import { mapEmployeeToJson } from '@/lib/hr/employees/map-employee-to-json'
import { computeVisaDaysLeft } from '@/lib/hr/visa-expiry-status'

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth
  const { searchParams } = new URL(request.url)
  const search = (searchParams.get('search') ?? '').trim()

  const where = {
    businessProfileId: profile.id,
    ...WHERE_NOT_DELETED,
    visaExpiry: { not: null },
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { visaNumber: { contains: search, mode: 'insensitive' } },
    ]
  }

  /** @param {any} row */
  const toItem = (row) => ({
    ...mapEmployeeToJson(row),
    daysLeft: row.visaExpiry ? computeVisaDaysLeft(row.visaExpiry) : null,
  })

  if (!shouldPaginateListRequest(searchParams)) {
    const rows = await prisma.employee.findMany({
      where,
      orderBy: [{ visaExpiry: 'asc' }],
    })
    return jsonOk({ items: rows.map(toItem) })
  }

  const { page, limit, skip } = parseListPagination(searchParams)
  const [total, rows] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: [{ visaExpiry: 'asc' }],
      skip,
      take: limit,
    }),
  ])

  return jsonOk({
    items: rows.map(toItem),
    pagination: buildPaginationMeta(page, limit, total),
  })
}
