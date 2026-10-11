import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { mapMenuItemToJson, menuItemManageInclude } from '@/lib/menu/map-menu-json'
import { recipeIngredientErrorResponse } from '@/lib/menu/recipe-ingredient-error'
import { menuItemImageUploadErrorResponse } from '@/lib/menu/menu-item-image-errors'
import { resolveMenuItemImageAfterUpsert } from '@/lib/menu/menu-item-image-storage'
import { replaceMenuItemModifiers } from '@/lib/menu/replace-menu-item-modifiers'
import { replaceMenuItemRecipe } from '@/lib/menu/replace-menu-item-recipe'
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
          include: menuItemManageInclude,
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
      include: menuItemManageInclude,
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

    let created = await prisma.$transaction(async (tx) => {
      const row = await tx.menuItem.create({
        data: {
          businessProfileId: profileId,
          categoryId,
          nameAr: d.nameAr,
          nameEn: d.nameEn?.trim() || null,
          price: d.price,
          vatPreset: d.vatPreset ?? 'standard',
          sortOrder: d.sortOrder ?? 0,
          active: d.active ?? true,
          loyaltyRedeemable: d.loyaltyRedeemable ?? false,
          calories: d.calories ?? null,
        },
      })
      await replaceMenuItemModifiers(
        tx,
        row.id,
        d.variantGroups ?? [],
        d.customizations ?? [],
        profileId,
      )
      if (d.recipe !== undefined) {
        await replaceMenuItemRecipe(tx, profileId, row.id, d.recipe)
      }
      return tx.menuItem.findFirstOrThrow({
        where: { id: row.id },
        include: menuItemManageInclude,
      })
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

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
          include: menuItemManageInclude,
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
    const ingredientError = recipeIngredientErrorResponse(err)
    if (ingredientError) return ingredientError
    return handleRouteError(err, 'POST /api/auth/menu/items')
  }
}
