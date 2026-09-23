'use client'

import { getHisabiDesktop } from '@/lib/desktop/hisabi-desktop'

const OFFLINE_TOKEN_KEY = 'hisabi_pos_offline_token'

/**
 * @returns {Promise<string | null>}
 */
export async function getOfflineSessionToken() {
  const desktop = getHisabiDesktop()
  if (desktop?.getOfflineSessionToken) {
    try {
      const t = await desktop.getOfflineSessionToken()
      if (typeof t === 'string' && t.trim()) return t.trim()
    } catch {
      /* fall through */
    }
  }
  if (typeof window === 'undefined') return null
  try {
    const v = window.sessionStorage.getItem(OFFLINE_TOKEN_KEY)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

/**
 * Sync helper for callers that already have a token string from IPC login.
 * @returns {string | null}
 */
export function getOfflineSessionTokenSync() {
  if (typeof window === 'undefined') return null
  try {
    const v = window.sessionStorage.getItem(OFFLINE_TOKEN_KEY)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

/**
 * @param {string | null | undefined} token
 */
export async function setOfflineSessionToken(token) {
  const desktop = getHisabiDesktop()
  if (desktop?.setOfflineSessionToken) {
    try {
      await desktop.setOfflineSessionToken(token ?? null)
    } catch {
      /* ignore */
    }
  }
  if (typeof window === 'undefined') return
  try {
    if (token && String(token).trim()) {
      window.sessionStorage.setItem(OFFLINE_TOKEN_KEY, String(token).trim())
    } else {
      window.sessionStorage.removeItem(OFFLINE_TOKEN_KEY)
    }
  } catch {
    /* ignore */
  }
}

export async function clearOfflineSessionToken() {
  await setOfflineSessionToken(null)
}
