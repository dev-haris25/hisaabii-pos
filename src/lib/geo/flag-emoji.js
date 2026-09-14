/** Regional-indicator pair for ISO 3166-1 alpha-2 (e.g. `SA` → 🇸🇦). */
export function flagEmojiFromAlpha2(cc) {
  if (!cc || typeof cc !== 'string') return ''
  const u = cc.toUpperCase()
  if (u.length !== 2 || !/^[A-Z]{2}$/.test(u)) return ''
  const base = 0x1f1e6
  return String.fromCodePoint(
    base + u.charCodeAt(0) - 65,
    base + u.charCodeAt(1) - 65,
  )
}
