/**
 * @param {Array<{
 *   nameAr?: string | null
 *   nameEn?: string | null
 *   quantity?: number
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
    }))
}
