import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { couponPatchSchema } from '@/lib/coupons/coupon-body-schema'
import {
  couponDetailInclude,
  couponListInclude,
  mapCouponToJson,
} from '@/lib/coupons/map-coupon-json'
import { replaceCouponItemRules } from '@/lib/coupons/replace-coupon-item-rules'
import {
  assertItemRuleMenuItemsExist,
  validateCouponDomainRules,
} from '@/lib/coupons/validate-coupon-domain'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

const STRUCTURAL_FIELDS = [
  'codeType',
  'discountKind',
  'code',
  'batchSize',
  'generateCode',
  'perCodeUsageLimit',
]

/**
 * @param {string} profileId
 * @param {string} id
 */
async function loadOwnedCoupon(profileId, id) {
  return prisma.coupon.findFirst({
    where: { id, businessProfileId: profileId, ...WHERE_NOT_DELETED },
    include: couponListInclude,
  })
}

export async function GET(_request, context) {
  try {
    const auth = await authorizeBusinessRequest(_request)
    if (auth.error) return auth.error
    const { id } = await context.params
    const row = await prisma.coupon.findFirst({
      where: { id, businessProfileId: auth.profile.id, ...WHERE_NOT_DELETED },
      include: couponDetailInclude,
    })
    if (!row) return jsonError(404, 'COUPON_NOT_FOUND', 'Coupon not found')
    return jsonOk({ coupon: mapCouponToJson(row, { includeCodes: true }) })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/coupons/[id]')
  }
}

export async function PATCH(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedCoupon(auth.profile.id, id)
    if (!existing) return jsonError(404, 'COUPON_NOT_FOUND', 'Coupon not found')

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    if (body && typeof body === 'object') {
      for (const key of STRUCTURAL_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          return jsonError(
            400,
            'COUPON_STRUCTURAL_FIELD_LOCKED',
            'This coupon field cannot be changed after creation',
          )
        }
      }
    }

    const parsed = couponPatchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    if (Object.keys(d).length === 0) {
      return jsonError(400, 'VALIDATION_ERROR', 'Provide at least one field')
    }

    if (d.totalUsageLimit !== undefined && existing.codeType === 'UNIQUE_BATCH') {
      return jsonError(
        400,
        'COUPON_TOTAL_USAGE_LIMIT_NOT_ALLOWED_FOR_BATCH',
        'Unique batch coupons do not use totalUsageLimit',
      )
    }

    const merged = {
      codeType: existing.codeType,
      discountKind: existing.discountKind,
      discountValue:
        d.discountValue !== undefined ? d.discountValue : existing.discountValue,
      maxDiscountCap:
        d.maxDiscountCap !== undefined ? d.maxDiscountCap : existing.maxDiscountCap,
      startDate: d.startDate !== undefined ? d.startDate : existing.startDate,
      expiresAt: d.expiresAt !== undefined ? d.expiresAt : existing.expiresAt,
      itemRules:
        d.itemRules !== undefined
          ? d.itemRules
          : existing.itemRules?.map((r) => ({
              ruleType: r.ruleType,
              menuItemId: r.menuItemId,
              quantity: r.quantity,
              discountPercent: r.discountPercent,
            })) ?? [],
    }

    const domainError = validateCouponDomainRules(merged, 'update')
    if (domainError) {
      return jsonError(400, domainError.code, domainError.message, domainError.details)
    }

    if (d.itemRules !== undefined) {
      const menuCheck = await assertItemRuleMenuItemsExist(
        auth.profile.id,
        d.itemRules,
        prisma,
      )
      if (!menuCheck.ok) {
        return jsonError(
          400,
          menuCheck.code,
          menuCheck.code === 'COUPON_ITEM_RULE_VARIANT_REQUIRED'
            ? 'Select at least one variant option for this item rule'
            : menuCheck.code === 'COUPON_ITEM_RULE_INVALID_VARIANT'
              ? 'A selected variant option is invalid for this menu item'
              : 'An item rule references a menu item that was not found',
          menuCheck.details,
        )
      }
    }

    /** @type {Record<string, unknown>} */
    const data = {}
    if (d.nameAr !== undefined) data.nameAr = d.nameAr
    if (d.nameEn !== undefined) data.nameEn = d.nameEn?.trim() || null
    if (d.discountValue !== undefined) data.discountValue = d.discountValue
    if (d.maxDiscountCap !== undefined) data.maxDiscountCap = d.maxDiscountCap
    if (d.minOrderAmount !== undefined) data.minOrderAmount = d.minOrderAmount
    if (d.totalUsageLimit !== undefined) data.totalUsageLimit = d.totalUsageLimit
    if (d.startDate !== undefined) data.startDate = d.startDate
    if (d.expiresAt !== undefined) data.expiresAt = d.expiresAt
    if (d.active !== undefined) data.active = d.active

    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.coupon.update({ where: { id }, data })
      }
      if (d.itemRules !== undefined) {
        await replaceCouponItemRules(tx, id, d.itemRules)
      }
      return tx.coupon.findFirstOrThrow({
        where: { id },
        include: couponDetailInclude,
      })
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    return jsonOk({
      coupon: mapCouponToJson(updated, { includeCodes: true }),
    })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/coupons/[id]')
  }
}

export async function DELETE(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedCoupon(auth.profile.id, id)
    if (!existing) return jsonError(404, 'COUPON_NOT_FOUND', 'Coupon not found')

    await prisma.$transaction(async (tx) => {
      await tx.coupon.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          code: null,
        },
      })
      if (existing.codeType === 'UNIQUE_BATCH') {
        await tx.couponCode.updateMany({
          where: { couponId: id },
          data: { code: null },
        })
      }
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    return jsonOk({ deleted: true, id })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/coupons/[id]')
  }
}
