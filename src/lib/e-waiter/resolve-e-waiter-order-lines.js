import { publicMenuItemInclude } from '@/lib/e-waiter/map-public-menu'
import {
  resolveLineDisplayCalories,
  selectedVariantOptionsFromItem,
} from '@/lib/menu/resolve-display-calories'
import { resolveCheckoutModifiers } from '@/lib/menu/resolve-checkout-modifiers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const eWaiterOrderLinesSchema = z
  .array(
    z.object({
      menuItemId: z.string().trim().min(1),
      quantity: z.coerce.number().int().min(1).max(99),
      variantOptionIds: z.array(z.string().trim().min(1)).optional(),
      optionIds: z.array(z.string().trim().min(1)).optional(),
      customizationIds: z.array(z.string().trim().min(1)).optional(),
      lineNote: z.string().trim().max(500).optional().nullable(),
    }),
  )
  .max(50)

/**
 * Validate cart/edit lines against live menu for this restaurant.
 *
 * @param {string} businessProfileId
 * @param {z.infer<typeof eWaiterOrderLinesSchema>} lines
 * @returns {Promise<
 *   | { ok: true, lines: Array<{
 *       menuItemId: string
 *       nameAr: string
 *       nameEn: string | null
 *       quantity: number
 *       lineNote: string | null
 *       variantOptionIds: string[]
 *       customizationIds: string[]
 *       modifiersSnapshot: unknown
 *     }> }
 *   | { ok: false, status: number, code: string, message: string }
 * >}
 */
export async function resolveEWaiterOrderLines(businessProfileId, lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: true, lines: [] }
  }

  const menuItemIds = [...new Set(lines.map((l) => l.menuItemId))]
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: menuItemIds },
      businessProfileId,
      active: true,
    },
    include: publicMenuItemInclude,
  })
  /** @type {Map<string, (typeof menuItems)[number]>} */
  const itemById = new Map(menuItems.map((row) => [row.id, row]))

  /** @type {Array<{
   *   menuItemId: string
   *   nameAr: string
   *   nameEn: string | null
   *   quantity: number
   *   lineNote: string | null
   *   variantOptionIds: string[]
   *   customizationIds: string[]
   *   modifiersSnapshot: unknown
   * }>} */
  const resolvedLines = []

  for (const line of lines) {
    const item = itemById.get(line.menuItemId)
    if (!item) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_MENU_ITEM',
        message: 'One or more menu items are unavailable',
      }
    }
    const variantOptionIds = line.variantOptionIds ?? line.optionIds ?? []
    try {
      const resolved = resolveCheckoutModifiers(
        item,
        variantOptionIds,
        line.customizationIds ?? [],
      )
      resolvedLines.push({
        menuItemId: item.id,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        quantity: line.quantity,
        lineNote: line.lineNote?.trim() || null,
        variantOptionIds: resolved.variantOptionIds,
        customizationIds: resolved.customizationIds,
        modifiersSnapshot: resolved.modifiersSnapshot,
      })
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String(err.code)
          : 'VALIDATION_ERROR'
      return {
        ok: false,
        status: 400,
        code,
        message:
          code === 'INVALID_VARIANT'
            ? 'One or more selected options are invalid'
            : code === 'INVALID_CUSTOMIZATION'
              ? 'One or more selected extras are invalid'
              : 'Invalid order line',
      }
    }
  }

  return { ok: true, lines: resolvedLines }
}

/**
 * Kitchen order for this public table token (scoped to restaurant + table).
 *
 * @param {{ id: string }} profile
 * @param {{ id: string }} table
 * @param {string} kitchenOrderId
 */
export async function loadPublicTableRound(profile, table, kitchenOrderId) {
  const id = String(kitchenOrderId ?? '').trim()
  if (!id) return null

  return prisma.kitchenOrder.findFirst({
    where: {
      id,
      businessProfileId: profile.id,
      tableSession: {
        tableId: table.id,
        businessProfileId: profile.id,
      },
    },
    include: publicRoundInclude,
  })
}

/**
 * All non-cancelled rounds on the open table session (oldest → newest).
 * Includes served/completed so guests can review history.
 *
 * @param {{ id: string }} profile
 * @param {{ id: string }} table
 */
export async function loadPublicTableSessionRounds(profile, table) {
  const session = await prisma.tableSession.findFirst({
    where: {
      tableId: table.id,
      businessProfileId: profile.id,
      status: 'open',
    },
    select: { id: true },
  })
  if (!session) return []

  return prisma.kitchenOrder.findMany({
    where: {
      tableSessionId: session.id,
      businessProfileId: profile.id,
      status: { not: 'cancelled' },
    },
    orderBy: [{ roundNumber: 'asc' }, { createdAt: 'asc' }],
    include: publicRoundInclude,
  })
}

const publicRoundInclude = {
  sessionLines: {
    where: { cancelled: false },
    orderBy: { createdAt: 'asc' },
    include: {
      menuItem: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          imageUrl: true,
          calories: true,
          updatedAt: true,
          vatPreset: true,
          price: true,
          variantGroups: {
            orderBy: { sortOrder: 'asc' },
            include: { options: { orderBy: { sortOrder: 'asc' } } },
          },
          customizations: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  },
}

/**
 * @param {NonNullable<Awaited<ReturnType<typeof loadPublicTableRound>>>} row
 * @param {string} slug
 */
export function mapPublicRoundJson(row, slug) {
  const editable = row.status === 'pending'
  return {
    kitchenOrderId: row.id,
    orderNumber: row.orderNumber,
    roundNumber: row.roundNumber,
    status: row.status,
    editable,
    itemsUpdatedAt: row.itemsUpdatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    lines: row.sessionLines.map((line) => {
      const variantOptionIds = Array.isArray(line.variantOptionIds)
        ? line.variantOptionIds.map(String)
        : []
      const customizationIds = Array.isArray(line.customizationIds)
        ? line.customizationIds.map(String)
        : []
      const hasImage = Boolean(line.menuItem?.imageUrl)
      const selectedOptions = selectedVariantOptionsFromItem(
        line.menuItem,
        variantOptionIds,
      )
      return {
        id: line.id,
        menuItemId: line.menuItemId,
        nameAr: line.menuItem?.nameAr ?? '',
        nameEn: line.menuItem?.nameEn ?? null,
        quantity: line.quantity,
        variantOptionIds,
        customizationIds,
        lineNote: line.lineNote,
        calories: resolveLineDisplayCalories(
          line.menuItem?.calories,
          selectedOptions,
        ),
        itemCalories:
          typeof line.menuItem?.calories === 'number' &&
          Number.isFinite(line.menuItem.calories)
            ? line.menuItem.calories
            : null,
        hasImage,
        imageUrl: hasImage
          ? `/api/public/menu/${encodeURIComponent(slug)}/items/${line.menuItemId}/image?t=${encodeURIComponent(line.menuItem.updatedAt.toISOString())}`
          : null,
        vatPreset: line.menuItem?.vatPreset ?? 'standard',
        price: line.menuItem?.price ?? '0',
        variantGroups: (line.menuItem?.variantGroups ?? []).map((group) => ({
          id: group.id,
          nameAr: group.nameAr,
          nameEn: group.nameEn,
          sortOrder: group.sortOrder,
          options: (group.options ?? []).map((option) => ({
            id: option.id,
            nameAr: option.nameAr,
            nameEn: option.nameEn,
            priceChange: option.priceChange,
            calories:
              typeof option.calories === 'number' &&
              Number.isFinite(option.calories)
                ? option.calories
                : null,
            isDefault: option.isDefault,
            sortOrder: option.sortOrder,
          })),
        })),
        customizations: (line.menuItem?.customizations ?? []).map((c) => ({
          id: c.id,
          nameAr: c.nameAr,
          nameEn: c.nameEn,
          priceChange: c.priceChange,
          sortOrder: c.sortOrder,
        })),
      }
    }),
  }
}
