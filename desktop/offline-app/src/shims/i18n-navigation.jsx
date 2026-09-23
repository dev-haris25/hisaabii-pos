import { createContext, useContext, useMemo, useRef } from 'react'

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
  // Keep the latest nav state in a ref so the returned router object has a
  // STABLE identity across renders (matching real Next.js `useRouter()`
  // semantics). Returning a fresh object literal every call — as this used
  // to do — makes any `useEffect([..., router])` re-fire on every render,
  // which combined with setState calls inside the effect causes an infinite
  // render loop (React error #185 / "Maximum update depth exceeded").
  const stateRef = useRef({ setPath, setLocale, path, locale })
  stateRef.current = { setPath, setLocale, path, locale }

  const routerRef = useRef(
    /** @type {ReturnType<typeof useRouter> | null} */ (null),
  )
  if (!routerRef.current) {
    routerRef.current = {
      push(href, opts) {
        const { setLocale: setL, setPath: setP, path: p } = stateRef.current
        if (opts?.locale) setL(opts.locale)
        setP(typeof href === 'string' ? href : p)
      },
      replace(href, opts) {
        const { setLocale: setL, setPath: setP, path: p } = stateRef.current
        if (opts?.locale) setL(opts.locale)
        setP(typeof href === 'string' ? href : p)
      },
      refresh() {
        /* no-op in offline shell */
      },
      back() {
        stateRef.current.setPath('/pos')
      },
      prefetch() {
        return Promise.resolve()
      },
    }
  }
  return routerRef.current
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
