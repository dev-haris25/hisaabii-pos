import { jsonOk, jsonError } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { employeePaymentPatchBodySchema } from '@/lib/hr/employee-payments/employee-payment-body-schema'
import { mapEmployeePaymentToJson } from '@/lib/hr/employee-payments/map-employee-payment-to-json'
import { getSalaryHeadroom, parseAmount } from '@/lib/hr/employee-salary-cap'

const paymentInclude = {
  employee: { select: { id: true, name: true } },
}

/** @param {string} profileId @param {string} employeeId */
async function getEmployeeForProfile(profileId, employeeId) {
  return prisma.employee.findFirst({
    where: { id: employeeId, businessProfileId: profileId, ...WHERE_NOT_DELETED },
    select: { id: true, name: true },
  })
}

/** @param {import('next/server').NextRequest} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  const row = await prisma.employeePayment.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    include: paymentInclude,
  })
  if (!row) return jsonError(404, 'NOT_FOUND', 'Employee payment not found')

  return jsonOk({ item: mapEmployeePaymentToJson(row) })
}

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function PATCH(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  const existing = await prisma.employeePayment.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
  })
  if (!existing) return jsonError(404, 'NOT_FOUND', 'Employee payment not found')

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = employeePaymentPatchBodySchema.safeParse(body)
  if (!parsed.success) return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')

  const employee = await getEmployeeForProfile(profile.id, parsed.data.employeeId)
  if (!employee) return jsonError(400, 'VALIDATION_ERROR', 'Invalid employee')

  if (parsed.data.paymentType === 'salary') {
    if (!parsed.data.payPeriod) {
      return jsonError(400, 'PAY_PERIOD_REQUIRED', 'Pay period is required for salary payments')
    }

    const headroomInfo = await getSalaryHeadroom({
      db: prisma,
      employeeId: parsed.data.employeeId,
      payPeriod: parsed.data.payPeriod,
      excludePaymentId: id,
    })
    if (!headroomInfo) return jsonError(404, 'NOT_FOUND', 'Employee not found')

    const requested = parseAmount(parsed.data.amount)
    const headroom = parseAmount(headroomInfo.headroom)

    if (requested > headroom + 0.01) {
      return jsonError(
        400,
        'SALARY_CAP_EXCEEDED',
        'This amount exceeds the salary cap for this pay period. Reduce the amount or delete this payment and create a fresh split payment instead.',
      )
    }
  }

  try {
    const updated = await prisma.employeePayment.update({
      where: { id },
      data: {
        employeeId: parsed.data.employeeId,
        paymentDate: new Date(parsed.data.paymentDate),
        paymentType: parsed.data.paymentType,
        payPeriod: parsed.data.paymentType === 'salary' ? parsed.data.payPeriod : null,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod,
        remarks: parsed.data.remarks || null,
      },
      include: paymentInclude,
    })
    return jsonOk({ item: mapEmployeePaymentToJson(updated) })
  } catch (err) {
    console.error('[hisabi-pos:hr-employee-payments] PATCH failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}

/** @param {import('next/server').NextRequest} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function DELETE(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  const existing = await prisma.employeePayment.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
  })
  if (!existing) return jsonError(404, 'NOT_FOUND', 'Employee payment not found')

  try {
    await prisma.employeePayment.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[hisabi-pos:hr-employee-payments] DELETE failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}
