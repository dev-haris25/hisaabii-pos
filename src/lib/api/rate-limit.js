import { jsonError } from '@/lib/api/json-response'

const MINUTE = 60_000

/**
 * Every request limit in the app. `limit` requests per `windowMs` per key.
 * Keys: `ip`, `email`, `ip|email`, or a QR "table" (`slug|qrToken`) — guests
 * at one restaurant usually share one Wi-Fi IP, so the table is the main key.
 */
export const RATE_LIMITS = {
  // Sign-in routes
  loginIpEmail: { limit: 10, windowMs: 15 * MINUTE },
  loginIp: { limit: 60, windowMs: 15 * MINUTE },
  registerIp: { limit: 5, windowMs: 60 * MINUTE },
  forgotPasswordEmail: { limit: 5, windowMs: 15 * MINUTE },
  forgotPasswordIp: { limit: 20, windowMs: 15 * MINUTE },
  resendRegisterOtpEmail: { limit: 3, windowMs: 10 * MINUTE },
  verifyRegisterOtpEmail: { limit: 10, windowMs: 15 * MINUTE },
  verifyResetOtpEmail: { limit: 10, windowMs: 15 * MINUTE },
  resetPasswordIp: { limit: 10, windowMs: 15 * MINUTE },
  invitationAcceptIp: { limit: 10, windowMs: 15 * MINUTE },
  // Public QR menu
  qrLoginLoyaltyTable: { limit: 5, windowMs: MINUTE },
  qrLoginLoyaltyIp: { limit: 30, windowMs: MINUTE },
  qrCallWaiterTable: { limit: 3, windowMs: MINUTE },
  qrAskForBillTable: { limit: 5, windowMs: MINUTE },
  qrSubmitTable: { limit: 6, windowMs: MINUTE },
  qrRoundEditTable: { limit: 30, windowMs: MINUTE },
  qrPastOrdersTable: { limit: 20, windowMs: MINUTE },
}

/** Upper bound on stored counters; expired ones are pruned first, then oldest. */
export const RATE_LIMIT_MAX_ENTRIES = 10_000
const PRUNE_EVERY_MS = MINUTE

/**
 * In-memory fixed-window counters (the app runs as one PM2 process).
 * Map order = insertion order, so the first entries are the oldest windows.
 * @type {Map<string, { count: number, resetAt: number }>}
 */
const store = new Map()
let lastPruneAt = 0
/** @type {() => number} */
let clock = () => Date.now()

/** Tests only: replace the clock (pass nothing to restore `Date.now`). */
export function setRateLimitClock(fn) {
  clock = typeof fn === 'function' ? fn : () => Date.now()
}

/** Tests only: forget every counter. */
export function resetRateLimits() {
  store.clear()
  lastPruneAt = 0
}

export function rateLimitEntryCount() {
  return store.size
}

/** @param {number} now */
function prune(now) {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
  // Still over the cap (many live keys): drop the oldest windows.
  if (store.size >= RATE_LIMIT_MAX_ENTRIES) {
    let excess = store.size - RATE_LIMIT_MAX_ENTRIES + 1
    for (const key of store.keys()) {
      if (excess-- <= 0) break
      store.delete(key)
    }
  }
  lastPruneAt = now
}

/**
 * Count one request against `bucket` + `key`.
 *
 * @param {keyof typeof RATE_LIMITS} bucket
 * @param {string} key
 * @returns {{ allowed: boolean, retryAfterSec: number }}
 */
export function hitRateLimit(bucket, key) {
  const config = RATE_LIMITS[bucket]
  if (!config) throw new Error(`Unknown rate-limit bucket: ${bucket}`)
  const now = clock()
  if (now - lastPruneAt >= PRUNE_EVERY_MS || store.size >= RATE_LIMIT_MAX_ENTRIES) {
    prune(now)
  }

  const id = `${bucket}:${key}`
  let entry = store.get(id)
  if (!entry || entry.resetAt <= now) {
    store.delete(id)
    entry = { count: 0, resetAt: now + config.windowMs }
    store.set(id, entry)
  }
  entry.count += 1
  if (entry.count > config.limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    }
  }
  return { allowed: true, retryAfterSec: 0 }
}

/**
 * Client IP: first x-forwarded-for entry, else x-real-ip, else "unknown".
 * @param {Request} request
 */
export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first
  const real = request.headers.get('x-real-ip')?.trim()
  return real || 'unknown'
}

/** @param {string | null | undefined} slug @param {string | null | undefined} qrToken */
export function qrTableKey(slug, qrToken) {
  return `${String(slug ?? '')}|${String(qrToken ?? '')}`
}

/**
 * Count the request against every `[bucket, key]` pair; if any is over its
 * limit, return the 429 response to send (else null). Call it before any
 * database write or email.
 *
 * @param {Array<[keyof typeof RATE_LIMITS, string]>} checks
 * @returns {Response | null}
 */
export function rateLimitResponse(checks) {
  let retryAfterSec = 0
  for (const [bucket, key] of checks) {
    const result = hitRateLimit(bucket, key)
    if (!result.allowed) retryAfterSec = Math.max(retryAfterSec, result.retryAfterSec)
  }
  if (retryAfterSec === 0) return null
  const res = jsonError(
    429,
    'RATE_LIMITED',
    'Too many attempts. Please wait a moment and try again.',
  )
  res.headers.set('Retry-After', String(retryAfterSec))
  return res
}
