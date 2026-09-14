'use client'

import { useEffect } from 'react'

/** Fire window.print() when ?autoPrint=1 and the document has finished loading assets. */
export function usePrintAutoTrigger(ready) {
  useEffect(() => {
    if (!ready) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('autoPrint') !== '1') return
    window.print()
  }, [ready])
}
