/**
 * Exact match or nested route under a submodule list path (Hisabi sidebar).
 * @param {string} pathname
 * @param {string} href
 */
export function isSidebarChildPathActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Pick the most specific matching child link for the current path.
 *
 * @param {string} pathname
 * @param {Array<{ href: string, isActive?: (pathname: string) => boolean }>} children
 * @returns {string | null}
 */
export function resolveActiveSidebarChildHref(pathname, children) {
  let activeHref = null
  let activeHrefLength = -1

  for (const child of children) {
    const matches = child.isActive
      ? child.isActive(pathname)
      : isSidebarChildPathActive(pathname, child.href)
    if (!matches) continue
    if (child.href.length > activeHrefLength) {
      activeHref = child.href
      activeHrefLength = child.href.length
    }
  }

  return activeHref
}
