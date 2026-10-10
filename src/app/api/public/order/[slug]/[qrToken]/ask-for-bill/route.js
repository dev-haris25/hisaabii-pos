import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { decimalStringFromNumber, parseMoney } from '@/lib/invoices/invoice-compute-totals'
import {
  findOpenTableSession,
  mapTableSessionFlagsJson,
} from '@/lib/e-waiter/map-table-session-flags'
import { evaluateEWaiterSessionLoyaltyRedeem } from '@/lib/e-waiter/evaluate-session-loyalty-redeem'
import { resolvePublicOrderTable } from '@/lib/e-waiter/resolve-public-order-table'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  /** Optional redeem points prefill — re-validated at settlement. */
  redeemPoints: z.string().trim().max(32).optional().nullable(),
})

/**
 * Customer Ask for Bill — sets billRequestedAt; locks further round submission.
 * Optional redeemPoints stored as requestedRedeemPoints after server re-check.
 */
export async function POST(request, context) {
  try {
    const { slug, qrToken } = await context.params
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    let body = {}
    try {
      const text = await request.text()
      if (text.trim()) body = JSON.parse(text)
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const session = await findOpenTableSession(prisma, resolved.table.id)
    if (!session) {
      return jsonError(
        409,
        'NO_OPEN_SESSION',
        'Place an order before asking for the bill',
      )
    }

    const roundCount = await prisma.kitchenOrder.count({
      where: {
        tableSessionId: session.id,
        status: { not: 'cancelled' },
      },
    })
    if (roundCount < 1) {
      return jsonError(
        409,
        'NO_ROUNDS',
        'Place an order before asking for the bill',
      )
    }

    const redeemRaw =
      parsed.data.redeemPoints != null &&
      String(parsed.data.redeemPoints).trim() !== ''
        ? String(parsed.data.redeemPoints).trim()
        : null

    /** @type {string | null} */
    let requestedRedeemPoints = null
    if (redeemRaw) {
      const offerLines = await prisma.tableSessionLine.count({
        where: { tableSessionId: session.id, cancelled: false, offerId: { not: null } },
      })
      if (offerLines > 0) {
        return jsonError(
          409,
          'OFFERS_EXCLUSIVE_DISCOUNT',
          'Offers and deals cannot be combined with loyalty points',
        )
      }
      if (!session.loyaltyAccountId) {
        return jsonError(
          400,
          'LOYALTY_NOT_LINKED',
          'Log in to loyalty before redeeming points',
        )
      }
      const evaluation = await evaluateEWaiterSessionLoyaltyRedeem({
        businessProfileId: resolved.profile.id,
        tableSessionId: session.id,
        loyaltyAccountId: session.loyaltyAccountId,
        requestedPoints: redeemRaw,
      })
      if (!evaluation.ok) {
        return jsonError(
          evaluation.status ?? 400,
          evaluation.code ?? 'INVALID_REDEEM_AMOUNT',
          evaluation.message ?? 'Invalid redeem amount',
        )
      }
      if (!evaluation.eligible) {
        return jsonError(
          400,
          'LOYALTY_NOT_ELIGIBLE',
          'Points cannot be redeemed for this order',
        )
      }
      requestedRedeemPoints = decimalStringFromNumber(parseMoney(redeemRaw))
    }

    if (session.billRequestedAt) {
      // Idempotent bill request — still allow updating redeem prefill if provided.
      const updated =
        requestedRedeemPoints != null
          ? await prisma.tableSession.update({
              where: { id: session.id },
              data: { requestedRedeemPoints },
            })
          : session
      return jsonOk({
        alreadyRequested: true,
        session: mapTableSessionFlagsJson(updated, {
          tableName: resolved.table.name,
          roundCount,
        }),
      })
    }

    const updated = await prisma.tableSession.update({
      where: { id: session.id },
      data: {
        billRequestedAt: new Date(),
        ...(requestedRedeemPoints != null
          ? { requestedRedeemPoints }
          : { requestedRedeemPoints: null }),
      },
    })

    return jsonOk({
      alreadyRequested: false,
      session: mapTableSessionFlagsJson(updated, {
        tableName: resolved.table.name,
        roundCount,
      }),
    })
  } catch (err) {
    return handleRouteError(
      err,
      'POST /api/public/order/[slug]/[qrToken]/ask-for-bill',
    )
  }
}
