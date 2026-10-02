import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { orderVatInclusiveSubtotalFromLines } from '@/lib/coupons/coupon-order-discount'
import { loadEnabledLoyaltySettings } from '@/lib/e-waiter/loyalty-enabled'
import { computeLoyaltyRedeemCeilings } from '@/lib/loyalty/compute-loyalty-redeem-ceilings'
import {
  checkLoyaltyMinOrderValue,
  checkLoyaltyRedeemEligibility,
  validateLoyaltyRedeemAmount,
} from '@/lib/loyalty/loyalty-redeem-eligibility'
import { resolveCheckoutModifiers } from '@/lib/menu/resolve-checkout-modifiers'
import { prisma } from '@/lib/prisma'

/**
 * Build priced cart lines from non-cancelled TableSessionLines for loyalty math.
 *
 * @param {string} businessProfileId
 * @param {string} tableSessionId
 * @param {typeof prisma | import('@/generated/prisma/client').Prisma.TransactionClient} [db]
 */
export async function buildSessionLoyaltyCartLines(
  businessProfileId,
  tableSessionId,
  db = prisma,
) {
  const lines = await db.tableSessionLine.findMany({
    where: { tableSessionId, cancelled: false },
    include: {
      menuItem: {
        include: {
          variantGroups: { include: { options: true } },
          customizations: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  /** @type {Array<{ menuItemId: string, quantity: number, unitPrice: string, vatPreset: string }>} */
  const priced = []
  for (const line of lines) {
    const item = line.menuItem
    if (!item || item.businessProfileId !== businessProfileId) continue
    const variantOptionIds = Array.isArray(line.variantOptionIds)
      ? line.variantOptionIds.map(String)
      : []
    const customizationIds = Array.isArray(line.customizationIds)
      ? line.customizationIds.map(String)
      : []
    try {
      const resolved = resolveCheckoutModifiers(
        item,
        variantOptionIds,
        customizationIds,
      )
      priced.push({
        menuItemId: item.id,
        quantity: line.quantity,
        unitPrice: resolved.unitPrice,
        vatPreset: item.vatPreset ?? 'standard',
      })
    } catch {
      // Skip invalid historical modifier combos for redeem preview.
    }
  }
  return priced
}

/**
 * Server-side redeem preview / validation for an open E-Waiter session.
 * Settlement must re-run these checks as authority.
 *
 * @param {{
 *   businessProfileId: string
 *   tableSessionId: string
 *   loyaltyAccountId: string
 *   requestedPoints?: string | null
 * }} args
 */
export async function evaluateEWaiterSessionLoyaltyRedeem(args) {
  const settings = await loadEnabledLoyaltySettings(args.businessProfileId)
  if (!settings) {
    return {
      ok: false,
      status: 400,
      code: 'LOYALTY_MODULE_DISABLED',
      message: 'Loyalty points are not enabled for this restaurant',
    }
  }

  const account = await prisma.loyaltyAccount.findFirst({
    where: {
      id: args.loyaltyAccountId,
      businessProfileId: args.businessProfileId,
      ...WHERE_NOT_DELETED,
    },
  })
  if (!account) {
    return {
      ok: false,
      status: 404,
      code: 'LOYALTY_ACCOUNT_NOT_FOUND',
      message: 'Loyalty account not found',
    }
  }

  const balanceElig = checkLoyaltyRedeemEligibility(account, settings)
  if (!balanceElig.eligible) {
    return {
      ok: true,
      eligible: false,
      reason: balanceElig.reason,
      balance: account.balance,
      effectiveCeiling: '0.00',
      loyaltyAccountId: account.id,
    }
  }

  const cartLines = await buildSessionLoyaltyCartLines(
    args.businessProfileId,
    args.tableSessionId,
  )
  if (cartLines.length === 0) {
    return {
      ok: true,
      eligible: false,
      reason: 'empty_cart',
      balance: account.balance,
      effectiveCeiling: '0.00',
      loyaltyAccountId: account.id,
    }
  }

  const cartVatInclusiveTotal = orderVatInclusiveSubtotalFromLines(cartLines)
  const minOrder = checkLoyaltyMinOrderValue(cartVatInclusiveTotal, settings)
  if (!minOrder.eligible) {
    return {
      ok: true,
      eligible: false,
      reason: minOrder.reason,
      balance: account.balance,
      cartVatInclusiveTotal,
      effectiveCeiling: '0.00',
      loyaltyAccountId: account.id,
    }
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
    cartLines,
  )

  const ceilingNum = Number.parseFloat(ceilings.effectiveCeiling)
  if (!Number.isFinite(ceilingNum) || ceilingNum <= 0) {
    return {
      ok: true,
      eligible: false,
      reason: 'zero_ceiling',
      balance: account.balance,
      cartVatInclusiveTotal,
      ...ceilings,
      loyaltyAccountId: account.id,
    }
  }

  if (args.requestedPoints != null && String(args.requestedPoints).trim() !== '') {
    const amountCheck = validateLoyaltyRedeemAmount(
      args.requestedPoints,
      ceilings,
    )
    if (!amountCheck.valid) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_REDEEM_AMOUNT',
        message: 'Requested redeem points are not allowed',
        reason: amountCheck.reason,
        maxAllowed: amountCheck.maxAllowed ?? ceilings.effectiveCeiling,
        ...ceilings,
        balance: account.balance,
        loyaltyAccountId: account.id,
      }
    }
  }

  return {
    ok: true,
    eligible: true,
    balance: account.balance,
    cartVatInclusiveTotal,
    ...ceilings,
    loyaltyAccountId: account.id,
  }
}
