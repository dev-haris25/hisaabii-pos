import { jsonError, jsonOk } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { payslipCategoryUpsertBodySchema } from '@/lib/hr/payslip-categories/payslip-category-body-schema'
import {
  ensureSystemAdvancePayslipCategory,
  isSystemAdvancePayslipCategory,
  SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME,
} from '@/lib/hr/payslip-categories/system-advance-category'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { prisma } from '@/lib/prisma'

/**
 * @param {{
 *   id: string
 *   name: string
 *   type: string
 *   defaultAmount: string
 *   businessProfileId?: string
 * }} row
 */
function mapPayslipCategoryToJson(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    defaultAmount: row.defaultAmount,
    isSystem: isSystemAdvancePayslipCategory(row),
  }
}

const payslipCategorySelect = {
  id: true,
  name: true,
  type: true,
  defaultAmount: true,
  businessProfileId: true,
}

export async function GET(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { searchParams } = new URL(request.url)
  const search = (searchParams.get('search') ?? '').trim()

  await ensureSystemAdvancePayslipCategory(profile.id)

  const where = {
    businessProfileId: profile.id,
    ...WHERE_NOT_DELETED,
  }

  if (search) {
    where.name = { contains: search, mode: 'insensitive' }
  }

  if (!shouldPaginateListRequest(searchParams)) {
    const rows = await prisma.payslipCategory.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      select: payslipCategorySelect,
    })
    return jsonOk({ items: rows.map(mapPayslipCategoryToJson) })
  }

  const { page, limit, skip } = parseListPagination(searchParams)
  const [total, rows] = await Promise.all([
    prisma.payslipCategory.count({ where }),
    prisma.payslipCategory.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      select: payslipCategorySelect,
      skip,
      take: limit,
    }),
  ])

  return jsonOk({
    items: rows.map(mapPayslipCategoryToJson),
    pagination: buildPaginationMeta(page, limit, total),
  })
}

export async function POST(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = payslipCategoryUpsertBodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
  }

  const { name, type, defaultAmount } = parsed.data

  if (
    name.trim().toLowerCase() ===
    SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME.toLowerCase()
  ) {
    return jsonError(
      403,
      'SYSTEM_PAYSLIP_CATEGORY',
      'The Advance payslip category is system-managed',
    )
  }

  const existingInsensitive = await prisma.payslipCategory.findFirst({
    where: {
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (existingInsensitive) {
    return jsonError(
      409,
      'DUPLICATE_PAYSLIP_CATEGORY',
      'A payslip category with this name already exists',
    )
  }

  try {
    const created = await prisma.payslipCategory.create({
      data: {
        businessProfileId: profile.id,
        name,
        type,
        defaultAmount,
      },
      select: payslipCategorySelect,
    })
    const item = mapPayslipCategoryToJson(created)
    return jsonOk({ item, payslipCategory: item })
  } catch (err) {
    console.error('[hisabi:hr-payslip-categories] POST failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}
