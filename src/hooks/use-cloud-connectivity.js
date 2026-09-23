'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  CLOUD_CONNECTIVITY_POLL_MS,
  probeCloudReachable,
} from '@/lib/desktop/cloud-connectivity'
import { isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'

/**
 * Polls cloud API reachability. On non-desktop, assumes online (browser uses live APIs).
 *
 * @returns {{
 *   cloudOnline: boolean
 *   checking: boolean
 *   refresh: () => Promise<void>
 * }}
 */
export function useCloudConnectivity() {
  const desktop = isHisabiDesktop()
  const [cloudOnline, setCloudOnline] = useState(!desktop ? true : true)
  const [checking, setChecking] = useState(desktop)

  const refresh = useCallback(async () => {
    if (!desktop) {
      setCloudOnline(true)
      setChecking(false)
      return
    }
    setChecking(true)
    const ok = await probeCloudReachable()
    setCloudOnline(ok)
    setChecking(false)
  }, [desktop])

  useEffect(() => {
    if (!desktop) {
      setCloudOnline(true)
      setChecking(false)
      return undefined
    }

    let cancelled = false
    const controller = new AbortController()

    async function tick() {
      const ok = await probeCloudReachable({ signal: controller.signal })
      if (!cancelled) {
        setCloudOnline(ok)
        setChecking(false)
      }
    }

    void tick()
    const id = window.setInterval(() => {
      void tick()
    }, CLOUD_CONNECTIVITY_POLL_MS)

    const onOnline = () => {
      void tick()
    }
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(id)
      window.removeEventListener('online', onOnline)
    }
  }, [desktop])

  return { cloudOnline, checking, refresh }
}
