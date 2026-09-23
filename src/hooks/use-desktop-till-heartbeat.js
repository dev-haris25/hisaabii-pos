'use client'

import { useEffect, useRef } from 'react'

import { authPost } from '@/lib/api/auth-client'
import {
  getHisabiDesktop,
  isHisabiDesktop,
} from '@/lib/desktop/hisabi-desktop'
import { probeCloudReachable } from '@/lib/desktop/cloud-connectivity'

/** Desktop heartbeat interval (~18s within 15–20s plan window). */
const HEARTBEAT_MS = 18_000

/**
 * While Electron till is online and bound, POST /sync/heartbeat with pending outbox count.
 * Mount inside DesktopFirstSyncGate after offlineReady.
 */
export function useDesktopTillHeartbeat(enabled) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!isHisabiDesktop()) return undefined

    let cancelled = false
    let timer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)

    async function tick() {
      if (cancelled || !enabledRef.current) return
      try {
        const online = await probeCloudReachable({ timeoutMs: 4000 })
        if (!online || cancelled || !enabledRef.current) return

        const desktop = getHisabiDesktop()
        const tillId = await desktop?.getTillId?.()
        if (!tillId) return

        let pendingUploadCount = 0
        try {
          const status = await desktop?.getLocalStatus?.()
          pendingUploadCount = Number(status?.pendingOutboxCount) || 0
        } catch {
          pendingUploadCount = 0
        }

        await authPost('/sync/heartbeat', {
          tillId,
          pendingUploadCount,
        })
      } catch {
        /* ignore — next tick retries */
      }
    }

    function schedule() {
      timer = setTimeout(async () => {
        await tick()
        if (!cancelled) schedule()
      }, HEARTBEAT_MS)
    }

    void tick()
    schedule()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])
}
