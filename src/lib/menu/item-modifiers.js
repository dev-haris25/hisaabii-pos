import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/**
 * @param {unknown} item
 */
export function menuItemHasVariantGroups(item) {
  return Array.isArray(item?.variantGroups) && item.variantGroups.length > 0
}

/**
 * @param {unknown} item
 */
export function menuItemHasCustomizations(item) {
  return Array.isArray(item?.customizations) && item.customizations.length > 0
}

/**
 * @param {{ options?: Array<{ id?: string, isDefault?: boolean }> }} group
 */
export function defaultVariantOptionId(group) {
  const opts = Array.isArray(group?.options) ? group.options : []
  const marked = opts.find((o) => o.isDefault)
  return marked?.id ?? opts[0]?.id ?? null
}

/**
 * @param {{ variantGroups?: Array<{ id: string, options?: Array<{ id?: string, isDefault?: boolean }> }> }} item
 * @returns {Record<string, string>}
 */
export function defaultVariantSelection(item) {
  /** @type {Record<string, string>} */
  const sel = {}
  for (const group of item?.variantGroups ?? []) {
    const id = defaultVariantOptionId(group)
    if (id) sel[group.id] = id
  }
  return sel
}

/**
 * @param {Record<string, string>} selection
 */
export function optionIdsFromSelection(selection) {
  return Object.values(selection ?? {})
    .filter(Boolean)
    .slice()
    .sort()
}

/**
 * @param {string} menuItemId
 * @param {string[]} [optionIds]
 * @param {string[]} [customizationIds]
 */
export function cartLineKey(menuItemId, optionIds = [], customizationIds = []) {
  const o = [...optionIds].filter(Boolean).sort().join(',')
  const c = [...customizationIds].filter(Boolean).sort().join(',')
  return `${menuItemId}|v:${o}|c:${c}`
}

/**
 * @param {string} a
 * @param {string} b
 */
export function addMoneyStrings(a, b) {
  return decimalStringFromNumber(parseMoney(a) + parseMoney(b))
}

/**
 * @param {{ price?: string, variantGroups?: Array<{ options?: Array<{ id?: string, priceChange?: string }> }>, customizations?: Array<{ id?: string, priceChange?: string }> }} item
 * @param {string[]} optionIds
 * @param {string[]} customizationIds
 */
export function computeUnitPriceFromItem(item, optionIds = [], customizationIds = []) {
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
 * @param {{
 *   variantGroups?: Array<{
 *     nameAr: string
 *     nameEn?: string | null
 *     options?: Array<{
 *       id?: string
 *       nameAr: string
 *       nameEn?: string | null
 *       priceChange?: string
 *     }>
 *   }>
 *   customizations?: Array<{
 *     id?: string
 *     nameAr: string
 *     nameEn?: string | null
 *     priceChange?: string
 *   }>
 * }} item
 * @param {string[]} optionIds
 * @param {string[]} customizationIds
 */
export function buildModifiersSnapshotFromItem(
  item,
  optionIds = [],
  customizationIds = [],
) {
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
 * @param {unknown} raw
 * @returns {{
 *   variantOptions: Array<{
 *     groupNameAr: string
 *     groupNameEn: string | null
 *     optionNameAr: string
 *     optionNameEn: string | null
 *     priceChange: string
 *   }>
 *   customizations: Array<{
 *     nameAr: string
 *     nameEn: string | null
 *     priceChange: string
 *   }>
 * }}
 */
export function normalizeModifiersSnapshot(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {}
  const variantOptions = Array.isArray(obj.variantOptions)
    ? obj.variantOptions.map((row) => ({
        groupNameAr: String(row?.groupNameAr ?? ''),
        groupNameEn:
          row?.groupNameEn != null ? String(row.groupNameEn) : null,
        optionNameAr: String(row?.optionNameAr ?? ''),
        optionNameEn:
          row?.optionNameEn != null ? String(row.optionNameEn) : null,
        priceChange: String(row?.priceChange ?? '0'),
      }))
    : []
  const customizations = Array.isArray(obj.customizations)
    ? obj.customizations.map((row) => ({
        nameAr: String(row?.nameAr ?? ''),
        nameEn: row?.nameEn != null ? String(row.nameEn) : null,
        priceChange: String(row?.priceChange ?? '0'),
      }))
    : []
  return { variantOptions, customizations }
}

/**
 * @param {unknown} snapshot
 * @param {string} locale
 * @param {{ withGroupNames?: boolean }} [opts]
 * @returns {{ variantNames: string[], customizationNames: string[] }}
 */
export function modifierDisplayNames(snapshot, locale, opts = {}) {
  const snap = normalizeModifiersSnapshot(snapshot)
  const isAr = locale === 'ar'
  return {
    variantNames: snap.variantOptions
      .map((row) => {
        const option = isAr
          ? row.optionNameAr
          : row.optionNameEn?.trim() || row.optionNameAr
        if (!opts.withGroupNames) return option
        const group = isAr
          ? row.groupNameAr
          : row.groupNameEn?.trim() || row.groupNameAr
        if (group && option) return `${group}: ${option}`
        return option
      })
      .filter(Boolean),
    customizationNames: snap.customizations
      .map((row) => (isAr ? row.nameAr : row.nameEn?.trim() || row.nameAr))
      .filter(Boolean),
  }
}

/**
 * Extra receipt / kitchen lines: variants, customizations, then note.
 *
 * @param {unknown} snapshot
 * @param {string | null | undefined} lineNote
 * @param {string} locale
 * @param {{ noteLabel?: string, withGroupNames?: boolean }} [opts]
 */
export function formatLineModifierDetails(
  snapshot,
  lineNote,
  locale,
  opts = {},
) {
  const { variantNames, customizationNames } = modifierDisplayNames(
    snapshot,
    locale,
    { withGroupNames: opts.withGroupNames },
  )
  const details = [...variantNames, ...customizationNames]
  const note = String(lineNote ?? '').trim()
  if (note) {
    const label = opts.noteLabel ? `${opts.noteLabel}: ` : ''
    details.push(`${label}${note}`)
  }
  return details
}
