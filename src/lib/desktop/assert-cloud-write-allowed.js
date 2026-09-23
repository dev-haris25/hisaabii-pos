'use client'

import { probeCloudReachable } from '@/lib/desktop/cloud-connectivity'
import { isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'
import { requestInternetRequiredModal } from '@/lib/desktop/internet-required-bus'
import { isOfflineWriteExemptPath } from '@/lib/desktop/offline-write-exempt'

/**
 * Block cloud mutations on desktop when the cloud API is unreachable.
 * Throws a plain error with `.code = 'INTERNET_REQUIRED'` (auth-client maps to AuthApiError).
 *
 * @param {string} path
 * @param {string} [method]
 */
export async function assertCloudWriteAllowed(path, method = 'POST') {
  if (!isHisabiDesktop()) return
  if (isOfflineWriteExemptPath(path, method)) return

  const online = await probeCloudReachable({ timeoutMs: 2500 })
  if (online) return

  requestInternetRequiredModal()
  const err = new Error('Making changes needs an internet connection')
  err.name = 'InternetRequiredError'
  err.code = 'INTERNET_REQUIRED'
  err.status = 503
  throw err
}

/**
 * @param {unknown} err
 */
export function isInternetRequiredError(err) {
  if (!err || typeof err !== 'object') return false
  return (
    /** @type {{ code?: string }} */ (err).code === 'INTERNET_REQUIRED'
  )
}
