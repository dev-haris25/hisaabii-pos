'use client'

import {
  getDesktopLocalApiBaseUrl,
  getHisabiDesktop,
} from '@/lib/desktop/hisabi-desktop'

/**
 * Local SQLite primary-till status (works when cloud is unreachable).
 *
 * @returns {Promise<{
 *   tillId: string | null
 *   isPrimary: boolean
 *   primaryPosTillId: string | null
 *   offlineReady: boolean
 * } | null>}
 */
export async function fetchLocalTillPrimaryStatus() {
  const tillId = await getHisabiDesktop()?.getTillId?.()
  const base = await getDesktopLocalApiBaseUrl()
  if (!base) return null
  try {
    const q =
      typeof tillId === 'string' && tillId
        ? `?tillId=${encodeURIComponent(tillId)}`
        : ''
    const res = await fetch(`${base}/v1/pos/till-primary${q}`, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      tillId:
        typeof data.tillId === 'string'
          ? data.tillId
          : typeof tillId === 'string'
            ? tillId
            : null,
      isPrimary: data.isPrimary === true,
      primaryPosTillId:
        typeof data.primaryPosTillId === 'string'
          ? data.primaryPosTillId
          : null,
      offlineReady: data.offlineReady === true,
    }
  } catch {
    return null
  }
}
