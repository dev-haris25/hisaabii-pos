'use client'

import { useLocale } from 'next-intl'

import { usePathname, useRouter } from '@/i18n/navigation'
import { applyDocumentLocale } from '@/components/document-locale-sync'

export function AuthLocaleToggle() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  function switchTo(next) {
    if (next === locale) return
    // usePathname() can briefly be null outside a ready Next tree — never
    // concatenate undefined into the href (yields "undefined…" paths).
    if (typeof pathname !== 'string' || !pathname) return
    // usePathname() has no query string — preserve ?step=… and other params (e.g. ?from=zatca)
    const query =
      typeof window !== 'undefined' ? window.location.search : ''
    applyDocumentLocale(next)
    // Client navigation only — avoid next/navigation refresh() which re-hits proxy and can
    // redirect to localhost or :PORT over HTTPS behind nginx (ERR_SSL_PROTOCOL_ERROR).
    router.replace(`${pathname}${query}`, { locale: next })
  }

  return (
    <div
      className="flex shrink-0 items-center rounded-full bg-hisabi-surface-container-low p-0.5 ring-1 ring-hisabi-outline-variant/30 md:p-1"
      role="group"
      aria-label="EN / AR"
    >
      <button
        type="button"
        onClick={() => switchTo('en')}
        className={
          locale === 'en'
            ? 'cursor-pointer rounded-full bg-hisabi-surface-container-lowest px-2 py-1 text-[11px] font-semibold leading-none text-hisabi-teal shadow-sm transition-all sm:px-3 sm:text-xs md:px-4 md:py-1.5 md:type-label-sm'
            : 'cursor-pointer rounded-full px-2 py-1 text-[11px] font-medium leading-none text-hisabi-outline transition-all hover:text-hisabi-teal sm:px-3 sm:text-xs md:px-4 md:py-1.5 md:type-label-sm'
        }
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => switchTo('ar')}
        className={
          locale === 'ar'
            ? 'cursor-pointer rounded-full bg-hisabi-surface-container-lowest px-2 py-1 text-[11px] font-semibold leading-none text-hisabi-teal shadow-sm transition-all sm:px-3 sm:text-xs md:px-4 md:py-1.5 md:type-label-sm'
            : 'cursor-pointer rounded-full px-2 py-1 text-[11px] font-medium leading-none text-hisabi-outline transition-all hover:text-hisabi-teal sm:px-3 sm:text-xs md:px-4 md:py-1.5 md:type-label-sm'
        }
      >
        AR
      </button>
    </div>
  )
}
