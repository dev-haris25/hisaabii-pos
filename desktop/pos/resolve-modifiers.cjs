const { parseMoney, decimalStringFromNumber } = require('./money.cjs')

/**
 * @param {{ options?: Array<{ id?: string, isDefault?: boolean }> }} group
 */
function defaultVariantOptionId(group) {
  const opts = Array.isArray(group?.options) ? group.options : []
  const marked = opts.find((o) => o.isDefault)
  return marked?.id ?? opts[0]?.id ?? null
}

/**
 * @param {{ price?: string, variantGroups?: Array<{ options?: Array<{ id?: string, priceChange?: string }> }>, customizations?: Array<{ id?: string, priceChange?: string }> }} item
 * @param {string[]} optionIds
 * @param {string[]} customizationIds
 */
function computeUnitPriceFromItem(item, optionIds = [], customizationIds = []) {
  let total = parseMoney(item?.price)
  const wantedOptions = new Set(optionIds)
  const wantedCustoms = new Set(customizationIds)
  for (const group of item?.variantGroups ?? []) {
    for (const option of group.options ?? []) {
      if (option.id && wantedOptions.has(option.id)) {
        total += parseMoney(option.priceChange)
      }
    }
  }
  for (const custom of item?.customizations ?? []) {
    if (custom.id && wantedCustoms.has(custom.id)) {
      total += parseMoney(custom.priceChange)
    }
  }
  return decimalStringFromNumber(total)
}

/**
 * @param {unknown} item
 * @param {string[]} optionIds
 * @param {string[]} customizationIds
 */
function buildModifiersSnapshotFromItem(item, optionIds = [], customizationIds = []) {
  const wantedOptions = new Set(optionIds)
  const wantedCustoms = new Set(customizationIds)
  /** @type {Array<{ groupNameAr: string, groupNameEn: string | null, optionNameAr: string, optionNameEn: string | null, priceChange: string }>} */
  const variantOptions = []
  for (const group of item?.variantGroups ?? []) {
    for (const option of group.options ?? []) {
      if (!option.id || !wantedOptions.has(option.id)) continue
      variantOptions.push({
        groupNameAr: group.nameAr,
        groupNameEn: group.nameEn ?? null,
        optionNameAr: option.nameAr,
        optionNameEn: option.nameEn ?? null,
        priceChange: String(option.priceChange ?? '0'),
      })
    }
  }
  /** @type {Array<{ nameAr: string, nameEn: string | null, priceChange: string }>} */
  const customizations = []
  for (const custom of item?.customizations ?? []) {
    if (!custom.id || !wantedCustoms.has(custom.id)) continue
    customizations.push({
      nameAr: custom.nameAr,
      nameEn: custom.nameEn ?? null,
      priceChange: String(custom.priceChange ?? '0'),
    })
  }
  return { variantOptions, customizations }
}

/**
 * @param {unknown} item
 * @param {string[] | undefined | null} variantOptionIds
 * @param {string[] | undefined | null} customizationIds
 */
function resolveCheckoutModifiers(item, variantOptionIds, customizationIds) {
  const groups = item?.variantGroups ?? []
  /** @type {Map<string, { option: any, group: any }>} */
  const optionById = new Map()
  for (const group of groups) {
    for (const option of group.options ?? []) {
      optionById.set(option.id, { option, group })
    }
  }

  const customById = new Map(
    (item?.customizations ?? []).map((row) => [row.id, row]),
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
  }
}

module.exports = {
  resolveCheckoutModifiers,
  computeUnitPriceFromItem,
  buildModifiersSnapshotFromItem,
  defaultVariantOptionId,
}
