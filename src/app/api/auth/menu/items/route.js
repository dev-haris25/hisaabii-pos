import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { mapMenuItemToJson, menuItemInclude } from '@/lib/menu/map-menu-json'
import { menuItemImageUploadErrorResponse } from '@/lib/menu/menu-item-image-errors'
import { resolveMenuItemImageAfterUpsert } from '@/lib/menu/menu-item-image-storage'
import { requireAdminRestaurant } from '@/lib/menu/require-admin-restaurant'
import { menuItemBodySchema } from '@/lib/menu/schemas'
import { prisma } from '@/lib/prisma'

export async function GET(request) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { profileId } = auth

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim()
    const activeRaw = searchParams.get('active') ?? 'all'
    const activeFilter =
      activeRaw === 'true' || activeRaw === 'false' ? activeRaw : 'all'
    const categoryId = (searchParams.get('categoryId') ?? '').trim() || null

    /** @type {Record<string, unknown>} */
    const where = { businessProfileId: profileId }
    if (activeFilter === 'true') where.active = true
    if (activeFilter === 'false') where.active = false
    if (categoryId) where.categoryId = categoryId
    if (search) {
      where.OR = [
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ]
    }

    const orderBy = [{ sortOrder: 'asc' }, { nameAr: 'asc' }]

    if (shouldPaginateListRequest(searchParams)) {
      const { page, limit, skip } = parseListPagination(searchParams, {
        defaultLimit: 10,
      })
      const [total, rows] = await Promise.all([
        prisma.menuItem.count({ where }),
        prisma.menuItem.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: menuItemInclude,
        }),
      ])
      return jsonOk({
        items: rows.map(mapMenuItemToJson),
        pagination: buildPaginationMeta(page, limit, total),
      })
    }

    const rows = await prisma.menuItem.findMany({
      where,
      orderBy,
      include: menuItemInclude,
    })
    return jsonOk({ items: rows.map(mapMenuItemToJson) })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/menu/items')
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

    const parsed = menuItemBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    const categoryId = d.categoryId || null
    if (categoryId) {
      const cat = await prisma.menuCategory.findFirst({
        where: { id: categoryId, businessProfileId: profileId },
        select: { id: true },
      })
      if (!cat) {
        return jsonError(400, 'INVALID_CATEGORY', 'Category not found')
      }
    }

    let created = await prisma.menuItem.create({
      data: {
        businessProfileId: profileId,
        categoryId,
        nameAr: d.nameAr,
        nameEn: d.nameEn?.trim() || null,
        price: d.price,
        vatPreset: d.vatPreset ?? 'standard',
        sortOrder: d.sortOrder ?? 0,
        active: d.active ?? true,
      },
      include: menuItemInclude,
    })

    try {
      const assets = await resolveMenuItemImageAfterUpsert(
        profileId,
        created.id,
        { imageUrl: created.imageUrl },
        d,
      )
      if (assets.imageUrl !== created.imageUrl) {
        created = await prisma.menuItem.update({
          where: { id: created.id },
          data: { imageUrl: assets.imageUrl },
          include: menuItemInclude,
        })
      }
    } catch (imgErr) {
      console.error('[hisabi-pos:menu] POST image upload failed', imgErr)
      return (
        menuItemImageUploadErrorResponse(imgErr) ??
        jsonError(500, 'UPLOAD_FAILED', 'Could not save image')
      )
    }

    return jsonOk({ item: mapMenuItemToJson(created) })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/menu/items')
  }
}
