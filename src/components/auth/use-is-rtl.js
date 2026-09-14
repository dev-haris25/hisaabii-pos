'use client'

import { useLocale } from 'next-intl'

export function useIsRtl() {
  const locale = useLocale()
  try {
    const dir = new Intl.Locale(locale).textInfo?.direction
    if (dir === 'rtl' || dir === 'ltr') return dir === 'rtl'
  } catch {
    /* ignore */
  }
  return /^ar/i.test(locale)
}
