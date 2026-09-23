'use client'

import { useEffect, useState } from 'react'

import { isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'

/**
 * SSR / first-paint safe desktop detection.
 *
 * `isHisabiDesktop()` is false on the server and true in Electron after preload,
 * so reading it during the first client render causes a hydration mismatch.
 * This hook always returns `false` until after mount, matching SSR HTML.
 *
 * @returns {boolean}
 */
export function useIsHisabiDesktop() {
  const [desktop, setDesktop] = useState(false)

  useEffect(() => {
    setDesktop(isHisabiDesktop())
  }, [])

  return desktop
}
