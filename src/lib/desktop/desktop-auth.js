'use client'

import { AuthApiError, authGet, authPost } from '@/lib/api/auth-client'
import {
  getDesktopLocalApiBaseUrl,
  getHisabiDesktop,
  isDesktopOfflineReady,
  isHisabiDesktop,
} from '@/lib/desktop/hisabi-desktop'
import {
  clearOfflineSessionToken,
  getOfflineSessionToken,
  setOfflineSessionToken,
} from '@/lib/desktop/offline-session'

/**
 * @param {unknown} err
 */
export function isNetworkAuthFailure(err) {
  if (!(err instanceof AuthApiError)) {
    return (
      err instanceof TypeError ||
      (err &&
        typeof err === 'object' &&
        'message' in err &&
        /failed to fetch|network|load failed/i.test(String(err.message)))
    )
  }
  return (
    err.status === 0 ||
    err.code === 'SERVER_ERROR' ||
    err.status >= 500
  )
}

/**
 * Offline login against local SQLite (desktop only, after first sync).
 *
 * @param {{ email: string, password: string, remember?: boolean }} body
 */
export async function desktopOfflineLogin(body) {
  const desktop = getHisabiDesktop()
  if (!desktop?.offlineLogin) {
    throw new AuthApiError(503, 'OFFLINE_NOT_READY', 'Offline login unavailable')
  }
  const ready = await isDesktopOfflineReady()
  if (!ready) {
    throw new AuthApiError(503, 'OFFLINE_NOT_READY', 'Till sync required first')
  }

  const result = await desktop.offlineLogin(body)
  if (!result?.ok) {
    throw new AuthApiError(
      result?.status || 401,
      result?.code || 'INVALID_CREDENTIALS',
      result?.message,
    )
  }
  if (result.token) await setOfflineSessionToken(result.token)
  return result
}

/**
 * After successful cloud login, refresh password hash in local SQLite
 * and mint an offline session for connectivity drops.
 */
export async function refreshLocalUserAfterCloudLogin() {
  if (!isHisabiDesktop()) return
  const desktop = getHisabiDesktop()
  if (!desktop?.upsertLocalUser) return
  try {
    const data = await authGet('/sync/my-offline-credentials')
    if (data?.user) {
      await desktop.upsertLocalUser(data.user)
      if (desktop.mintOfflineSession && data.user.id) {
        const minted = await desktop.mintOfflineSession({
          userId: data.user.id,
          remember: true,
        })
        if (minted?.ok && minted.token) {
          await setOfflineSessionToken(minted.token)
        }
      }
    }
  } catch {
    /* optional while online */
  }
}

/**
 * Prefer cloud /me; if network fails and we have an offline token, use local.
 */
export async function authGetMePreferOffline() {
  try {
    return await authGet('/me')
  } catch (err) {
    if (!isHisabiDesktop() || !isNetworkAuthFailure(err)) throw err
    const token = await getOfflineSessionToken()
    if (!token) throw err
    const desktop = getHisabiDesktop()
    if (desktop?.offlineMe) {
      const result = await desktop.offlineMe(token)
      if (!result?.ok) {
        await clearOfflineSessionToken()
        throw new AuthApiError(401, 'UNAUTHORIZED', 'Not signed in')
      }
      return { ok: true, user: result.user }
    }
    const base = await getDesktopLocalApiBaseUrl()
    if (!base) throw err
    const res = await fetch(`${base}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      await clearOfflineSessionToken()
      throw new AuthApiError(
        res.status,
        typeof data.code === 'string' ? data.code : 'UNAUTHORIZED',
        typeof data.message === 'string' ? data.message : undefined,
      )
    }
    return data
  }
}

/**
 * Cloud login with automatic offline fallback on network failure.
 *
 * @param {{ email: string, password: string, remember?: boolean }} body
 */
export async function loginOnlineOrOffline(body) {
  try {
    const data = await authPost('/login', body)
    await clearOfflineSessionToken()
    await refreshLocalUserAfterCloudLogin()
    return { ...data, offline: false }
  } catch (err) {
    if (!isHisabiDesktop() || !isNetworkAuthFailure(err)) throw err
    const ready = await isDesktopOfflineReady()
    if (!ready) throw err
    return desktopOfflineLogin(body)
  }
}

/**
 * Clears cloud + offline sessions.
 */
export async function logoutOnlineOrOffline() {
  try {
    await authPost('/logout')
  } catch {
    /* network may be down */
  }
  const desktop = getHisabiDesktop()
  if (desktop?.offlineLogout) {
    try {
      await desktop.offlineLogout()
    } catch {
      /* ignore */
    }
  }
  await clearOfflineSessionToken()
}
