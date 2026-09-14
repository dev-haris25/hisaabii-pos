import { jsonOk, jsonError } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { salarySlipUpsertBodySchema } from '@/lib/hr/salary-slips/salary-slip-body-schema'
import { mapSalarySlipToJson } from '@/lib/hr/salary-slips/map-salary-slip-to-json'
import {
  buildSalarySlipLineCreates,
  computeSalarySlipHeaderTotals,
} from '@/lib/hr/salary-slips/build-salary-slip-line-creates'
import { salarySlipPrintInclude } from '@/lib/hr/salary-slips/salary-slip-print-include'

import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'

const salarySlipInclude = salarySlipPrintInclude

/** @param {string} profileId @param {string} employeeId */
async function assertEmployeeBelongsToProfile(profileId, employeeId) {
  const row = await prisma.employee.findFirst({
    where: { id: employeeId, businessProfileId: profileId, ...WHERE_NOT_DELETED },
    select: { id: true },
  })
  return Boolean(row)
}

/** @param {import('next/server').NextRequest} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  const row = await prisma.salarySlip.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    include: salarySlipInclude,
  })
  if (!row) return jsonError(404, 'NOT_FOUND', 'Salary slip not found')

  return jsonOk({ item: mapSalarySlipToJson(row) })
}

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function PATCH(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  const existing = await prisma.salarySlip.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
  })
  if (!existing) return jsonError(404, 'NOT_FOUND', 'Salary slip not found')

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
    const updated = await prisma.$transaction(async (tx) => {
      await tx.salarySlipLine.deleteMany({ where: { salarySlipId: id } })
      return tx.salarySlip.update({
        where: { id },
        data: {
          employeeId: parsed.data.employeeId,
          slipDate: new Date(parsed.data.slipDate),
          referenceNumber: parsed.data.referenceNumber || null,
          description: parsed.data.description || null,
          basicPay: parsed.data.basicPay,
          totalEarnings: totals.totalEarnings,
          totalDeductions: totals.totalDeductions,
          netTotal: totals.netTotal,
          lines: { create: lineCreates },
        },
        include: salarySlipInclude,
      })
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
    return jsonOk({ item: mapSalarySlipToJson(updated) })
  } catch (err) {
    console.error('[hisabi:hr-salary-slips] PATCH failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}

/** @param {import('next/server').NextRequest} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function DELETE(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  const existing = await prisma.salarySlip.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
  })
  if (!existing) return jsonError(404, 'NOT_FOUND', 'Salary slip not found')

  try {
    await prisma.salarySlip.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[hisabi:hr-salary-slips] DELETE failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}
