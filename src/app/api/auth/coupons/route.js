import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { couponBodySchema } from '@/lib/coupons/coupon-body-schema'
import { generateCouponCodeBatch } from '@/lib/coupons/generate-coupon-code-batch'
import { generateSharedCouponCode } from '@/lib/coupons/generate-shared-coupon-code'
import {
  couponDetailInclude,
  couponListInclude,
  mapCouponToJson,
} from '@/lib/coupons/map-coupon-json'
import { replaceCouponItemRules } from '@/lib/coupons/replace-coupon-item-rules'
import { normalizeCouponCodeInput } from '@/lib/coupons/resolve-coupon-code'
import {
  assertItemRuleMenuItemsExist,
  isCouponCodeTaken,
  validateCouponDomainRules,
} from '@/lib/coupons/validate-coupon-domain'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim()
    const activeRaw = searchParams.get('active') ?? 'all'
    const activeFilter =
      activeRaw === 'true' || activeRaw === 'false' ? activeRaw : 'all'
    const discountKind = (searchParams.get('discountKind') ?? '').trim()
    const codeType = (searchParams.get('codeType') ?? '').trim()

    /** @type {Record<string, unknown>} */
    const where = { businessProfileId: profile.id, ...WHERE_NOT_DELETED }
    if (activeFilter === 'true') where.active = true
    if (activeFilter === 'false') where.active = false
    if (
      discountKind === 'PERCENTAGE' ||
      discountKind === 'FIXED_AMOUNT' ||
      discountKind === 'BOGO' ||
      discountKind === 'COMBO'
    ) {
      where.discountKind = discountKind
    }
    if (codeType === 'SHARED' || codeType === 'UNIQUE_BATCH') {
      where.codeType = codeType
    }
    if (search) {
      where.OR = [
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        {
          codes: {
            some: { code: { contains: search, mode: 'insensitive' } },
          },
        },
      ]
    }

    const orderBy = [{ createdAt: 'desc' }, { nameAr: 'asc' }]

    if (shouldPaginateListRequest(searchParams)) {
      const { page, limit, skip } = parseListPagination(searchParams, {
        defaultLimit: 10,
      })
      const [total, rows] = await Promise.all([
        prisma.coupon.count({ where }),
        prisma.coupon.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: couponListInclude,
        }),
      ])
      return jsonOk({
        coupons: rows.map((row) => mapCouponToJson(row)),
        pagination: buildPaginationMeta(page, limit, total),
      })
    }

    const rows = await prisma.coupon.findMany({
      where,
      orderBy,
      include: couponListInclude,
    })
    return jsonOk({ coupons: rows.map((row) => mapCouponToJson(row)) })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/coupons')
  }
}

export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = couponBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data

    const domainError = validateCouponDomainRules(d, 'create')
    if (domainError) {
      return jsonError(400, domainError.code, domainError.message, domainError.details)
    }

    const menuCheck = await assertItemRuleMenuItemsExist(
      profile.id,
      d.itemRules ?? [],
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

    const created = await prisma.$transaction(async (tx) => {
      let sharedCode = null
      if (d.codeType === 'SHARED') {
        if (d.generateCode === true) {
          sharedCode = await generateSharedCouponCode(profile.id, tx)
        } else {
          sharedCode = normalizeCouponCodeInput(d.code)
          if (await isCouponCodeTaken(profile.id, sharedCode, tx)) {
            throw Object.assign(new Error('COUPON_CODE_ALREADY_EXISTS'), {
              code: 'COUPON_CODE_ALREADY_EXISTS',
            })
          }
        }
      }

      const row = await tx.coupon.create({
        data: {
          businessProfileId: profile.id,
          nameAr: d.nameAr,
          nameEn: d.nameEn?.trim() || null,
          codeType: d.codeType,
          code: d.codeType === 'SHARED' ? sharedCode : null,
          batchSize: d.codeType === 'UNIQUE_BATCH' ? d.batchSize : null,
          discountKind: d.discountKind,
          discountValue: d.discountValue ?? null,
          maxDiscountCap: d.maxDiscountCap ?? null,
          minOrderAmount: d.minOrderAmount ?? '0',
          totalUsageLimit:
            d.codeType === 'SHARED' ? (d.totalUsageLimit ?? null) : null,
          startDate: d.startDate ?? null,
          expiresAt: d.expiresAt ?? null,
          active: d.active ?? true,
        },
      })

      if (d.codeType === 'UNIQUE_BATCH') {
        await generateCouponCodeBatch(
          row.id,
          profile.id,
          d.batchSize,
          d.perCodeUsageLimit ?? null,
          tx,
        )
      }

      if ((d.itemRules ?? []).length > 0) {
        await replaceCouponItemRules(tx, row.id, d.itemRules)
      }

      return tx.coupon.findFirstOrThrow({
        where: { id: row.id },
        include: couponDetailInclude,
      })
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    return jsonOk({
      coupon: mapCouponToJson(created, { includeCodes: true }),
    })
  } catch (err) {
    if (err?.code === 'COUPON_CODE_ALREADY_EXISTS') {
      return jsonError(
        409,
        'COUPON_CODE_ALREADY_EXISTS',
        'That coupon code is already in use for this restaurant',
      )
    }
    if (err?.code === 'P2002') {
      return jsonError(
        409,
        'COUPON_CODE_ALREADY_EXISTS',
        'That coupon code is already in use for this restaurant',
      )
    }
    return handleRouteError(err, 'POST /api/auth/coupons')
  }
}
