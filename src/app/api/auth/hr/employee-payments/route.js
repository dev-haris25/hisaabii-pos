import { jsonError, jsonOk } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { employeePaymentUpsertBodySchema } from '@/lib/hr/employee-payments/employee-payment-body-schema'
import { mapEmployeePaymentsToJson } from '@/lib/hr/employee-payments/map-employee-payment-to-json'
import { decimalString, getSalaryHeadroom, parseAmount } from '@/lib/hr/employee-salary-cap'
import { prisma } from '@/lib/prisma'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'

const paymentInclude = {
  employee: { select: { id: true, name: true } },
}

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId')?.trim() ?? ''
  const paymentType = searchParams.get('paymentType') ?? 'all'
  const search = (searchParams.get('search') ?? '').trim()

  const where = {
    businessProfileId: profile.id,
    ...WHERE_NOT_DELETED,
  }

  if (employeeId) where.employeeId = employeeId
  if (paymentType !== 'all') where.paymentType = paymentType
  if (search) {
    where.OR = [
      { employee: { name: { contains: search, mode: 'insensitive' } } },
      { remarks: { contains: search, mode: 'insensitive' } },
      { payPeriod: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (!shouldPaginateListRequest(searchParams)) {
    const rows = await prisma.employeePayment.findMany({
      where,
      orderBy: [{ paymentDate: 'desc' }],
      include: paymentInclude,
    })
    return jsonOk({ items: mapEmployeePaymentsToJson(rows) })
  }

  const { page, limit, skip } = parseListPagination(searchParams)
  const [total, rows] = await Promise.all([
    prisma.employeePayment.count({ where }),
    prisma.employeePayment.findMany({
      where,
      orderBy: [{ paymentDate: 'desc' }],
      include: paymentInclude,
      skip,
      take: limit,
    }),
  ])

  return jsonOk({
    items: mapEmployeePaymentsToJson(rows),
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

  const parsed = employeePaymentUpsertBodySchema.safeParse(body)
  if (!parsed.success) return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')

  const employee = await prisma.employee.findFirst({
    where: { id: parsed.data.employeeId, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
  })
  if (!employee) return jsonError(404, 'NOT_FOUND', 'Employee not found')

  /** @type {{ over: boolean, cap: string, payPeriod: string } | null} */
  let capAlert = null

  if (parsed.data.paymentType === 'salary') {
    if (!parsed.data.payPeriod) {
      return jsonError(400, 'PAY_PERIOD_REQUIRED', 'Pay period is required for salary payments')
    }

    const headroomInfo = await getSalaryHeadroom({
      db: prisma,
      employeeId: parsed.data.employeeId,
      payPeriod: parsed.data.payPeriod,
    })
    if (!headroomInfo) return jsonError(404, 'NOT_FOUND', 'Employee not found')

    const requested = parseAmount(parsed.data.amount)
    const headroom = parseAmount(headroomInfo.headroom)

    if (requested > headroom + 0.01 && !parsed.data.overflowResolution) {
      return jsonOk({
        requiresOverflowResolution: true,
        breakdown: {
          cap: headroomInfo.cap,
          alreadyPaid: headroomInfo.alreadyPaid,
          headroom: headroomInfo.headroom,
          requested: decimalString(requested),
          overflow: decimalString(requested - headroom),
        },
      })
    }

    if (requested >= headroom - 0.01) {
      capAlert = {
        over: requested > headroom + 0.01,
        cap: headroomInfo.cap,
        payPeriod: parsed.data.payPeriod,
      }
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const splitGroupId =
        parsed.data.paymentType === 'salary' &&
        parsed.data.overflowResolution &&
        parsed.data.overflowResolution !== 'force_salary'
          ? crypto.randomUUID()
          : null

      const rows = []

      if (splitGroupId) {
        const headroomInfo = await getSalaryHeadroom({
          db: tx,
          employeeId: parsed.data.employeeId,
          payPeriod: parsed.data.payPeriod,
        })
        const requested = parseAmount(parsed.data.amount)
        const headroom = parseAmount(headroomInfo?.headroom ?? '0')
        const overflow = decimalString(Math.max(0, requested - headroom))

        if (headroom > 0) {
          rows.push(
            await tx.employeePayment.create({
              data: {
                businessProfileId: profile.id,
                employeeId: parsed.data.employeeId,
                paymentDate: new Date(parsed.data.paymentDate),
                paymentType: 'salary',
                payPeriod: parsed.data.payPeriod,
                amount: decimalString(headroom),
                paymentMethod: parsed.data.paymentMethod,
                remarks: parsed.data.remarks || null,
                splitGroupId,
              },
              include: paymentInclude,
            }),
          )
        }

        const overflowType = parsed.data.overflowResolution
        rows.push(
          await tx.employeePayment.create({
            data: {
              businessProfileId: profile.id,
              employeeId: parsed.data.employeeId,
              paymentDate: new Date(parsed.data.paymentDate),
              paymentType: overflowType === 'bonus' ? 'bonus' : 'advance',
              payPeriod: null,
              amount: overflow,
              paymentMethod: parsed.data.paymentMethod,
              remarks: parsed.data.remarks || null,
              splitGroupId,
            },
            include: paymentInclude,
          }),
        )
      } else {
        rows.push(
          await tx.employeePayment.create({
            data: {
              businessProfileId: profile.id,
              employeeId: parsed.data.employeeId,
              paymentDate: new Date(parsed.data.paymentDate),
              paymentType: parsed.data.paymentType,
              payPeriod: parsed.data.paymentType === 'salary' ? parsed.data.payPeriod : null,
              amount: parsed.data.amount,
              paymentMethod: parsed.data.paymentMethod,
              remarks: parsed.data.remarks || null,
            },
            include: paymentInclude,
          }),
        )
      }

      return rows
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    const empName = employee.name || 'Employee'
    for (const row of result) {
      if (row.paymentType === 'advance') {
        void notifyPosAudience({
          businessProfileId: profile.id,
          audience: 'hr',
          type: 'advance_paid',
          kind: 'hr',
          vars: {
            detail: `${empName} · SAR ${row.amount}`,
          },
          link: '/hr/employee-payments',
          dedupeKey: `advance-paid:${row.id}`,
          actorUserId: session.id,
        })
      }
    }

    if (capAlert) {
      void notifyPosAudience({
        businessProfileId: profile.id,
        audience: 'hr',
        type: capAlert.over ? 'salary_cap_exceeded' : 'salary_cap_reached',
        kind: 'hr',
        vars: {
          name: empName,
          payPeriod: capAlert.payPeriod,
          cap: capAlert.cap,
        },
        link: '/hr/employee-payments',
        dedupeKey: `salary-cap:${parsed.data.employeeId}:${capAlert.payPeriod}:${capAlert.over ? 'over' : 'hit'}`,
        actorUserId: session.id,
      })
    }

    return jsonOk({
      items: mapEmployeePaymentsToJson(result),
      item: mapEmployeePaymentsToJson(result)[0],
      capAlert,
    })
  } catch (err) {
    console.error('[hisabi-pos:hr] employee-payment POST failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}
