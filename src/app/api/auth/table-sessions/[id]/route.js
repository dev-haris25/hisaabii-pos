import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { businessHasAvailableCoupons } from '@/lib/coupons/has-available-coupons'
import { estimateTableSessionBilling } from '@/lib/e-waiter/estimate-table-session-billing'
import { loadEnabledLoyaltySettings } from '@/lib/e-waiter/loyalty-enabled'
import { mapTableSessionDetailJson } from '@/lib/e-waiter/map-table-session-detail'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

const sessionDetailInclude = {
  table: {
    select: {
      id: true,
      name: true,
      status: true,
      waiterCallRequestedAt: true,
      waiterCallResolvedAt: true,
    },
  },
  kitchenOrders: {
    select: {
      id: true,
      orderNumber: true,
      roundNumber: true,
      status: true,
      createdAt: true,
      completedAt: true,
    },
  },
  lines: {
    where: { cancelled: false },
    include: {
      menuItem: {
        include: {
          variantGroups: { include: { options: true } },
          customizations: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
}

/**
 * Staff detail for one open TableSession: rounds + accumulated lines.
 * GET /api/auth/table-sessions/[id]
 */
export async function GET(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id) {
      return jsonError(400, 'VALIDATION_ERROR', 'Missing session id')
    }

    const session = await prisma.tableSession.findFirst({
      where: {
        id,
        businessProfileId: auth.profile.id,
        status: 'open',
      },
      include: sessionDetailInclude,
    })

    if (!session) {
      return jsonError(404, 'SESSION_NOT_FOUND', 'Table session not found')
    }

    const mapped = mapTableSessionDetailJson(session, {
      businessProfileId: auth.profile.id,
    })
    const [loyaltySettings, bizSettings, hasAvailableCoupons] =
      await Promise.all([
        loadEnabledLoyaltySettings(auth.profile.id),
        prisma.businessSettings.findUnique({
          where: { businessProfileId: auth.profile.id },
          select: { discountCap: true, posOnScreenKeypad: true },
        }),
        businessHasAvailableCoupons(auth.profile.id),
      ])
    const billingEstimate = estimateTableSessionBilling(
      mapped.lines,
      session.requestedRedeemPoints,
      loyaltySettings,
    )

    return jsonOk({
      ...mapped,
      billingEstimate,
      settleUi: {
        discountCap: bizSettings?.discountCap ?? null,
        posOnScreenKeypad: bizSettings?.posOnScreenKeypad === true,
        hasAvailableCoupons: hasAvailableCoupons === true,
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/table-sessions/[id]')
  }
}
