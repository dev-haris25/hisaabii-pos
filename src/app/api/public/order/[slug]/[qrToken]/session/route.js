import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  findOpenTableSession,
  mapTableSessionFlagsJson,
  mapTableWaiterCallJson,
} from '@/lib/e-waiter/map-table-session-flags'
import { evaluateEWaiterSessionLoyaltyRedeem } from '@/lib/e-waiter/evaluate-session-loyalty-redeem'
import { isLoyaltyEnabledForProfile } from '@/lib/e-waiter/loyalty-enabled'
import { resolvePublicOrderTable } from '@/lib/e-waiter/resolve-public-order-table'
import { prisma } from '@/lib/prisma'

/**
 * Live flags for the public order page: open session + table waiter call + optional loyalty redeem preview.
 */
export async function GET(_request, context) {
  try {
    const { slug, qrToken } = await context.params
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    const table = await prisma.table.findFirst({
      where: { id: resolved.table.id },
      select: {
        id: true,
        name: true,
        status: true,
        waiterCallRequestedAt: true,
        waiterCallResolvedAt: true,
      },
    })
    if (!table) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    const loyaltyEnabled = await isLoyaltyEnabledForProfile(resolved.profile.id)
    const waiterCall = mapTableWaiterCallJson(table)
    const session = await findOpenTableSession(prisma, table.id)
    if (!session) {
      return jsonOk({
        session: null,
        waiterCall,
        loyaltyEnabled,
        loyaltyRedeem: null,
        tableName: table.name,
      })
    }

    const roundCount = await prisma.kitchenOrder.count({
      where: {
        tableSessionId: session.id,
        status: { not: 'cancelled' },
      },
    })

    /** @type {Record<string, unknown> | null} */
    let loyaltyRedeem = null
    if (loyaltyEnabled && session.loyaltyAccountId) {
      const evaluation = await evaluateEWaiterSessionLoyaltyRedeem({
        businessProfileId: resolved.profile.id,
        tableSessionId: session.id,
        loyaltyAccountId: session.loyaltyAccountId,
      })
      if (evaluation.ok) {
        loyaltyRedeem = {
          eligible: evaluation.eligible === true,
          reason: evaluation.reason ?? null,
          balance: evaluation.balance ?? null,
          effectiveCeiling: evaluation.effectiveCeiling ?? '0.00',
          limitingFactor: evaluation.limitingFactor ?? null,
          loyaltyAccountId: evaluation.loyaltyAccountId ?? session.loyaltyAccountId,
        }
      }
    }

    return jsonOk({
      session: mapTableSessionFlagsJson(session, {
        tableName: table.name,
        roundCount,
      }),
      waiterCall,
      loyaltyEnabled,
      loyaltyRedeem,
      tableName: table.name,
    })
  } catch (err) {
    return handleRouteError(
      err,
      'GET /api/public/order/[slug]/[qrToken]/session',
    )
  }
}
