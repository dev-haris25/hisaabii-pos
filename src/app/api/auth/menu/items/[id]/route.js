import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { mapMenuItemToJson, menuItemInclude } from '@/lib/menu/map-menu-json'
import { menuItemImageUploadErrorResponse } from '@/lib/menu/menu-item-image-errors'
import { resolveMenuItemImageAfterUpsert } from '@/lib/menu/menu-item-image-storage'
import { replaceMenuItemModifiers } from '@/lib/menu/replace-menu-item-modifiers'
import { requireAdminRestaurant } from '@/lib/menu/require-admin-restaurant'
import { menuItemPatchSchema } from '@/lib/menu/schemas'
import { prisma } from '@/lib/prisma'

async function loadOwnedItem(profileId, id) {
  return prisma.menuItem.findFirst({
    where: { id, businessProfileId: profileId },
    include: menuItemInclude,
  })
}

export async function GET(_request, context) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { id } = await context.params
    const row = await loadOwnedItem(auth.profileId, id)
    if (!row) return jsonError(404, 'NOT_FOUND', 'Item not found')
    return jsonOk({ item: mapMenuItemToJson(row) })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/menu/items/[id]')
  }
}

export async function PATCH(request, context) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedItem(auth.profileId, id)
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Item not found')

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = menuItemPatchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    /** @type {Record<string, unknown>} */
    const data = {}
    if (d.nameAr !== undefined) data.nameAr = d.nameAr
    if (d.nameEn !== undefined) data.nameEn = d.nameEn?.trim() || null
    if (d.price !== undefined) data.price = d.price
    if (d.vatPreset !== undefined) data.vatPreset = d.vatPreset
    if (d.sortOrder !== undefined) data.sortOrder = d.sortOrder
    if (d.active !== undefined) data.active = d.active
    if (d.categoryId !== undefined) {
      const categoryId = d.categoryId || null
      if (categoryId) {
        const cat = await prisma.menuCategory.findFirst({
          where: { id: categoryId, businessProfileId: auth.profileId },
          select: { id: true },
        })
        if (!cat) {
          return jsonError(400, 'INVALID_CATEGORY', 'Category not found')
        }
      }
      data.categoryId = categoryId
    }

    let updated = await prisma.$transaction(async (tx) => {
      await tx.menuItem.update({
        where: { id },
        data,
      })
      await replaceMenuItemModifiers(
        tx,
        id,
        d.variantGroups,
        d.customizations,
      )
      return tx.menuItem.findFirstOrThrow({
        where: { id },
        include: menuItemInclude,
      })
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    const wantsImageChange =
      d.clearImage === true || Boolean(d.imageBase64?.trim())
    if (wantsImageChange) {
      try {
        const assets = await resolveMenuItemImageAfterUpsert(
          auth.profileId,
          id,
          { imageUrl: updated.imageUrl },
          d,
        )
        if (assets.imageUrl !== updated.imageUrl) {
          updated = await prisma.menuItem.update({
            where: { id },
            data: { imageUrl: assets.imageUrl },
            include: menuItemInclude,
          })
        }
      } catch (imgErr) {
        console.error('[hisabi-pos:menu] PATCH image upload failed', imgErr)
        return (
          menuItemImageUploadErrorResponse(imgErr) ??
          jsonError(500, 'UPLOAD_FAILED', 'Could not save image')
        )
      }
    }

    return jsonOk({ item: mapMenuItemToJson(updated) })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/menu/items/[id]')
  }
}

/** Deactivate item — preserves invoice line history (rules.md #22 inventory-free). */
export async function DELETE(_request, context) {
  try {
    const auth = await requireAdminRestaurant()
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedItem(auth.profileId, id)
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Item not found')

    const updated = await prisma.menuItem.update({
      where: { id },
      data: { active: false },
      include: menuItemInclude,
    })

    return jsonOk({ item: mapMenuItemToJson(updated) })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/menu/items/[id]')
  }
}
