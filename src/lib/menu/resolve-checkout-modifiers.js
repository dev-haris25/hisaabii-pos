import {
  buildModifiersSnapshotFromItem,
  computeUnitPriceFromItem,
  defaultVariantOptionId,
} from '@/lib/menu/item-modifiers'

/**
 * Validate option / customization IDs against a live menu item and
 * recompute the final unit price (base + extras).
 *
 * @param {{
 *   id: string
 *   price: string
 *   variantGroups?: Array<{
 *     id: string
 *     nameAr: string
 *     nameEn?: string | null
 *     options?: Array<{
 *       id: string
 *       nameAr: string
 *       nameEn?: string | null
 *       priceChange: string
 *       isDefault?: boolean
 *     }>
 *   }>
 *   customizations?: Array<{
 *     id: string
 *     nameAr: string
 *     nameEn?: string | null
 *     priceChange: string
 *   }>
 * }} item
 * @param {string[] | undefined | null} variantOptionIds
 * @param {string[] | undefined | null} customizationIds
 */
export function resolveCheckoutModifiers(
  item,
  variantOptionIds,
  customizationIds,
) {
  const groups = item.variantGroups ?? []
  /** @type {Map<string, { option: (typeof groups)[number]['options'][number], group: (typeof groups)[number] }>} */
  const optionById = new Map()
  for (const group of groups) {
    for (const option of group.options ?? []) {
      optionById.set(option.id, { option, group })
    }
  }

  const customById = new Map(
    (item.customizations ?? []).map((row) => [row.id, row]),
  )

  /** @type {string[]} */
  const resolvedOptionIds = []
  const provided = [...new Set((variantOptionIds ?? []).filter(Boolean))]
  const seenGroups = new Set()

  for (const id of provided) {
    const rec = optionById.get(id)
    if (!rec) {
      throw Object.assign(new Error('Invalid variant option'), {
        code: 'INVALID_VARIANT',
      })
    }
    if (seenGroups.has(rec.group.id)) {
      throw Object.assign(new Error('Duplicate variant group'), {
        code: 'INVALID_VARIANT',
      })
    }
    seenGroups.add(rec.group.id)
    resolvedOptionIds.push(id)
  }

  for (const group of groups) {
    if (seenGroups.has(group.id)) continue
    const fallback = defaultVariantOptionId(group)
    if (fallback) resolvedOptionIds.push(fallback)
  }

  /** @type {string[]} */
  const resolvedCustomIds = []
  for (const id of [...new Set((customizationIds ?? []).filter(Boolean))]) {
    if (!customById.has(id)) {
      throw Object.assign(new Error('Invalid customization'), {
        code: 'INVALID_CUSTOMIZATION',
      })
    }
    resolvedCustomIds.push(id)
  }

  return {
    unitPrice: computeUnitPriceFromItem(item, resolvedOptionIds, resolvedCustomIds),
    modifiersSnapshot: buildModifiersSnapshotFromItem(
      item,
      resolvedOptionIds,
      resolvedCustomIds,
    ),
    /** Resolved option ids after defaults (one per variant group). */
    variantOptionIds: resolvedOptionIds,
    /** Validated customization ids. */
    customizationIds: resolvedCustomIds,
  }
}
