'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { usePathname, useRouter } from '@/i18n/navigation'

/**
 * @param {URLSearchParams} searchParams
 * @param {number} safePage
 */
function buildPageQueryString(searchParams, safePage) {
  const params = new URLSearchParams(searchParams.toString())
  if (safePage <= 1) {
    params.delete('page')
  } else {
    params.set('page', String(safePage))
  }
  return params.toString()
}

/**
 * Sync list page number with the `?page=` URL query param.
 *
 * @param {number} [defaultPage]
 */
export function useListPageFromUrl(defaultPage = 1) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const page = useMemo(() => {
    const raw = searchParams.get('page')
    if (!raw) return defaultPage
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : defaultPage
  }, [searchParams, defaultPage])

  const setPage = useCallback(
    (nextPage) => {
      const safePage = Math.max(1, nextPage)
      const nextQs = buildPageQueryString(searchParams, safePage)
      const currentQs = searchParams.toString()

      if (nextQs === currentQs) return

      router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router, searchParams],
  )

  const setPageRef = useRef(setPage)
  setPageRef.current = setPage

  /** Stable identity — avoids effect loops when searchParams updates. */
  const resetPage = useCallback(() => {
    setPageRef.current(1)
  }, [])

  return { page, setPage, resetPage }
}

/**
 * Reset to page 1 when list filters/search change — skips the initial mount.
 *
 * @param {() => void} resetPage
 * @param {React.DependencyList} deps
 */
export function useResetListPageOnChange(resetPage, deps) {
  const isMount = useRef(true)
  const resetPageRef = useRef(resetPage)
  resetPageRef.current = resetPage

  useEffect(() => {
    if (isMount.current) {
      isMount.current = false
      return
    }
    resetPageRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps supplied by caller
  }, deps)
}
