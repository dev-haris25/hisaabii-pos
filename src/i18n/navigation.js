import { createNavigation } from 'next-intl/navigation'

import { routing } from './routing'

const nav = createNavigation(routing)

/**
 * next-intl v4 `redirect` / `permanentRedirect` expect `{ href: string, locale?: string }`,
 * not a bare path string.
 * @param {string | { href: string, locale?: string, forcePrefix?: boolean }} hrefOrArgs
 */
function asRedirectArgs(hrefOrArgs) {
  if (typeof hrefOrArgs === 'string') {
    return { href: hrefOrArgs }
  }
  return hrefOrArgs
}

export const { Link, usePathname, useRouter, getPathname } = nav

/** @param {string | { href: string, locale?: string }} hrefOrArgs */
export function redirect(hrefOrArgs, ...rest) {
  return nav.redirect(asRedirectArgs(hrefOrArgs), ...rest)
}

/** @param {string | { href: string, locale?: string }} hrefOrArgs */
export function permanentRedirect(hrefOrArgs, ...rest) {
  return nav.permanentRedirect(asRedirectArgs(hrefOrArgs), ...rest)
}
