import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { computeLoyaltyPointsEarned } from '@/lib/loyalty/compute-loyalty-points-earned'
import {
  adjustLoyaltyAccountBalance,
  findOrCreateLoyaltyAccount,
} from '@/lib/loyalty/loyalty-account-access'
import { prisma } from '@/lib/prisma'

const bodySchema = z
  .object({
    invoiceId: z.string().trim().min(1),
    phone: z.string().min(1),
  })
  .strict()

/**
 * @param {{ reason?: string, message?: string }} err
 */
function mapPhoneFormatError(err) {
  const message = String(err?.message ?? 'Invalid phone number')
  if (err?.reason === 'invalid_length') {
    return { code: 'LOYALTY_PHONE_INVALID_LENGTH', message }
  }
  if (err?.reason === 'invalid_prefix') {
    return { code: 'LOYALTY_PHONE_INVALID_PREFIX', message }
  }
  return { code: 'LOYALTY_PHONE_INVALID', message }
}

/**
 * POST /api/auth/pos/loyalty/give-points
 * Award points on an already-completed invoice (one-shot). Outside checkout tx.
 */
export async function POST(request) {
  try {
    const auth = await requirePosRestaurant()
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const { invoiceId, phone } = parsed.data

    const settings = await prisma.loyaltySettings.findUnique({
      where: { businessProfileId: auth.profileId },
    })
    if (!settings || settings.enabled !== true) {
      return jsonError(
        400,
        'LOYALTY_MODULE_DISABLED',
        'Loyalty points are not enabled for this restaurant',
      )
    }

    // Same scoped load as invoices/[id]/send and cancel.
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        businessProfileId: auth.profileId,
        ...WHERE_NOT_DELETED,
      },
      select: {
        id: true,
        status: true,
        grandTotal: true,
        loyaltyPointsAwarded: true,
      },
    })
    if (!invoice) {
      return jsonError(404, 'NOT_FOUND', 'Invoice not found')
    }
    if (invoice.status !== 'completed') {
      return jsonError(
        400,
        'LOYALTY_INVOICE_NOT_ELIGIBLE',
        'Loyalty points can only be given on a completed invoice',
      )
    }
    if (invoice.loyaltyPointsAwarded === true) {
      return jsonError(
        400,
        'LOYALTY_ALREADY_AWARDED',
        'Loyalty points were already awarded for this invoice',
      )
    }

    // Post-discount amount actually paid (coupon / manual / loyalty redeem already applied).
    const pointsEarned = computeLoyaltyPointsEarned(invoice.grandTotal, settings)

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          businessProfileId: auth.profileId,
          loyaltyPointsAwarded: false,
          ...WHERE_NOT_DELETED,
        },
        data: { loyaltyPointsAwarded: true },
      })
      if (claimed.count !== 1) {
        throw Object.assign(
          new Error('Loyalty points were already awarded for this invoice'),
          { code: 'LOYALTY_ALREADY_AWARDED' },
        )
      }

      const accountResult = await findOrCreateLoyaltyAccount(
        auth.profileId,
        phone,
        tx,
      )
      if ('error' in accountResult) {
        throw Object.assign(new Error(accountResult.message), {
          code: 'INVALID_PHONE_FORMAT',
          reason: accountResult.reason,
          message: accountResult.message,
        })
      }

      const adjusted = await adjustLoyaltyAccountBalance(
        accountResult.account.id,
        pointsEarned,
        'delta',
        tx,
      )
      if ('error' in adjusted) {
        throw Object.assign(new Error(adjusted.message), {
          code: 'LOYALTY_ACCOUNT_NOT_FOUND',
        })
      }

      await tx.loyaltyTransaction.create({
        data: {
          accountId: adjusted.account.id,
          invoiceId: invoice.id,
          type: 'EARN',
          points: pointsEarned,
          cashierUserId: auth.session.id,
        },
      })

      return {
        accountId: adjusted.account.id,
        phone: adjusted.account.phone,
        pointsEarned,
        newBalance: adjusted.account.balance,
      }
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    return jsonOk(result)
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
    if (code === 'LOYALTY_ALREADY_AWARDED') {
      return jsonError(
        400,
        'LOYALTY_ALREADY_AWARDED',
        err instanceof Error ? err.message : 'Loyalty points already awarded',
      )
    }
    if (code === 'INVALID_PHONE_FORMAT') {
      const mapped = mapPhoneFormatError(
        /** @type {{ reason?: string, message?: string }} */ (err),
      )
      return jsonError(400, mapped.code, mapped.message)
    }
    if (code === 'LOYALTY_ACCOUNT_NOT_FOUND') {
      return jsonError(
        404,
        'LOYALTY_ACCOUNT_NOT_FOUND',
        err instanceof Error ? err.message : 'Loyalty account not found',
      )
    }
    return handleRouteError(err, 'POST /api/auth/pos/loyalty/give-points')
  }
}
