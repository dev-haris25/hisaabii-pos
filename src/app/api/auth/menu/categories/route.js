import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  mapMenuCategoriesWithActiveCounts,
  mapMenuCategoryToJson,
  menuCategoryCountInclude,
} from '@/lib/menu/map-menu-json'
import { requireAdminRestaurant } from '@/lib/menu/require-admin-restaurant'
import { menuCategoryBodySchema } from '@/lib/menu/schemas'
import { prisma } from '@/lib/prisma'

export async function GET(request) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { profileId } = auth

    const { searchParams } = new URL(request.url)
    const activeRaw = searchParams.get('active') ?? 'all'
    const activeFilter =
      activeRaw === 'true' || activeRaw === 'false' ? activeRaw : 'all'

    /** @type {Record<string, unknown>} */
    const where = { businessProfileId: profileId }
    if (activeFilter === 'true') where.active = true
    if (activeFilter === 'false') where.active = false

    const rows = await prisma.menuCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      include: menuCategoryCountInclude,
    })

    return jsonOk({
      categories: await mapMenuCategoriesWithActiveCounts(rows),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/menu/categories')
  }
}

export async function POST(request) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { profileId } = auth

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = menuCategoryBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const nameAr = parsed.data.nameAr
    const dup = await prisma.menuCategory.findFirst({
      where: {
        businessProfileId: profileId,
        nameAr: { equals: nameAr, mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (dup) {
      return jsonError(409, 'DUPLICATE_CATEGORY', 'A category with this name already exists')
    }

    const created = await prisma.menuCategory.create({
      data: {
        businessProfileId: profileId,
        nameAr,
        nameEn: parsed.data.nameEn?.trim() || null,
        sortOrder: parsed.data.sortOrder ?? 0,
        active: parsed.data.active ?? true,
      },
      include: menuCategoryCountInclude,
    })

    return jsonOk({
      category: mapMenuCategoryToJson(created, { activeItemCount: 0 }),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/menu/categories')
  }
}
