import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  mapMenuCategoryToJson,
  menuCategoryCountInclude,
} from '@/lib/menu/map-menu-json'
import { requireAdminRestaurant } from '@/lib/menu/require-admin-restaurant'
import { menuCategoryPatchSchema } from '@/lib/menu/schemas'
import { prisma } from '@/lib/prisma'

async function loadOwnedCategory(profileId, id) {
  return prisma.menuCategory.findFirst({
    where: { id, businessProfileId: profileId },
    include: menuCategoryCountInclude,
  })
}

async function activeItemCountFor(categoryId) {
  return prisma.menuItem.count({
    where: { categoryId, active: true },
  })
}

export async function GET(_request, context) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { id } = await context.params
    const row = await loadOwnedCategory(auth.profileId, id)
    if (!row) return jsonError(404, 'NOT_FOUND', 'Category not found')
    const activeItemCount = await activeItemCountFor(id)
    return jsonOk({
      category: mapMenuCategoryToJson(row, { activeItemCount }),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/menu/categories/[id]')
  }
}

export async function PATCH(request, context) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedCategory(auth.profileId, id)
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Category not found')

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = menuCategoryPatchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    if (d.nameAr) {
      const dup = await prisma.menuCategory.findFirst({
        where: {
          businessProfileId: auth.profileId,
          nameAr: { equals: d.nameAr, mode: 'insensitive' },
          NOT: { id },
        },
        select: { id: true },
      })
      if (dup) {
        return jsonError(
          409,
          'DUPLICATE_CATEGORY',
          'A category with this name already exists',
        )
      }
    }

    /** @type {Record<string, unknown>} */
    const data = {}
    if (d.nameAr !== undefined) data.nameAr = d.nameAr
    if (d.nameEn !== undefined) data.nameEn = d.nameEn?.trim() || null
    if (d.sortOrder !== undefined) data.sortOrder = d.sortOrder
    if (d.active !== undefined) data.active = d.active

    const updated = await prisma.menuCategory.update({
      where: { id },
      data,
      include: menuCategoryCountInclude,
    })
    const activeItemCount = await activeItemCountFor(id)

    return jsonOk({
      category: mapMenuCategoryToJson(updated, { activeItemCount }),
    })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/menu/categories/[id]')
  }
}

/**
 * Deactivate category. Optional `?deactivateItems=true` also deactivates
 * active items in that category (items keep categoryId).
 */
export async function DELETE(request, context) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedCategory(auth.profileId, id)
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Category not found')

    const { searchParams } = new URL(request.url)
    const deactivateItems = searchParams.get('deactivateItems') === 'true'

    const updated = await prisma.$transaction(async (tx) => {
      if (deactivateItems) {
        await tx.menuItem.updateMany({
          where: {
            categoryId: id,
            businessProfileId: auth.profileId,
            active: true,
          },
          data: { active: false },
        })
      }
      return tx.menuCategory.update({
        where: { id },
        data: { active: false },
        include: menuCategoryCountInclude,
      })
    })

    const activeItemCount = await activeItemCountFor(id)

    return jsonOk({
      category: mapMenuCategoryToJson(updated, { activeItemCount }),
      deactivatedItems: deactivateItems,
    })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/menu/categories/[id]')
  }
}
