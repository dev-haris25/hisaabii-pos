import { menuItemInclude } from '@/lib/menu/map-menu-json'
import { resolveCheckoutModifiers } from '@/lib/menu/resolve-checkout-modifiers'
import { prisma } from '@/lib/prisma'

/**
 * Price POS cart lines the same way checkout does (read-only).
 * Returns priced lines with menuItemId + resolved variantOptionIds for
 * BOGO/Combo matching (customizationIds are intentionally omitted).
 *
 * @param {string} businessProfileId
 * @param {Array<{
 *   menuItemId: string
 *   quantity: number
 *   variantOptionIds?: string[]
 *   customizationIds?: string[]
 * }>} lines
 * @returns {Promise<
 *   | { ok: true, pricedLines: Array<{ menuItemId: string, quantity: number, unitPrice: string, vatPreset: string, variantOptionIds: string[] }> }
 *   | { ok: false, code: string, message: string }
 * >}
 */
export async function pricePosCartLinesForCoupon(businessProfileId, lines) {
  const itemIds = [...new Set(lines.map((l) => l.menuItemId))]
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: itemIds },
      businessProfileId,
      active: true,
    },
    include: menuItemInclude,
  })
  /** @type {Map<string, (typeof menuItems)[number]>} */
  const byId = new Map(menuItems.map((m) => [m.id, m]))

  /** @type {Array<{ menuItemId: string, quantity: number, unitPrice: string, vatPreset: string, variantOptionIds: string[] }>} */
  const pricedLines = []

  for (const line of lines) {
    const item = byId.get(line.menuItemId)
    if (!item) {
      return {
        ok: false,
        code: 'INVALID_MENU_ITEM',
        message: 'One or more menu items are invalid',
      }
    }
    try {
      const resolved = resolveCheckoutModifiers(
        item,
        line.variantOptionIds,
        line.customizationIds,
      )
      pricedLines.push({
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        unitPrice: resolved.unitPrice,
        vatPreset: item.vatPreset,
        variantOptionIds: resolved.variantOptionIds ?? [],
      })
    } catch {
      return {
        ok: false,
        code: 'INVALID_VARIANT',
        message: 'One or more item options are invalid',
      }
    }
  }

  return { ok: true, pricedLines }
}
