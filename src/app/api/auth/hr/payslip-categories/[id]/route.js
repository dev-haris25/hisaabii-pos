import { jsonError, jsonOk } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { payslipCategoryUpsertBodySchema } from '@/lib/hr/payslip-categories/payslip-category-body-schema'
import {
  isSystemAdvancePayslipCategory,
  SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME,
} from '@/lib/hr/payslip-categories/system-advance-category'
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

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function PATCH(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth

  const { id } = await ctx.params
  if (!id) {
    return jsonError(400, 'VALIDATION_ERROR', 'Missing id')
  }

  const existing = await prisma.payslipCategory.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
  })
  if (!existing) {
    return jsonError(404, 'NOT_FOUND', 'Payslip category not found')
  }

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
  const isSystem = isSystemAdvancePayslipCategory(existing)

  if (isSystem) {
    const nameChanged =
      name.trim().toLowerCase() !==
      SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME.toLowerCase()
    const typeChanged = type !== 'deduction'
    if (nameChanged || typeChanged) {
      return jsonError(
        403,
        'SYSTEM_PAYSLIP_CATEGORY',
        'The Advance payslip category name and type cannot be changed',
      )
    }
  }

  const duplicate = await prisma.payslipCategory.findFirst({
    where: {
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
      id: { not: id },
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (duplicate) {
    return jsonError(
      409,
      'DUPLICATE_PAYSLIP_CATEGORY',
      'A payslip category with this name already exists',
    )
  }

  try {
    const updated = await prisma.payslipCategory.update({
      where: { id },
      data: isSystem
        ? {
            name: SYSTEM_ADVANCE_PAYSLIP_CATEGORY_NAME,
            type: 'deduction',
            defaultAmount,
          }
        : {
            name,
            type,
            defaultAmount,
          },
      select: payslipCategorySelect,
    })
    return jsonOk({ item: mapPayslipCategoryToJson(updated) })
  } catch (err) {
    console.error('[hisabi:hr-payslip-categories] PATCH failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}

/** @param {import('next/server').NextRequest} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function DELETE(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth

  const { id } = await ctx.params
  if (!id) {
    return jsonError(400, 'VALIDATION_ERROR', 'Missing id')
  }

  const existing = await prisma.payslipCategory.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
  })
  if (!existing) {
    return jsonError(404, 'NOT_FOUND', 'Payslip category not found')
  }

  if (isSystemAdvancePayslipCategory(existing)) {
    return jsonError(
      403,
      'SYSTEM_PAYSLIP_CATEGORY',
      'The Advance payslip category cannot be deleted',
    )
  }

  await prisma.payslipCategory.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  return jsonOk({ deleted: true })
}
