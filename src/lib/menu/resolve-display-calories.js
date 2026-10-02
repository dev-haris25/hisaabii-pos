/**
 * Normalize optional calorie count (non-negative int) or null.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeCalories(value) {
  if (value == null || value === '') return null
  const n =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value).trim(), 10)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

/**
 * Calories shown for one variant option: option total if set, else item default.
 *
 * @param {unknown} optionCalories
 * @param {unknown} itemCalories
 * @returns {number | null}
 */
export function resolveOptionDisplayCalories(optionCalories, itemCalories) {
  const fromOption = normalizeCalories(optionCalories)
  if (fromOption != null) return fromOption
  return normalizeCalories(itemCalories)
}

/**
 * Calories for a configured line from selected options (group order),
 * else item default. Not a sum — first option with its own calories wins.
 *
 * @param {unknown} itemCalories
 * @param {Array<{ calories?: unknown } | null | undefined>} selectedOptions
 * @returns {number | null}
 */
export function resolveLineDisplayCalories(itemCalories, selectedOptions = []) {
  for (const opt of selectedOptions) {
    const fromOption = normalizeCalories(opt?.calories)
    if (fromOption != null) return fromOption
  }
  return normalizeCalories(itemCalories)
}

/**
 * Collect selected variant options from an item + option id list (group sort order).
 *
 * @param {{
 *   variantGroups?: Array<{
 *     sortOrder?: number
 *     options?: Array<{ id?: string, calories?: unknown, sortOrder?: number }>
 *   }>
 * } | null | undefined} item
 * @param {string[]} optionIds
 */
export function selectedVariantOptionsFromItem(item, optionIds = []) {
  const wanted = new Set((optionIds ?? []).filter(Boolean).map(String))
  if (wanted.size === 0) return []
  const groups = [...(item?.variantGroups ?? [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )
  /** @type {Array<Record<string, unknown>>} */
  const selected = []
  for (const group of groups) {
    const options = [...(group.options ?? [])].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    )
    for (const option of options) {
      if (option?.id && wanted.has(String(option.id))) {
        selected.push(option)
      }
    }
  }
  return selected
}
