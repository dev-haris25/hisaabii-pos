'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AppLoader } from '@/components/app-loader'
import { AuthApiError } from '@/lib/api/auth-client'
import { getDesktopLocalStatus } from '@/lib/desktop/hisabi-desktop'
import {
  runDesktopFullSync,
  runDesktopIncrementalSync,
} from '@/lib/desktop/run-desktop-sync'
import { useDesktopTillHeartbeat } from '@/hooks/use-desktop-till-heartbeat'
import { useIsHisabiDesktop } from '@/hooks/use-is-hisabi-desktop'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Blocks interaction until first full sync completes (offlineReady).
 * Always keeps `children` mounted so Electron does not abort in-flight Next.js
 * RSC prefetches (that crash React with "Connection closed" / Next global error).
 */
export function DesktopFirstSyncGate({ children }) {
  const t = useTranslations('AppShell')
  const user = useAuthStore((s) => s.user)
  const activeBusinessProfileId = user?.activeBusinessProfileId ?? null
  // Must stay false until after mount so SSR HTML matches Electron hydrate.
  const desktop = useIsHisabiDesktop()
  const [ready, setReady] = useState(true)
  const [percent, setPercent] = useState(0)
  const [phase, setPhase] = useState('')
  const [error, setError] = useState(/** @type {string | null} */ (null))
  const [busy, setBusy] = useState(false)
  const lastSyncedProfileRef = useRef(/** @type {string | null} */ (null))

  useDesktopTillHeartbeat(desktop && ready && Boolean(user))

  const runSync = useCallback(async () => {
    if (!desktop) {
      setReady(true)
      return
    }
    if (!user) {
      setReady(false)
      return
    }
    setBusy(true)
    setError(null)
    setReady(false)
    try {
      const status = await getDesktopLocalStatus()
      const localBiz =
        typeof status?.businessProfileId === 'string'
          ? status.businessProfileId
          : null
      const profileMismatch =
        Boolean(activeBusinessProfileId) &&
        Boolean(localBiz) &&
        localBiz !== activeBusinessProfileId

      if (status?.ok && status.offlineReady && !profileMismatch) {
        setReady(true)
        lastSyncedProfileRef.current = localBiz
        try {
          await runDesktopIncrementalSync((p) => {
            setPercent(p.percent)
            setPhase(p.phase)
          })
        } catch {
          /* incremental soft-fail; local cache still usable */
        }
        return
      }

      const result = await runDesktopFullSync((p) => {
        setPercent(p.percent)
        setPhase(p.phase)
      })
      lastSyncedProfileRef.current = result.businessProfileId
      setReady(true)
    } catch (err) {
      const code = err instanceof AuthApiError ? err.code : null
      setError(
        code === 'UNAUTHORIZED'
          ? t('desktopSyncNeedLogin')
          : t('desktopSyncFailed'),
      )
      setReady(false)
    } finally {
      setBusy(false)
    }
  }, [desktop, user, activeBusinessProfileId, t])

  useEffect(() => {
    if (!desktop) {
      setReady(true)
      return
    }
    if (!user) {
      setReady(false)
      return
    }
    setReady(false)
    void runSync()
  }, [desktop, user, activeBusinessProfileId, runSync])

  const showGate = desktop && (!user || !ready)

  return (
    <>
      {children}
      {showGate ? (
        <div
          className="bg-hisabi-surface fixed inset-0 z-[200] flex flex-col items-center justify-center gap-hisabi-lg px-hisabi-lg py-hisabi-xxl"
          role="status"
          aria-live="polite"
        >
          <AppLoader />
          <div className="w-full max-w-md text-center">
            <h1 className="type-headline-md font-bold text-hisabi-primary">
              {t('desktopSyncTitle')}
            </h1>
            <p className="type-body-md text-hisabi-on-surface-variant mt-hisabi-sm">
              {!user
                ? t('desktopSyncBody', { percent: 0 })
                : error
                  ? error
                  : t('desktopSyncBody', {
                      percent: Math.max(0, Math.min(100, percent)),
                    })}
            </p>
            {user && !error ? (
              <div
                className="bg-hisabi-surface-container mt-hisabi-md h-2 w-full overflow-hidden rounded-full"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.max(0, Math.min(100, percent))}
              >
                <div
                  className="bg-hisabi-primary h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.max(4, Math.min(100, percent))}%`,
                  }}
                />
              </div>
            ) : null}
            {user && !error && phase ? (
              <p className="type-body-sm text-hisabi-on-surface-variant mt-hisabi-xs">
                {t('desktopSyncPhase', { phase })}
              </p>
            ) : null}
            {user && error ? (
              <button
                type="button"
                className="bg-hisabi-primary text-hisabi-on-primary type-label-md mt-hisabi-lg rounded-lg px-hisabi-lg py-hisabi-sm font-bold disabled:opacity-60"
                disabled={busy}
                onClick={() => {
                  void runSync()
                }}
              >
                {t('desktopSyncRetry')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
