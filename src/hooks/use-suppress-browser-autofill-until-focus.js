'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Browsers often ignore `autocomplete="off"` and still show contact/address
 * suggestions on RTL or "second" name fields. Starting `readOnly` until the
 * user focuses the field avoids that without affecting controlled updates.
 *
 * @returns {{ readOnly: boolean, onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void }}
 */
export function useSuppressBrowserAutofillUntilFocus() {
  const unlockedRef = useRef(false)
  const [readOnly, setReadOnly] = useState(true)

  const onFocus = useCallback(
    (/** @type {React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>} */ e) => {
      if (unlockedRef.current) return
      unlockedRef.current = true
      const el = e.currentTarget
      el.readOnly = false
      setReadOnly(false)
      const len = el.value.length
      requestAnimationFrame(() => {
        try {
          el.setSelectionRange(len, len)
        } catch {
          // setSelectionRange not supported on some inputs
        }
      })
    },
    [],
  )

  return { readOnly, onFocus }
}
