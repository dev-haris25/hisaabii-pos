/** Letters commonly used in Arabic script (MSA + presentation forms). */
const ARABIC_LETTER =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g

/**
 * When the model ignores instructions and returns bullets / English / options,
 * take the longest contiguous Arabic phrase so the UI field stays clean.
 *
 * @param {string} raw
 * @returns {string}
 */
export function extractArabicInvoiceLine(raw) {
  const s = raw.trim()
  if (!s) return s

  const arabicLetters = (s.match(ARABIC_LETTER) || []).length
  const latinLetters = (s.match(/[A-Za-z]/g) || []).length
  const letterTotal = arabicLetters + latinLetters

  const looksLikePlainArabicLine =
    letterTotal > 0 &&
    arabicLetters / letterTotal >= 0.92 &&
    !/[*•]|```|\bOption\s+\d+\b/i.test(s) &&
    !/\n/.test(s)

  if (looksLikePlainArabicLine) {
    return s.replace(/\s+/g, ' ').trim()
  }

  /** Runs of Arabic words (allow Arabic punctuation at end). */
  const chunks =
    s.match(
      /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*(?:\s*[،؛؟])?/g,
    ) ?? []

  if (!chunks.length) {
    return s.replace(/\s+/g, ' ').trim()
  }

  chunks.sort(
    (a, b) => b.replace(/\s/g, '').length - a.replace(/\s/g, '').length,
  )
  return chunks[0].replace(/\s+/g, ' ').trim()
}
