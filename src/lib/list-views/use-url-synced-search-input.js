'use client'

import { useEffect, useRef, useState } from 'react'

import { useDebouncedValue } from '@/lib/list-views/use-debounced-value'

/**
 * Local search input synced to a URL `search` param without clobbering
 * characters typed while a debounced navigation is in flight.
 *
 * Root cause of dropped letters/spaces: resetting `searchInput` from the URL
 * whenever the server props update — that runs mid-typing after debounce.
 * We only adopt URL → input when the URL change was external (back/forward,
 * shared link, or another control that cleared/changed search).
 *
 * Debounce uses the raw input; trim only the value used for the query string
 * so trailing spaces stay visible while typing.
 *
 * @param {string} urlSearch Current `search` from the URL / server filters
 * @param {number} [delayMs]
 * @returns {{
 *   searchInput: string
 *   setSearchInput: import('react').Dispatch<import('react').SetStateAction<string>>
 *   debouncedSearch: string
 *   lastPushedSearch: import('react').MutableRefObject<string>
 * }}
 */
export function useUrlSyncedSearchInput(urlSearch, delayMs = 350) {
  const normalizedUrl = urlSearch ?? ''
  const [searchInput, setSearchInput] = useState(normalizedUrl)
  const lastPushedSearch = useRef(normalizedUrl)
  const debouncedRaw = useDebouncedValue(searchInput, delayMs)
  const debouncedSearch = debouncedRaw.trim()

  useEffect(() => {
    if (normalizedUrl === lastPushedSearch.current) return
    lastPushedSearch.current = normalizedUrl
    setSearchInput(normalizedUrl)
  }, [normalizedUrl])

  return {
    searchInput,
    setSearchInput,
    debouncedSearch,
    lastPushedSearch,
  }
}
