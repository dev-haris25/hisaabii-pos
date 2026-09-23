'use client'

/**
 * Cloud reachability for desktop offline rules.
 * Uses a real API probe — not navigator.onLine alone.
 */

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_INTERVAL_MS = 10_000

/**
 * @param {{ timeoutMs?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<boolean>}
 */
export async function probeCloudReachable(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) {
      clearTimeout(timer)
      return false
    }
    opts.signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const res = await fetch('/api/auth/sync/ping', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
}

export { DEFAULT_INTERVAL_MS as CLOUD_CONNECTIVITY_POLL_MS }
