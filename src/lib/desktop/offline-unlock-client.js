'use client'

import { AuthApiError } from '@/lib/api/auth-client'
import {
  getDesktopLocalApiBaseUrl,
  getHisabiDesktop,
} from '@/lib/desktop/hisabi-desktop'
import {
  getOfflineSessionToken,
  setOfflineSessionToken,
} from '@/lib/desktop/offline-session'
import { useAuthStore } from '@/stores/auth-store'

/**
 * @returns {Promise<{ unlocked: boolean, offlineReady: boolean }>}
 */
export async function fetchOfflineCheckoutUnlockStatus() {
  const desktop = getHisabiDesktop()
  if (desktop?.getOfflineCheckoutUnlock) {
    try {
      const res = await desktop.getOfflineCheckoutUnlock()
      if (res?.ok !== false) {
        return {
          unlocked: Boolean(res?.unlocked),
          offlineReady: Boolean(res?.offlineReady),
        }
      }
    } catch {
      /* fall through */
    }
  }

  const base = await getDesktopLocalApiBaseUrl()
  if (!base) return { unlocked: false, offlineReady: false }
  try {
    const res = await fetch(`${base}/v1/pos/offline-unlock`, {
      cache: 'no-store',
    })
    const data = await res.json()
    return {
      unlocked: Boolean(data?.unlocked),
      offlineReady: Boolean(data?.offlineReady),
    }
  } catch {
    return { unlocked: false, offlineReady: false }
  }
}

/**
 * Ensure a local offline session token exists (needed for local-api auth).
 */
async function ensureOfflineToken() {
  let token = await getOfflineSessionToken()
  if (token) return token

  const desktop = getHisabiDesktop()
  const user = useAuthStore.getState().user
  if (!desktop?.mintOfflineSession || !user?.id) return null

  try {
    const minted = await desktop.mintOfflineSession({
      userId: user.id,
      remember: true,
    })
    if (minted?.ok && minted.token) {
      await setOfflineSessionToken(minted.token)
      return minted.token
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Admin unlock for this outage — always goes through local API so
 * role checks (admin/owner) are enforced with the bearer session.
 * @returns {Promise<{ ok: boolean, unlocked?: boolean, code?: string, message?: string }>}
 */
export async function unlockOfflineCheckoutMode() {
  const base = await getDesktopLocalApiBaseUrl()
  if (!base) {
    throw new AuthApiError(503, 'LOCAL_API_UNAVAILABLE', 'Local API unavailable')
  }
  const token = await ensureOfflineToken()
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${base}/v1/pos/offline-unlock`, {
    method: 'POST',
    headers,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new AuthApiError(
      res.status || 500,
      typeof data.code === 'string' ? data.code : 'UNLOCK_FAILED',
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  return data
}
