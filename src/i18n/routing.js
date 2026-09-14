import { defineRouting } from 'next-intl/routing'

/** Locale in URL (`/en/…`, `/ar/…`). */
export const routing = defineRouting({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'always',
})
