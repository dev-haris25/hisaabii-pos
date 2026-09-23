'use client'

/**
 * True when the page runs inside the Hisabi Electron till app.
 */
export function isHisabiDesktop() {
  if (typeof window === 'undefined') return false
  return Boolean(window.hisabiDesktop?.isDesktop)
}

export function getHisabiDesktop() {
  if (typeof window === 'undefined') return null
  return window.hisabiDesktop ?? null
}

/**
 * Local SQLite / local API status from Electron main (Step 2+).
 * Returns null outside desktop or if the bridge is unavailable.
 *
 * @returns {Promise<{
 *   ok: boolean
 *   localApiBaseUrl: string | null
 *   offlineReady: boolean
 *   pendingOutboxCount?: number
 *   schemaVersion?: number
 *   businessProfileId?: string | null
 *   pullCursor?: string | null
 * } | null>}
 */
export async function getDesktopLocalStatus() {
  const api = getHisabiDesktop()
  if (!api?.getLocalStatus) return null
  try {
    return await api.getLocalStatus()
  } catch {
    return null
  }
}

/**
 * @returns {Promise<string | null>}
 */
export async function getDesktopLocalApiBaseUrl() {
  const api = getHisabiDesktop()
  if (!api?.getLocalApiBaseUrl) return null
  try {
    const url = await api.getLocalApiBaseUrl()
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

/**
 * Prefer IPC status; `offlineReady` stays false until Step 3 full sync.
 *
 * @returns {Promise<boolean>}
 */
export async function isDesktopOfflineReady() {
  const status = await getDesktopLocalStatus()
  return Boolean(status?.ok && status.offlineReady)
}

/**
 * Windows CSID encryption probe (does not overwrite real secrets).
 * @returns {Promise<{
 *   ok: boolean
 *   encryptionAvailable: boolean
 *   roundTrip: boolean
 *   error?: string
 * } | null>}
 */
export async function desktopSafeStorageSelfTest() {
  const api = getHisabiDesktop()
  if (!api?.safeStorageSelfTest) return null
  try {
    return await api.safeStorageSelfTest()
  } catch {
    return null
  }
}
