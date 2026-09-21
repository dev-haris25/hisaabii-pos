import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { maybeEmitLowStockAlert } from '@/lib/stock/emit-low-stock-alert'
import { mapStockItemToJson } from '@/lib/stock/map-stock-json'
import { stockItemPatchSchema } from '@/lib/stock/schemas'
import { canConvertUnits, convertStockQty, stockUnitLabel } from '@/lib/stock/units'
import { prisma } from '@/lib/prisma'

async function loadOwnedItem(profileId, id) {
  return prisma.stockItem.findFirst({
    where: { id, businessProfileId: profileId },
  })
}

export async function GET(_request, context) {
  try {
    const auth = await authorizeBusinessRequest(_request)
    if (auth.error) return auth.error
    const { id } = await context.params
    const row = await loadOwnedItem(auth.profile.id, id)
    if (!row) return jsonError(404, 'NOT_FOUND', 'Stock item not found')

    const recipeIngredients = await prisma.menuItemRecipeIngredient.findMany({
      where: {
        stockItemId: id,
        recipe: {
          menuItem: { businessProfileId: auth.profile.id },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        quantity: true,
        unit: true,
        recipe: {
          select: {
            menuItem: {
              select: {
                id: true,
                nameAr: true,
                nameEn: true,
                active: true,
              },
            },
          },
        },
      },
    })

    const recipesUsed = recipeIngredients.map((ing) => {
      const menuItem = ing.recipe.menuItem
      return {
        ingredientId: ing.id,
        menuItemId: menuItem.id,
        nameAr: menuItem.nameAr,
        nameEn: menuItem.nameEn,
        menuItemActive: menuItem.active,
        quantity: ing.quantity,
        unit: ing.unit,
        unitLabel: stockUnitLabel(ing.unit),
      }
    })

    return jsonOk({
      item: mapStockItemToJson(row),
      recipesUsed,
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/stock/items/[id]')
  }
}

export async function PATCH(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedItem(auth.profile.id, id)
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Stock item not found')
    if (!existing.active) {
      return jsonError(
        409,
        'STOCK_ITEM_DELETED',
        'This stock item was deleted and cannot be updated',
      )
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = stockItemPatchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    if (d.nameAr) {
      const dup = await prisma.stockItem.findFirst({
        where: {
          businessProfileId: auth.profile.id,
          nameAr: { equals: d.nameAr, mode: 'insensitive' },
          active: true,
          NOT: { id },
        },
        select: { id: true },
      })
      if (dup) {
        return jsonError(
          409,
          'DUPLICATE_STOCK_ITEM',
          'A stock item with this name already exists',
        )
      }
    }

    /** @type {Record<string, unknown>} */
    const data = {}
    if (d.nameAr !== undefined) data.nameAr = d.nameAr
    if (d.nameEn !== undefined) data.nameEn = d.nameEn?.trim() || null
    if (d.isBulk !== undefined) data.isBulk = d.isBulk
    // Soft-delete only via DELETE (unlinks recipes). Do not allow active:false here.
    if (d.active === false) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        'Use DELETE to soft-delete a stock item',
      )
    }
    if (d.active === true) data.active = true
    if (d.notes !== undefined) data.notes = d.notes?.trim() || null
    if (d.unitCost !== undefined) data.unitCost = d.unitCost
    if (d.lowStockThreshold !== undefined) {
      data.lowStockThreshold = d.lowStockThreshold
    }

    if (d.unit !== undefined && d.unit !== existing.unit) {
      if (!canConvertUnits(existing.unit, d.unit)) {
        return jsonError(
          400,
          'INCOMPATIBLE_UNIT',
          'Unit must stay in the same family (piece, mass, or volume)',
        )
      }
      data.unit = d.unit
      data.quantityOnHand = convertStockQty(
        existing.quantityOnHand,
        existing.unit,
        d.unit,
      )
      if (
        d.lowStockThreshold === undefined &&
        existing.lowStockThreshold != null
      ) {
        data.lowStockThreshold = convertStockQty(
          existing.lowStockThreshold,
          existing.unit,
          d.unit,
        )
      }
    }

    const updated = await prisma.stockItem.update({
      where: { id },
      data,
    })

    await maybeEmitLowStockAlert({
      businessProfileId: auth.profile.id,
      stockItem: updated,
      actorUserId: auth.session.id,
    })

    return jsonOk({
      item: mapStockItemToJson(updated),
    })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/stock/items/[id]')
  }
}

/**
 * Soft-delete stock item: hide from lists, unlink from recipes,
 * keep StockMovement history (never hard-delete the row).
 */
export async function DELETE(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedItem(auth.profile.id, id)
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Stock item not found')
    if (!existing.active) {
      return jsonError(404, 'NOT_FOUND', 'Stock item not found')
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.menuItemRecipeIngredient.deleteMany({
        where: { stockItemId: id },
      })
      return tx.stockItem.update({
        where: { id },
        data: { active: false },
      })
    })

    return jsonOk({
      item: mapStockItemToJson(updated),
    })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/stock/items/[id]')
  }
}
