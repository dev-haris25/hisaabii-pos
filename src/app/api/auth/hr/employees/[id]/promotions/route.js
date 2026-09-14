import { jsonOk, jsonError } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { applyDuePromotions } from '@/lib/hr/promotions/apply-due-promotions'
import { currentPayPeriod } from '@/lib/hr/promotions/current-pay-period'
import { mapPromotionToJson, mapPromotionsToJson } from '@/lib/hr/promotions/map-promotion-to-json'
import { promotionBodySchema } from '@/lib/hr/promotions/promotion-body-schema'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'

/** @param {import('next/server').NextRequest} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  const employee = await prisma.employee.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    select: { id: true },
  })
  if (!employee) return jsonError(404, 'NOT_FOUND', 'Employee not found')

  const rows = await prisma.employeePromotion.findMany({
    where: { employeeId: id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    orderBy: [{ effectiveFrom: 'desc' }, { promotedAt: 'desc' }],
  })

  return jsonOk({ items: mapPromotionsToJson(rows) })
}

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function POST(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  const employee = await prisma.employee.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    select: { id: true, salary: true },
  })
  if (!employee) return jsonError(404, 'NOT_FOUND', 'Employee not found')

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = promotionBodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
  }

  const isEffectiveNow = parsed.data.effectiveFrom <= currentPayPeriod()

  try {
    const created = await prisma.$transaction(async (tx) => {
      const promotion = await tx.employeePromotion.create({
        data: {
          businessProfileId: profile.id,
          employeeId: id,
          oldSalary: employee.salary,
          newSalary: parsed.data.newSalary,
          effectiveFrom: parsed.data.effectiveFrom,
          notes: parsed.data.notes,
          appliedToEmployee: isEffectiveNow,
        },
      })

      if (isEffectiveNow) {
        await tx.employee.update({
          where: { id },
          data: { salary: parsed.data.newSalary },
        })
      }

      return promotion
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    // Keep history consistent if other due promotions exist
    await applyDuePromotions(prisma, id)

    return jsonOk({ item: mapPromotionToJson(created) })
  } catch (err) {
    console.error('[hisabi-pos:hr-promotions] POST failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}
