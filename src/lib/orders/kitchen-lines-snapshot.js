import { normalizeModifiersSnapshot } from '@/lib/menu/item-modifiers'

/**
 * @param {Array<{
 *   nameAr?: string | null
 *   nameEn?: string | null
 *   quantity?: number
 *   lineNote?: string | null
 *   modifiersSnapshot?: unknown
 * }>} lines
 */
export function kitchenLinesSnapshot(lines) {
  if (!Array.isArray(lines)) return []
  return lines
    .filter((l) => Number(l?.quantity) > 0)
    .map((l) => ({
      nameAr: String(l.nameAr ?? '').trim(),
      nameEn: l.nameEn != null ? String(l.nameEn).trim() : null,
      quantity: Number.parseInt(String(l.quantity), 10) || 0,
      lineNote: l.lineNote != null ? String(l.lineNote).trim() || null : null,
      modifiersSnapshot: normalizeModifiersSnapshot(l.modifiersSnapshot),
    }))
}
