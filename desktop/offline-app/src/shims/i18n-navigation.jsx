import { createContext, useContext, useMemo } from 'react'

/**
 * Minimal hash-router shim for next-intl createNavigation APIs
 * used by POS / kitchen client components inside the offline shell.
 */

const NavContext = createContext({
  locale: 'en',
  setLocale: /** @type {(l: string) => void} */ (() => {}),
  path: '/pos',
  setPath: /** @type {(p: string) => void} */ (() => {}),
})

export function OfflineNavProvider({ locale, setLocale, path, setPath, children }) {
  const value = useMemo(
    () => ({ locale, setLocale, path, setPath }),
    [locale, setLocale, path, setPath],
  )
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useOfflineNav() {
  return useContext(NavContext)
}

export function usePathname() {
  return useOfflineNav().path
}

export function useRouter() {
  const { setPath, setLocale, path, locale } = useOfflineNav()
  return {
    push(href, opts) {
      if (opts?.locale) setLocale(opts.locale)
      setPath(typeof href === 'string' ? href : path)
    },
    replace(href, opts) {
      if (opts?.locale) setLocale(opts.locale)
      setPath(typeof href === 'string' ? href : path)
    },
    refresh() {
      /* no-op in offline shell */
    },
    back() {
      setPath('/pos')
    },
    prefetch() {
      return Promise.resolve()
    },
  }
}

export function Link({ href, children, className, ...rest }) {
  const { setPath } = useOfflineNav()
  const to = typeof href === 'string' ? href : '/'
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        if (to === '/' || to.startsWith('/login')) {
          setPath('/pos')
          return
        }
        setPath(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

export function redirect() {
  /* no-op */
}

export function permanentRedirect() {
  /* no-op */
}

export function getPathname() {
  return '/pos'
}
