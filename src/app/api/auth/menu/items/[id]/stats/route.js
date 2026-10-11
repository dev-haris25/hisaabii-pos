import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  computeMenuItemExtraCosts,
  computeMenuItemPrepCost,
} from '@/lib/menu/compute-menu-item-prep-cost'
import { requireAdminRestaurant } from '@/lib/menu/require-admin-restaurant'
import { parseMoney, toMoneyStr } from '@/lib/reports/money'
import { prisma } from '@/lib/prisma'

/**
 * Sales + prep-cost stats for one menu item.
 */
export async function GET(_request, context) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { id } = await context.params

    const item = await prisma.menuItem.findFirst({
      where: { id, businessProfileId: auth.profileId },
      select: { id: true },
    })
    if (!item) return jsonError(404, 'NOT_FOUND', 'Item not found')

    const lines = await prisma.invoiceLine.findMany({
      where: {
        menuItemId: id,
        invoice: {
          businessProfileId: auth.profileId,
          status: 'completed',
        },
      },
      select: {
        quantity: true,
        lineTotal: true,
        invoice: { select: { id: true } },
      },
    })

    let qtySold = 0
    let revenue = 0
    /** @type {Set<string>} */
    const invoiceIds = new Set()

    for (const line of lines) {
      qtySold += Number(line.quantity) || 0
      revenue += parseMoney(line.lineTotal)
      invoiceIds.add(line.invoice.id)
    }

    const prep = await computeMenuItemPrepCost(prisma, auth.profileId, id)
    const extraCosts = await computeMenuItemExtraCosts(
      prisma,
      auth.profileId,
      id,
    )

    return jsonOk({
      stats: {
        invoiceCount: invoiceIds.size,
        qtySold,
        revenue: toMoneyStr(revenue),
        prepCost: prep.prepCost,
        prepCostIncomplete: prep.incomplete === true,
        // Per option / customization id; prepCost stays the default recipe.
        extraCosts,
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/menu/items/[id]/stats')
  }
}
