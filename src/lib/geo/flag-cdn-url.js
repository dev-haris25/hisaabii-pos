/**
 * Small PNG on flagcdn (works in img tags everywhere; does not depend on API `flags.png`).
 * @param {string} alpha2 ISO 3166-1 alpha-2
 * @returns {string} HTTPS URL or '' if invalid
 */
export function flagCdnPngUrl(alpha2) {
  if (!alpha2 || typeof alpha2 !== 'string') return ''
  const u = alpha2.toUpperCase()
  if (u.length !== 2 || !/^[A-Z]{2}$/.test(u)) return ''
  return `https://flagcdn.com/w40/${u.toLowerCase()}.png`
}
