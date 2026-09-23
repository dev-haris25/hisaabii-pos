'use client'

import { useEffect, useRef } from 'react'

import { probeCloudReachable } from '@/lib/desktop/cloud-connectivity'
import {
  getHisabiDesktop,
  isHisabiDesktop,
} from '@/lib/desktop/hisabi-desktop'
import {
  runDesktopIncrementalSync,
  runDesktopOutboxPush,
} from '@/lib/desktop/run-desktop-sync'

/** Outbox push safety-net while online. */
const OUTBOX_PUSH_MS = 45_000
/** Incremental pull (menu/stock/ZATCA tip) while online. */
const INCREMENTAL_PULL_MS = 3 * 60_000

/**
 * Silent background sync while Electron till is online and logged in.
 * - Push outbox immediately on reconnect + every ~45s
 * - Incremental pull every ~3 minutes
 *
 * Mount inside DesktopFirstSyncGate after offlineReady.
 *
 * @param {boolean} enabled
 */
export function useDesktopBackgroundSync(enabled) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const wasOnlineRef = useRef(/** @type {boolean | null} */ (null))
  const pushBusyRef = useRef(false)
  const pullBusyRef = useRef(false)

  useEffect(() => {
    if (!isHisabiDesktop()) return undefined

    let cancelled = false
    /** @type {ReturnType<typeof setTimeout> | null} */
    let pushTimer = null
    /** @type {ReturnType<typeof setTimeout> | null} */
    let pullTimer = null
    /** @type {ReturnType<typeof setInterval> | null} */
    let probeTimer = null

    async function pushOnce() {
      if (cancelled || !enabledRef.current || pushBusyRef.current) return
      pushBusyRef.current = true
      try {
        const online = await probeCloudReachable({ timeoutMs: 4000 })
        if (!online || cancelled || !enabledRef.current) return
        await runDesktopOutboxPush()
      } catch {
        /* silent — next tick retries */
      } finally {
        pushBusyRef.current = false
      }
    }

    async function pullOnce() {
      if (cancelled || !enabledRef.current || pullBusyRef.current) return
      pullBusyRef.current = true
      try {
        const online = await probeCloudReachable({ timeoutMs: 4000 })
        if (!online || cancelled || !enabledRef.current) return
        if (!getHisabiDesktop()?.finalizeIncrementalSync) return
        await runDesktopIncrementalSync()
      } catch {
        /* silent */
      } finally {
        pullBusyRef.current = false
      }
    }

    async function onConnectivityTick() {
      if (cancelled || !enabledRef.current) return
      const online = await probeCloudReachable({ timeoutMs: 4000 })
      if (cancelled) return
      const wasOnline = wasOnlineRef.current
      wasOnlineRef.current = online
      if (online && wasOnline === false) {
        // Reconnect: push immediately, then refresh local cache
        void pushOnce().then(() => pullOnce())
      }
    }

    function schedulePush() {
      pushTimer = setTimeout(async () => {
        await pushOnce()
        if (!cancelled) schedulePush()
      }, OUTBOX_PUSH_MS)
    }

    function schedulePull() {
      pullTimer = setTimeout(async () => {
        await pullOnce()
        if (!cancelled) schedulePull()
      }, INCREMENTAL_PULL_MS)
    }

    void onConnectivityTick()
    probeTimer = setInterval(() => {
      void onConnectivityTick()
    }, 10_000)

    schedulePush()
    schedulePull()

    return () => {
      cancelled = true
      if (pushTimer) clearTimeout(pushTimer)
      if (pullTimer) clearTimeout(pullTimer)
      if (probeTimer) clearInterval(probeTimer)
    }
  }, [])
}
