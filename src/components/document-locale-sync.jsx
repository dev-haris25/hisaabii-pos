'use client'

import { useLocale } from 'next-intl'
import { useLayoutEffect } from 'react'

/** @param {string} locale */
export function applyDocumentLocale(locale) {
  const rtl = locale === 'ar'
  document.documentElement.lang = locale
  document.documentElement.dir = rtl ? 'rtl' : 'ltr'
  document.body.dir = rtl ? 'rtl' : 'ltr'
  document.body.dataset.locale = locale
}

/**
 * Keeps <html lang dir> in sync on client navigations. Root layout is a Server
 * Component and may not re-render when only the locale segment changes.
 */
export function DocumentLocaleSync() {
  const locale = useLocale()

  useLayoutEffect(() => {
    applyDocumentLocale(locale)
  }, [locale])

  return null
}
