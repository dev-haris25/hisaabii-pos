/**
 * Primary list/trigger label: English locale prefers EN name, Arabic prefers AR.
 *
 * @param {{ companyNameAr: string, companyNameEn?: string | null }} profile
 * @param {string} locale next-intl locale (e.g. `en`, `ar`)
 * @returns {string}
 */
export function companyDisplayNameForLocale(profile, locale) {
  const ar = (profile.companyNameAr ?? '').trim()
  const en = (profile.companyNameEn ?? '').trim()
  if (locale === 'ar') {
    return ar || en || ''
  }
  return en || ar || ''
}
