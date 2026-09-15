'use client'

import { formatLineModifierDetails, modifierDisplayNames } from '@/lib/menu/item-modifiers'

/**
 * Cart / edit line extras (variants, customizations, optional note).
 *
 * @param {{
 *   snapshot?: unknown
 *   lineNote?: string | null
 *   locale: string
 *   noteLabel?: string
 * }} props
 */
export function LineModifierSummary({
  snapshot,
  lineNote,
  locale,
  noteLabel,
}) {
  const details = formatLineModifierDetails(snapshot, lineNote, locale, {
    noteLabel,
  })
  if (details.length === 0) return null
  return (
    <p className="type-body-sm text-hisabi-on-surface-variant line-clamp-3">
      {details.join(' · ')}
    </p>
  )
}

/**
 * @param {unknown} snapshot
 * @param {string} locale
 */
export function lineHasModifierNames(snapshot, locale) {
  const names = modifierDisplayNames(snapshot, locale)
  return names.variantNames.length > 0 || names.customizationNames.length > 0
}
