import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { isLoyaltyEnabledForProfile } from '@/lib/e-waiter/loyalty-enabled'
import { publicMenuItemImageUrl } from '@/lib/e-waiter/map-public-menu'
import { resolvePublicOrderTable } from '@/lib/e-waiter/resolve-public-order-table'
import {
  computeLineAmounts,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import {
  formatLineModifierDetails,
  menuItemHasCustomizations,
  menuItemHasVariantGroups,
  normalizeModifiersSnapshot,
  optionIdsFromSelection,
  defaultVariantSelection,
} from '@/lib/menu/item-modifiers'
import {
  resolveLineDisplayCalories,
  selectedVariantOptionsFromItem,
} from '@/lib/menu/resolve-display-calories'
import { prisma } from '@/lib/prisma'

/**
 * @param {Record<string, unknown>} menuItem
 * @param {unknown} modifiersSnapshot
 * @returns {{ optionIds: string[], customizationIds: string[] }}
 */
function resolveReorderModifiers(menuItem, modifiersSnapshot) {
  const snap = normalizeModifiersSnapshot(modifiersSnapshot)
  /** @type {string[]} */
  const optionIds = []
  for (const vo of snap.variantOptions) {
    let foundId = null
    for (const group of menuItem.variantGroups ?? []) {
      for (const option of group.options ?? []) {
        const arMatch = option.nameAr === vo.optionNameAr
        const enMatch =
          vo.optionNameEn != null &&
          option.nameEn != null &&
          option.nameEn === vo.optionNameEn
        if (arMatch || enMatch) {
          foundId = option.id
          break
        }
      }
      if (foundId) break
    }
    if (foundId) optionIds.push(foundId)
  }

  /** @type {string[]} */
  const customizationIds = []
  for (const custom of snap.customizations) {
    const found = (menuItem.customizations ?? []).find((row) => {
      const arMatch = row.nameAr === custom.nameAr
      const enMatch =
        custom.nameEn != null &&
        row.nameEn != null &&
        row.nameEn === custom.nameEn
      return arMatch || enMatch
    })
    if (found?.id) customizationIds.push(found.id)
  }

  const hadSnapshot =
    snap.variantOptions.length > 0 || snap.customizations.length > 0
  if (
    !hadSnapshot &&
    (menuItemHasVariantGroups(menuItem) || menuItemHasCustomizations(menuItem))
  ) {
    return {
      optionIds: optionIdsFromSelection(defaultVariantSelection(menuItem)),
      customizationIds: [],
    }
  }

  return { optionIds, customizationIds }
}

/**
 * Past settled invoices for a held loyaltyAccountId, grouped by order.
 * No TableSession required.
 */
export async function GET(request, context) {
  try {
    const { slug, qrToken } = await context.params
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    if (!(await isLoyaltyEnabledForProfile(resolved.profile.id))) {
      return jsonError(
        400,
        'LOYALTY_MODULE_DISABLED',
        'Loyalty points are not enabled for this restaurant',
      )
    }

    const loyaltyAccountId = (
      new URL(request.url).searchParams.get('loyaltyAccountId') ?? ''
    ).trim()
    if (!loyaltyAccountId) {
      return jsonError(400, 'VALIDATION_ERROR', 'loyaltyAccountId is required')
    }

    const account = await prisma.loyaltyAccount.findFirst({
      where: {
        id: loyaltyAccountId,
        businessProfileId: resolved.profile.id,
        ...WHERE_NOT_DELETED,
      },
      select: { id: true, balance: true },
    })
    if (!account) {
      return jsonError(404, 'LOYALTY_ACCOUNT_NOT_FOUND', 'Loyalty account not found')
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        businessProfileId: resolved.profile.id,
        loyaltyAccountId: account.id,
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        grandTotal: true,
        discountAmount: true,
        loyaltyDiscountAmount: true,
        loyaltyPointsRedeemed: true,
        couponCode: true,
        lines: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            menuItemId: true,
            nameAr: true,
            nameEn: true,
            quantity: true,
            unitPrice: true,
            vatPreset: true,
            modifiersSnapshot: true,
          },
        },
      },
    })

    const menuItemIds = [
      ...new Set(
        invoices
          .flatMap((inv) => inv.lines.map((l) => l.menuItemId))
          .filter(Boolean),
      ),
    ]

    const activeItems =
      menuItemIds.length > 0
        ? await prisma.menuItem.findMany({
            where: {
              id: { in: /** @type {string[]} */ (menuItemIds) },
              businessProfileId: resolved.profile.id,
              active: true,
            },
            select: {
              id: true,
              imageUrl: true,
              updatedAt: true,
              calories: true,
              variantGroups: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  options: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      id: true,
                      nameAr: true,
                      nameEn: true,
                      priceChange: true,
                      calories: true,
                      isDefault: true,
                      sortOrder: true,
                    },
                  },
                },
              },
              customizations: {
                orderBy: { sortOrder: 'asc' },
              },
            },
          })
        : []

    /** @type {Map<string, (typeof activeItems)[number]>} */
    const activeById = new Map(activeItems.map((row) => [row.id, row]))

    const orders = invoices.map((inv) => {
      let itemsSubtotalNum = 0
      const lines = inv.lines.map((line) => {
        const qty = Math.max(0, Math.round(Number(line.quantity)) || 0)
        const active =
          line.menuItemId != null ? activeById.get(line.menuItemId) : null
        const reorderable = Boolean(active) && qty >= 1
        const modifiers =
          reorderable && active
            ? resolveReorderModifiers(active, line.modifiersSnapshot)
            : { optionIds: [], customizationIds: [] }
        const imageUrl =
          active?.imageUrl != null
            ? publicMenuItemImageUrl(resolved.profile.slug, active)
            : null
        const calories =
          reorderable && active
            ? resolveLineDisplayCalories(
                active.calories,
                selectedVariantOptionsFromItem(active, modifiers.optionIds),
              )
            : typeof active?.calories === 'number' &&
                Number.isFinite(active.calories)
              ? active.calories
              : null
        const modifierNamesAr = formatLineModifierDetails(
          line.modifiersSnapshot,
          null,
          'ar',
        )
        const modifierNamesEn = formatLineModifierDetails(
          line.modifiersSnapshot,
          null,
          'en',
        )

        // Full VAT-inclusive item price — ignore order-level discounts allocated to lines.
        const inclusive = computeLineAmounts({
          quantity: qty,
          unitPrice: String(line.unitPrice ?? '0'),
          discount: '0',
          vatPreset: String(line.vatPreset ?? 'standard'),
        })
        const unitInclusive = computeLineAmounts({
          quantity: 1,
          unitPrice: String(line.unitPrice ?? '0'),
          discount: '0',
          vatPreset: String(line.vatPreset ?? 'standard'),
        })
        itemsSubtotalNum += inclusive.lineTotal

        return {
          id: line.id,
          menuItemId: line.menuItemId,
          nameAr: line.nameAr,
          nameEn: line.nameEn,
          quantity: qty,
          unitPrice: decimalStringFromNumber(unitInclusive.lineTotal),
          lineTotal: decimalStringFromNumber(inclusive.lineTotal),
          imageUrl,
          calories,
          modifierNamesAr,
          modifierNamesEn,
          optionIds: modifiers.optionIds,
          customizationIds: modifiers.customizationIds,
          reorderable,
        }
      })

      const itemsSubtotal = decimalStringFromNumber(itemsSubtotalNum)
      const grandTotal = String(inv.grandTotal ?? '0')
      const discountInclusiveNum = Math.max(
        0,
        Math.round((itemsSubtotalNum - parseMoney(grandTotal)) * 100) / 100,
      )

      /** @type {'loyalty' | 'coupon' | 'manual' | null} */
      let discountType = null
      if (discountInclusiveNum > 0) {
        if (
          parseMoney(inv.loyaltyDiscountAmount) > 0 ||
          parseMoney(inv.loyaltyPointsRedeemed) > 0
        ) {
          discountType = 'loyalty'
        } else if (inv.couponCode != null && String(inv.couponCode).trim()) {
          discountType = 'coupon'
        } else if (parseMoney(inv.discountAmount) > 0) {
          discountType = 'manual'
        } else {
          // Fallback when totals differ but type fields are missing.
          discountType = 'manual'
        }
      }

      const discount =
        discountType != null
          ? {
              type: discountType,
              amount: decimalStringFromNumber(discountInclusiveNum),
              points:
                discountType === 'loyalty' && inv.loyaltyPointsRedeemed != null
                  ? String(inv.loyaltyPointsRedeemed)
                  : null,
              couponCode:
                discountType === 'coupon' && inv.couponCode != null
                  ? String(inv.couponCode).trim()
                  : null,
            }
          : null

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        createdAt: inv.createdAt.toISOString(),
        itemsSubtotal,
        discount,
        /** Paid total after discount (VAT-inclusive). */
        grandTotal,
        reorderable: lines.some((l) => l.reorderable),
        lines,
      }
    })

    return jsonOk({
      loyaltyBalance: String(account.balance ?? '0'),
      orders,
    })
  } catch (err) {
    return handleRouteError(
      err,
      'GET /api/public/order/[slug]/[qrToken]/past-orders',
    )
  }
}
