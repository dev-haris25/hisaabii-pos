import { getPathname } from '@/i18n/navigation'

/**
 * Open a /print/* route in a new tab and trigger the browser print dialog.
 *
 * @param {string} locale App locale (`en` | `ar`)
 * @param {string} printPath Path without locale prefix, e.g. `/print/salary-slip/abc`
 */
export function openPrintDocument(locale, printPath) {
  const base = printPath.split('?')[0]
  const path = getPathname({
    locale,
    href: `${base}?autoPrint=1`,
  })
  window.open(
    `${window.location.origin}${path}`,
    '_blank',
    'noopener,noreferrer',
  )
}
