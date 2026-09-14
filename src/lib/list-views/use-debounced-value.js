import { useEffect, useState } from 'react'

/**
 * @template T
 * @param {T} value
 * @param {number} [delayMs]
 * @returns {T}
 */
export function useDebouncedValue(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const tid = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(tid)
  }, [value, delayMs])

  return debounced
}
