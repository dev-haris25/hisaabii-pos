import { z } from 'zod'

import { assertWithinRestaurantGeofence } from '@/lib/e-waiter/assert-within-geofence'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  eWaiterOrderLinesSchema,
  resolveEWaiterOrderLines,
} from '@/lib/e-waiter/resolve-e-waiter-order-lines'
import { isLoyaltyEnabledForProfile } from '@/lib/e-waiter/loyalty-enabled'
import {
  eWaiterOfferErrorResult,
  priceEWaiterRoundInTx,
  roundLinesWithOffers,
} from '@/lib/offers/e-waiter-round-offers'
import { recordOfferUsages } from '@/lib/offers/offer-usage'
import {
  offerDealsInputSchema,
  offerDiscountMatches,
  resolveCartOffers,
} from '@/lib/offers/resolve-cart-offers'
import { createKitchenOrderInTx } from '@/lib/orders/create-kitchen-order'
import { prisma } from '@/lib/prisma'

export const eWaiterSubmitBodySchema = z.object({
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  lines: eWaiterOrderLinesSchema,
  /** Combo deals added as deals (Offers & Deals). */
  deals: offerDealsInputSchema.optional().default([]),
  /** Offer discount the guest saw — mismatch → OFFER_PRICES_CHANGED. */
  expectedOfferDiscount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional()
    .nullable(),
  /** Held client-side after login-loyalty — only linked at submit time. */
  loyaltyAccountId: z.string().trim().min(1).max(64).optional().nullable(),
})

/**
 * @param {string} businessProfileId
 * @param {string | null | undefined} loyaltyAccountId
 */
async function resolveOwnedLoyaltyAccountId(businessProfileId, loyaltyAccountId) {
  const id =
    loyaltyAccountId != null && String(loyaltyAccountId).trim() !== ''
      ? String(loyaltyAccountId).trim()
      : ''
  if (!id) return null
  if (!(await isLoyaltyEnabledForProfile(businessProfileId))) return null
  const account = await prisma.loyaltyAccount.findFirst({
    where: {
      id,
      businessProfileId,
      ...WHERE_NOT_DELETED,
    },
    select: { id: true },
  })
  return account?.id ?? null
}

/**
 * @param {{
 *   profile: {
 *     id: string
 *     locationLat: number | null
 *     locationLng: number | null
 *     locationRadiusMeters: number | null
 *   }
 *   table: { id: string, name: string }
 *   body: z.infer<typeof eWaiterSubmitBodySchema>
 * }} args
 */
export async function submitEWaiterOrder({ profile, table, body }) {
  const openSession = await prisma.tableSession.findFirst({
    where: { tableId: table.id, status: 'open' },
    select: {
      id: true,
      billRequestedAt: true,
      loyaltyAccountId: true,
    },
  })

  if (openSession?.billRequestedAt) {
    return {
      ok: false,
      status: 409,
      code: 'BILL_REQUESTED',
      message:
        'Bill already requested — ask staff to reopen ordering if you would like to order more',
    }
  }

  if (!openSession) {
    const geo = assertWithinRestaurantGeofence(profile, body.lat, body.lng)
    if (!geo.ok) {
      return {
        ok: false,
        status: geo.code === 'LOCATION_REQUIRED' ? 400 : 403,
        code: geo.code,
        message:
          geo.code === 'LOCATION_REQUIRED'
            ? 'Location is required to place an order'
            : 'You must be at the restaurant to order',
      }
    }
  }

  const deals = body.deals ?? []
  if (body.lines.length === 0 && deals.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Add at least one item to your order',
    }
  }

  const resolvedLines = await resolveEWaiterOrderLines(profile.id, body.lines)
  if (!resolvedLines.ok) {
    return {
      ok: false,
      status: resolvedLines.status,
      code: resolvedLines.code,
      message: resolvedLines.message,
    }
  }

  // Preview (fast, unlocked) so invalid deals / changed prices fail early.
  try {
    const preview = await resolveCartOffers({
      businessProfileId: profile.id,
      lines: resolvedLines.lines,
      deals,
    })
    if (!offerDiscountMatches(body.expectedOfferDiscount, preview.pricing.totalDiscount)) {
      return {
        ok: false,
        status: 409,
        code: 'OFFER_PRICES_CHANGED',
        message: 'Offer prices changed — please review the updated total',
      }
    }
  } catch (err) {
    const mapped = eWaiterOfferErrorResult(err)
    if (mapped) return mapped
    throw err
  }

  const loyaltyAccountId = await resolveOwnedLoyaltyAccountId(
    profile.id,
    body.loyaltyAccountId,
  )

  let result
  try {
    result = await prisma.$transaction(async (tx) => {
      let session = await tx.tableSession.findFirst({
        where: { tableId: table.id, status: 'open' },
      })

      if (session?.billRequestedAt) {
        return {
          blocked: true,
          status: 409,
          code: 'BILL_REQUESTED',
          message:
            'Bill already requested — ask staff to reopen ordering if you would like to order more',
        }
      }

      let createdSession = false
      if (!session) {
        try {
          session = await tx.tableSession.create({
            data: {
              businessProfileId: profile.id,
              tableId: table.id,
              status: 'open',
              ...(loyaltyAccountId ? { loyaltyAccountId } : {}),
            },
          })
          createdSession = true
        } catch {
          session = await tx.tableSession.findFirst({
            where: { tableId: table.id, status: 'open' },
          })
          if (!session) throw new Error('Could not open table session')
          if (session.billRequestedAt) {
            return {
              blocked: true,
              status: 409,
              code: 'BILL_REQUESTED',
              message:
                'Bill already requested — ask staff to reopen ordering if you would like to order more',
            }
          }
        }
      } else if (!session.loyaltyAccountId && loyaltyAccountId) {
        // Logged in after anonymous round 1: attach once if session has no link yet.
        session = await tx.tableSession.update({
          where: { id: session.id },
          data: { loyaltyAccountId },
        })
      }

      if (createdSession) {
        await tx.table.update({
          where: { id: table.id },
          data: { status: 'occupied' },
        })
      }

      const agg = await tx.kitchenOrder.aggregate({
        where: { tableSessionId: session.id },
        _max: { roundNumber: true },
      })
      const roundNumber = (agg._max.roundNumber ?? 0) + 1

      // Price locked at order time (kept at settle even if the offer ends).
      const priced = await priceEWaiterRoundInTx(tx, {
        businessProfileId: profile.id,
        resolvedLines: resolvedLines.lines,
        deals,
      })
      const roundLines = roundLinesWithOffers(resolvedLines.lines, priced)

      const kitchenOrder = await createKitchenOrderInTx(tx, {
        businessProfileId: profile.id,
        invoiceId: null,
        tableSessionId: session.id,
        roundNumber,
        lines: roundLines,
      })

      await tx.tableSessionLine.createMany({
        data: roundLines.map((line) => ({
          tableSessionId: session.id,
          kitchenOrderId: kitchenOrder.id,
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          variantOptionIds: line.variantOptionIds,
          customizationIds: line.customizationIds,
          lineNote: line.lineNote,
          offerId: line.offerId,
          offerGroupKey: line.offerGroupKey,
          offerDiscount: line.offerDiscount,
        })),
      })

      await recordOfferUsages(tx, {
        businessProfileId: profile.id,
        usage: priced.pricing.usage,
        kitchenOrderId: kitchenOrder.id,
      })

      return {
        blocked: false,
        sessionId: session.id,
        kitchenOrderId: kitchenOrder.id,
        orderNumber: kitchenOrder.orderNumber,
        roundNumber,
        status: kitchenOrder.status,
        createdSession,
        loyaltyAccountId: session.loyaltyAccountId ?? null,
      }
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
  } catch (err) {
    const mapped = eWaiterOfferErrorResult(err)
    if (mapped) return mapped
    throw err
  }

  if (result.blocked) {
    return {
      ok: false,
      status: result.status,
      code: result.code,
      message: result.message,
    }
  }

  return { ok: true, ...result }
}
