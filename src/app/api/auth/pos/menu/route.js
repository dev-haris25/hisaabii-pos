import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import { mapMenuCategoryToJson, mapMenuItemToJson, menuItemInclude } from '@/lib/menu/map-menu-json'
import { prisma } from '@/lib/prisma'

/** Active menu catalog for the POS screen (ADMIN or CASHIER). */
export async function GET() {
  try {
    const auth = await requirePosRestaurant()
    if (auth.error) return auth.error
    const { profileId } = auth

    const [categories, items, settings] = await Promise.all([
      prisma.menuCategory.findMany({
        where: { businessProfileId: profileId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      }),
      prisma.menuItem.findMany({
        where: { businessProfileId: profileId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        include: menuItemInclude,
      }),
      prisma.businessSettings.findUnique({
        where: { businessProfileId: profileId },
        select: { discountCap: true, posOnScreenKeypad: true },
      }),
    ])

    return jsonOk({
      categories: categories.map((c) => mapMenuCategoryToJson(c)),
      items: items.map(mapMenuItemToJson),
      discountCap: settings?.discountCap ?? null,
      posOnScreenKeypad: settings?.posOnScreenKeypad === true,
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/pos/menu')
  }
}
