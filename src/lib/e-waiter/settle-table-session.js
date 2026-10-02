import { z } from 'zod'

import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { orderVatInclusiveSubtotalFromLines } from '@/lib/coupons/coupon-order-discount'
import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { loadEnabledLoyaltySettings } from '@/lib/e-waiter/loyalty-enabled'
import { computeLoyaltyPointsEarned } from '@/lib/loyalty/compute-loyalty-points-earned'
import { computeLoyaltyRedeemCeilings } from '@/lib/loyalty/compute-loyalty-redeem-ceilings'
import { adjustLoyaltyAccountBalance } from '@/lib/loyalty/loyalty-account-access'
import {
  checkLoyaltyMinOrderValue,
  checkLoyaltyRedeemEligibility,
  validateLoyaltyRedeemAmount,
} from '@/lib/loyalty/loyalty-redeem-eligibility'
import { resolveCheckoutModifiers } from '@/lib/menu/resolve-checkout-modifiers'
import { primaryKitchenOrder } from '@/lib/orders/primary-kitchen-order'
import { checkoutPosSale } from '@/lib/pos/checkout-pos-sale'
import { prisma } from '@/lib/prisma'

const moneyOptionalSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/)
  .optional()
  .nullable()

export const settleTableSessionBodySchema = z.object({
  paymentMethod: z.enum(['cash', 'card']),
  amountTendered: moneyOptionalSchema,
  notes: z.string().trim().max(500).optional().nullable(),
  /** Order-level discount percent (0–100). Mutually exclusive with coupon / loyalty. */
  discount: moneyOptionalSchema,
  /** Coupon code. Mutually exclusive with manual discount / loyalty. */
  couponCode: z.string().trim().min(1).max(64).optional().nullable(),
})

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
function throwSettleError(code, message, extra = {}) {
  throw Object.assign(new Error(message), { code, ...extra })
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asIdArray(value) {
  if (!Array.isArray(value)) return []
  return value.map(String).filter(Boolean)
}

/**
 * Keep TableSessionLines as separate checkout lines (no merge across rounds).
 * Preserves per-round notes and matches kitchen ticket history.
 *
 * @param {Array<{
 *   menuItemId: string
 *   quantity: number
 *   variantOptionIds: unknown
 *   customizationIds: unknown
 *   lineNote: string | null
 *   cancelled: boolean
 *   kitchenOrder: { id: string, status: string } | null
 * }>} lines
 */
export function buildSettlementCheckoutLines(lines) {
  /** @type {Array<{
   *   menuItemId: string
   *   quantity: number
   *   variantOptionIds: string[]
   *   customizationIds: string[]
   *   lineNote: string | null
   * }>} */
  const out = []
  for (const line of lines) {
    if (line.cancelled) continue
    if (!line.kitchenOrder || line.kitchenOrder.status === 'cancelled') continue
    out.push({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      variantOptionIds: asIdArray(line.variantOptionIds),
      customizationIds: asIdArray(line.customizationIds),
      lineNote: line.lineNote?.trim() || null,
    })
  }
  return out
}

/**
 * Full server-side re-validation of requested redeem points for settlement.
 * Clamp when requested exceeds ceiling; reject when otherwise invalid / ineligible.
 *
 * @param {{
 *   businessProfileId: string
 *   loyaltyAccountId: string
 *   requestedRedeemPoints: string
 *   checkoutLines: Array<{
 *     menuItemId: string
 *     quantity: number
 *     variantOptionIds: string[]
 *     customizationIds: string[]
 *   }>
 * }} args
 * @returns {Promise<{ loyaltyAccountId: string, loyaltyRedeemPoints: string, clamped: boolean }>}
 */
async function resolveSettlementLoyaltyRedeem(args) {
  const settings = await loadEnabledLoyaltySettings(args.businessProfileId)
  if (!settings) {
    throwSettleError(
      'LOYALTY_MODULE_DISABLED',
      'Loyalty points are not enabled for this restaurant',
    )
  }

  const account = await prisma.loyaltyAccount.findFirst({
    where: {
      id: args.loyaltyAccountId,
      businessProfileId: args.businessProfileId,
      ...WHERE_NOT_DELETED,
    },
  })
  if (!account) {
    throwSettleError('LOYALTY_ACCOUNT_NOT_FOUND', 'Loyalty account not found')
  }

  const balanceElig = checkLoyaltyRedeemEligibility(account, settings)
  if (!balanceElig.eligible) {
    throwSettleError(
      'LOYALTY_BELOW_MIN_BALANCE',
      'Balance is below the minimum required to redeem',
    )
  }

  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: [...new Set(args.checkoutLines.map((l) => l.menuItemId))] },
      businessProfileId: args.businessProfileId,
      active: true,
    },
    include: {
      variantGroups: { include: { options: true } },
      customizations: true,
    },
  })
  /** @type {Map<string, (typeof menuItems)[number]>} */
  const byId = new Map(menuItems.map((m) => [m.id, m]))

  /** @type {Array<{ menuItemId: string, quantity: number, unitPrice: string, vatPreset: string }>} */
  const priced = []
  for (const line of args.checkoutLines) {
    const item = byId.get(line.menuItemId)
    if (!item) {
      throwSettleError('INVALID_MENU_ITEM', 'One or more menu items are invalid')
    }
    const resolved = resolveCheckoutModifiers(
      item,
      line.variantOptionIds,
      line.customizationIds,
    )
    priced.push({
      menuItemId: item.id,
      quantity: line.quantity,
      unitPrice: resolved.unitPrice,
      vatPreset: item.vatPreset ?? 'standard',
    })
  }

  const vatInclusive = orderVatInclusiveSubtotalFromLines(priced)
  const minOrder = checkLoyaltyMinOrderValue(vatInclusive, settings)
  if (!minOrder.eligible) {
    throwSettleError(
      'LOYALTY_BELOW_MIN_ORDER',
      'Order total is below the minimum required to redeem',
    )
  }

  const redeemableItems = await prisma.menuItem.findMany({
    where: {
      businessProfileId: args.businessProfileId,
      loyaltyRedeemable: true,
      active: true,
    },
    select: { id: true },
  })
  const ceilings = computeLoyaltyRedeemCeilings(
    account,
    {
      ...settings,
      redeemableMenuItemIds: redeemableItems.map((r) => r.id),
    },
    priced,
  )

  const amountCheck = validateLoyaltyRedeemAmount(
    args.requestedRedeemPoints,
    ceilings,
  )
  if (amountCheck.valid) {
    return {
      loyaltyAccountId: account.id,
      loyaltyRedeemPoints: decimalStringFromNumber(
        parseMoney(args.requestedRedeemPoints),
      ),
      clamped: false,
    }
  }

  if (amountCheck.reason === 'exceeds_ceiling') {
    const maxAllowed = amountCheck.maxAllowed ?? ceilings.effectiveCeiling
    if (parseMoney(maxAllowed) <= 0) {
      throwSettleError(
        'LOYALTY_REDEEM_EXCEEDS_CEILING',
        'Redeem points exceed the allowed ceiling for this order',
        { maxAllowed },
      )
    }
    return {
      loyaltyAccountId: account.id,
      loyaltyRedeemPoints: decimalStringFromNumber(parseMoney(maxAllowed)),
      clamped: true,
    }
  }

  if (amountCheck.reason === 'not_positive') {
    throwSettleError(
      'LOYALTY_REDEEM_AMOUNT_NOT_POSITIVE',
      'Redeem points must be greater than zero',
    )
  }
  throwSettleError(
    'LOYALTY_REDEEM_AMOUNT_INVALID',
    'Redeem points amount is invalid',
  )
}

/**
 * Award earn points after settlement when the session has a loyalty account.
 * Mirrors POS give-points but uses the known account id (no phone prompt).
 *
 * @param {{
 *   profileId: string
 *   invoiceId: string
 *   grandTotal: string
 *   loyaltyAccountId: string
 *   staffId: string
 * }} args
 */
async function awardSettlementLoyaltyEarn(args) {
  const settings = await prisma.loyaltySettings.findUnique({
    where: { businessProfileId: args.profileId },
  })
  if (!settings || settings.enabled !== true) {
    return { awarded: false, reason: 'disabled' }
  }

  const account = await prisma.loyaltyAccount.findFirst({
    where: {
      id: args.loyaltyAccountId,
      businessProfileId: args.profileId,
      ...WHERE_NOT_DELETED,
    },
    select: { id: true },
  })
  if (!account) {
    return { awarded: false, reason: 'account_missing' }
  }

  const pointsEarned = computeLoyaltyPointsEarned(args.grandTotal, settings)

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: {
          id: args.invoiceId,
          businessProfileId: args.profileId,
          loyaltyPointsAwarded: false,
          ...WHERE_NOT_DELETED,
        },
        data: {
          loyaltyPointsAwarded: true,
          loyaltyAccountId: args.loyaltyAccountId,
        },
      })
      if (claimed.count !== 1) {
        return
      }

      if (parseMoney(pointsEarned) > 0) {
        const adjusted = await adjustLoyaltyAccountBalance(
          account.id,
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
            accountId: account.id,
            invoiceId: args.invoiceId,
            type: 'EARN',
            points: pointsEarned,
            cashierUserId: args.staffId,
          },
        })
      } else {
        await tx.invoice.update({
          where: { id: args.invoiceId },
          data: { loyaltyAccountId: args.loyaltyAccountId },
        })
      }
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
    if (code === 'LOYALTY_ALREADY_AWARDED') {
      return { awarded: false, reason: 'already_awarded' }
    }
    throw err
  }

  return {
    awarded: parseMoney(pointsEarned) > 0,
    pointsEarned,
  }
}

/**
 * Settle an open E-Waiter TableSession into a ZATCA invoice.
 *
 * @param {{
 *   profileId: string
 *   staffId: string
 *   sessionId: string
 *   body: z.infer<typeof settleTableSessionBodySchema>
 * }} opts
 */
export async function settleTableSession(opts) {
  const session = await prisma.tableSession.findFirst({
    where: {
      id: opts.sessionId,
      businessProfileId: opts.profileId,
    },
    include: {
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
        where: { status: { not: 'cancelled' } },
        select: { id: true, status: true, invoiceId: true },
        orderBy: [{ roundNumber: 'asc' }, { createdAt: 'asc' }],
      },
      lines: {
        where: { cancelled: false },
        include: {
          kitchenOrder: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!session) {
    throwSettleError('SESSION_NOT_FOUND', 'Table session not found')
  }
  if (session.status !== 'open') {
    throwSettleError('SESSION_ALREADY_CLOSED', 'Table session is already closed')
  }
  if (session.invoiceId) {
    throwSettleError(
      'SESSION_ALREADY_SETTLED',
      'Table session already has an invoice',
    )
  }

  const kitchenOrderIds = session.kitchenOrders.map((o) => o.id)
  if (kitchenOrderIds.length === 0) {
    // Empty visit (e.g. waiter-call-only / abandoned before ordering).
    // Do not create a zero-amount ZATCA invoice — needs a separate abandon action.
    throwSettleError(
      'SESSION_EMPTY_NO_ROUNDS',
      'This table has no orders to bill. Use abandon session (not yet available) or wait for an order.',
    )
  }

  const roundsNotReady = session.kitchenOrders.some(
    (o) => o.status !== 'completed',
  )
  if (roundsNotReady) {
    throwSettleError(
      'SESSION_ROUNDS_NOT_READY',
      'Print is available after order is served',
    )
  }

  const checkoutLines = buildSettlementCheckoutLines(session.lines)
  if (checkoutLines.length === 0) {
    throwSettleError(
      'SESSION_EMPTY_NO_LINES',
      'This table has no billable items to settle',
    )
  }

  /** @type {{ loyaltyAccountId?: string, loyaltyRedeemPoints?: string, clamped?: boolean }} */
  let loyaltyRedeem = {}
  const requestedRaw =
    session.requestedRedeemPoints != null &&
    String(session.requestedRedeemPoints).trim() !== ''
      ? String(session.requestedRedeemPoints).trim()
      : null

  const couponCodeRaw =
    opts.body.couponCode != null && String(opts.body.couponCode).trim() !== ''
      ? String(opts.body.couponCode).trim()
      : null
  const discountRaw =
    opts.body.discount != null && String(opts.body.discount).trim() !== ''
      ? String(opts.body.discount).trim()
      : null

  if (requestedRaw && (couponCodeRaw || discountRaw)) {
    throwSettleError(
      couponCodeRaw
        ? 'COUPON_AND_LOYALTY_CONFLICT'
        : 'LOYALTY_AND_MANUAL_DISCOUNT_CONFLICT',
      'Cannot combine loyalty redeem with a coupon or manual discount',
    )
  }

  if (requestedRaw) {
    if (!session.loyaltyAccountId) {
      throwSettleError(
        'LOYALTY_ACCOUNT_ID_REQUIRED',
        'Loyalty account is required to redeem points',
      )
    }
    const resolved = await resolveSettlementLoyaltyRedeem({
      businessProfileId: opts.profileId,
      loyaltyAccountId: session.loyaltyAccountId,
      requestedRedeemPoints: requestedRaw,
      checkoutLines,
    })
    loyaltyRedeem = {
      loyaltyAccountId: resolved.loyaltyAccountId,
      loyaltyRedeemPoints: resolved.loyaltyRedeemPoints,
      clamped: resolved.clamped,
    }
  }

  /** @type {Parameters<typeof checkoutPosSale>[0]['body']} */
  const checkoutBody = {
    lines: checkoutLines,
    paymentMethod: opts.body.paymentMethod,
    amountTendered: opts.body.amountTendered ?? null,
    notes: opts.body.notes ?? null,
    discount: requestedRaw ? null : discountRaw,
    couponCode: requestedRaw ? null : couponCodeRaw,
    loyaltyAccountId: loyaltyRedeem.loyaltyAccountId ?? null,
    loyaltyRedeemPoints: loyaltyRedeem.loyaltyRedeemPoints ?? null,
  }

  /** @type {Awaited<ReturnType<typeof checkoutPosSale>>} */
  let invoice
  try {
    invoice = await checkoutPosSale({
      profileId: opts.profileId,
      staffId: opts.staffId,
      body: checkoutBody,
      settlement: { existingKitchenOrderIds: kitchenOrderIds },
    })
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
    const invoiceId =
      err && typeof err === 'object' && 'invoiceId' in err
        ? String(/** @type {{ invoiceId?: string }} */ (err).invoiceId ?? '')
        : ''
    // Invoice + KO links already committed; close session so staff can reprint / retry ZATCA.
    if (code === 'ZATCA_ERROR' && invoiceId) {
      const failedInvoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
          kitchenOrders: true,
        },
      })
      if (failedInvoice) {
        invoice = failedInvoice
      } else {
        throw err
      }
    } else {
      throw err
    }
  }

  const closedAt = new Date()
  await prisma.$transaction(async (tx) => {
    const stillOpen = await tx.tableSession.updateMany({
      where: {
        id: session.id,
        status: 'open',
        invoiceId: null,
      },
      data: {
        status: 'closed',
        closedAt,
        invoiceId: invoice.id,
        billRequestedAt: null,
        requestedRedeemPoints: null,
      },
    })
    if (stillOpen.count === 1) {
      await tx.table.update({
        where: { id: session.tableId },
        data: {
          status: 'available',
          ...(session.table.waiterCallRequestedAt &&
          (!session.table.waiterCallResolvedAt ||
            session.table.waiterCallResolvedAt <
              session.table.waiterCallRequestedAt)
            ? { waiterCallResolvedAt: closedAt }
            : {}),
        },
      })
    }
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

  /** @type {{ awarded: boolean, pointsEarned?: string, reason?: string } | null} */
  let loyaltyEarn = null
  if (session.loyaltyAccountId) {
    try {
      loyaltyEarn = await awardSettlementLoyaltyEarn({
        profileId: opts.profileId,
        invoiceId: invoice.id,
        grandTotal: invoice.grandTotal,
        loyaltyAccountId: session.loyaltyAccountId,
        staffId: opts.staffId,
      })
    } catch {
      loyaltyEarn = { awarded: false, reason: 'earn_failed' }
    }
  }

  return {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      grandTotal: invoice.grandTotal,
      totalVat: invoice.totalVat,
      subtotal: invoice.subtotal,
      paymentMethod: invoice.paymentMethod,
      amountTendered: invoice.amountTendered,
      changeGiven: invoice.changeGiven,
      qrCode: invoice.qrCode,
      zatcaStatus: invoice.zatcaStatus,
      orderNumber: primaryKitchenOrder(invoice)?.orderNumber ?? null,
      invoiceDate: invoice.invoiceDate.toISOString(),
      sellerCompanyNameAr: invoice.sellerCompanyNameAr,
      sellerCompanyNameEn: invoice.sellerCompanyNameEn,
      sellerVatNumber: invoice.sellerVatNumber,
      sellerCrNumber: invoice.sellerCrNumber,
      sellerEmail: invoice.sellerEmail ?? null,
      sellerPhone: invoice.sellerPhone ?? null,
      lines: (invoice.lines ?? []).map((l) => ({
        id: l.id,
        nameAr: l.nameAr,
        nameEn: l.nameEn,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        lineTotal: l.lineTotal,
        vatAmount: l.vatAmount,
        modifiersSnapshot: l.modifiersSnapshot ?? null,
      })),
    },
    session: {
      id: session.id,
      status: 'closed',
      closedAt: closedAt.toISOString(),
      tableId: session.tableId,
      tableName: session.table.name,
    },
    loyaltyRedeem: loyaltyRedeem.loyaltyRedeemPoints
      ? {
          applied: true,
          points: loyaltyRedeem.loyaltyRedeemPoints,
          clamped: Boolean(loyaltyRedeem.clamped),
        }
      : { applied: false },
    loyaltyEarn,
  }
}
