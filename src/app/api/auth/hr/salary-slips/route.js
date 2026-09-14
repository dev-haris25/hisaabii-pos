import { jsonOk, jsonError } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { salarySlipUpsertBodySchema } from '@/lib/hr/salary-slips/salary-slip-body-schema'
import { mapSalarySlipToJson, mapSalarySlipsToJson } from '@/lib/hr/salary-slips/map-salary-slip-to-json'
import {
  buildSalarySlipLineCreates,
  computeSalarySlipHeaderTotals,
} from '@/lib/hr/salary-slips/build-salary-slip-line-creates'
import { allocateNextSalarySlipNumberString } from '@/lib/hr/salary-slips/allocate-salary-slip-number'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'

import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'

const salarySlipInclude = {
  employee: {
    select: {
      id: true,
      name: true,
      emailOfficial: true,
      emailPersonal: true,
    },
  },
  createdByUser: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { sortOrder: 'asc' },
    include: { payslipCategory: { select: { id: true, name: true, type: true } } },
  },
}

/** @param {string} profileId @param {string} employeeId */
async function assertEmployeeBelongsToProfile(profileId, employeeId) {
  const row = await prisma.employee.findFirst({
    where: { id: employeeId, businessProfileId: profileId, ...WHERE_NOT_DELETED },
    select: { id: true },
  })
  return Boolean(row)
}

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth
  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId')?.trim() ?? ''
  const search = (searchParams.get('search') ?? '').trim()

  const where = {
    businessProfileId: profile.id,
    ...WHERE_NOT_DELETED,
  }

  if (employeeId) where.employeeId = employeeId
  if (search) {
    where.OR = [
      { voucherNumber: { contains: search, mode: 'insensitive' } },
      { referenceNumber: { contains: search, mode: 'insensitive' } },
      { employee: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const { page, limit, skip } = parseListPagination(searchParams)

  const [total, rows] = await Promise.all([
    prisma.salarySlip.count({ where }),
    prisma.salarySlip.findMany({
      where,
      orderBy: [{ slipDate: 'desc' }],
      skip,
      take: limit,
      include: salarySlipInclude,
    }),
  ])

  return jsonOk({
    items: mapSalarySlipsToJson(rows),
    pagination: buildPaginationMeta(page, limit, total),
  })
}

/** @param {import('next/server').NextRequest} request */
export async function POST(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = salarySlipUpsertBodySchema.safeParse(body)
  if (!parsed.success) return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')

  const employeeOk = await assertEmployeeBelongsToProfile(profile.id, parsed.data.employeeId)
  if (!employeeOk) return jsonError(400, 'VALIDATION_ERROR', 'Invalid employee')

  const lineCreates = buildSalarySlipLineCreates(parsed.data.lines)
  const totals = computeSalarySlipHeaderTotals(parsed.data.lines)

  try {
    const created = await prisma.$transaction(async (tx) => {
      const voucherNumber = await allocateNextSalarySlipNumberString(tx, profile.id)
      return tx.salarySlip.create({
        data: {
          businessProfileId: profile.id,
          voucherNumber,
          employeeId: parsed.data.employeeId,
          slipDate: new Date(parsed.data.slipDate),
          referenceNumber: parsed.data.referenceNumber || null,
          description: parsed.data.description || null,
          basicPay: parsed.data.basicPay,
          totalEarnings: totals.totalEarnings,
          totalDeductions: totals.totalDeductions,
          netTotal: totals.netTotal,
          createdByUserId: session.id,
          lines: { create: lineCreates },
        },
        include: salarySlipInclude,
      })
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    void notifyPosAudience({
      businessProfileId: profile.id,
      audience: 'hr',
      type: 'salary_slip_generated',
      kind: 'hr',
      vars: {
        detail: `${created.voucherNumber} · ${created.employee?.name ?? 'Employee'}`,
      },
      link: `/hr/salary-slips/${created.id}`,
      dedupeKey: `salary-slip:${created.id}`,
      actorUserId: session.id,
    })

    return jsonOk({ item: mapSalarySlipToJson(created) })
  } catch (err) {
    console.error('[hisabi-pos:hr-salary-slips] POST failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}
