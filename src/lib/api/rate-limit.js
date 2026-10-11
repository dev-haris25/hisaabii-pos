import { jsonError } from '@/lib/api/json-response'

const MINUTE = 60_000

/**
 * Every request limit in the app. `limit` requests per `windowMs` per key.
 * Keys: `ip`, `email`, `ip|email`, or a QR "table" (`slug|qrToken`) — guests
 * at one restaurant usually share one Wi-Fi IP, so the table is the main key.
 * A check whose key is null (client IP unknown, see `getClientIp`) is skipped.
 */
export const RATE_LIMITS = {
  // Sign-in routes
  loginIpEmail: { limit: 10, windowMs: 15 * MINUTE },
  loginIp: { limit: 60, windowMs: 15 * MINUTE },
  /** Failed sign-ins only (counted after a wrong password), any IP. */
  loginFailedEmail: { limit: 20, windowMs: 15 * MINUTE },
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

/** @param {string} bucket */
function bucketConfig(bucket) {
  const config = RATE_LIMITS[bucket]
  if (!config) throw new Error(`Unknown rate-limit bucket: ${bucket}`)
  return config
}

/** @param {{ resetAt: number }} entry @param {number} now */
function retryAfter(entry, now) {
  return Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
}

/**
 * Count one request against `bucket` + `key`.
 *
 * @param {keyof typeof RATE_LIMITS} bucket
 * @param {string} key
 * @returns {{ allowed: boolean, retryAfterSec: number }}
 */
export function hitRateLimit(bucket, key) {
  const config = bucketConfig(bucket)
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
    return { allowed: false, retryAfterSec: retryAfter(entry, now) }
  }
  return { allowed: true, retryAfterSec: 0 }
}

/**
 * Check `bucket` + `key` without counting: blocked once `limit` hits were
 * recorded in the current window. For "check first, count on failure"
 * limits (count with `hitRateLimit` after the failure).
 *
 * @param {keyof typeof RATE_LIMITS} bucket
 * @param {string} key
 * @returns {{ allowed: boolean, retryAfterSec: number }}
 */
export function peekRateLimit(bucket, key) {
  const config = bucketConfig(bucket)
  const now = clock()
  const entry = store.get(`${bucket}:${key}`)
  if (entry && entry.resetAt > now && entry.count >= config.limit) {
    return { allowed: false, retryAfterSec: retryAfter(entry, now) }
  }
  return { allowed: true, retryAfterSec: 0 }
}

let warnedBadHops = false

/**
 * Reverse proxies in front of the app that append to X-Forwarded-For
 * (`TRUSTED_PROXY_HOPS`, default 1; 0 = none).
 */
function trustedProxyHops() {
  const raw = String(process.env.TRUSTED_PROXY_HOPS ?? '').trim()
  if (raw === '') return 1
  if (!/^\d+$/.test(raw)) {
    if (!warnedBadHops) {
      warnedBadHops = true
      console.error(`TRUSTED_PROXY_HOPS must be a whole number, got "${raw}"; using 1`)
    }
    return 1
  }
  return Number(raw)
}

/**
 * Client IP for rate limits, or null when unknown. With N trusted proxies the
 * client is the N-th X-Forwarded-For entry from the right (the one written by
 * the outermost trusted proxy); entries left of it are client-supplied.
 * Unknown when N is 0, the header has fewer than N entries, or the entry is
 * empty. X-Real-IP is not used: whether a proxy set it can't be told from N.
 *
 * @param {Request} request
 * @returns {string | null}
 */
export function getClientIp(request) {
  const hops = trustedProxyHops()
  if (hops === 0) return null
  const forwarded = request.headers.get('x-forwarded-for')
  if (!forwarded) return null
  const entries = forwarded.split(',')
  if (entries.length < hops) return null
  return entries[entries.length - hops].trim() || null
}

/** @param {string | null | undefined} slug @param {string | null | undefined} qrToken */
export function qrTableKey(slug, qrToken) {
  return `${String(slug ?? '')}|${String(qrToken ?? '')}`
}

/**
 * Count the request against every `[bucket, key]` pair; if any is over its
 * limit, return the 429 response to send (else null). Call it before any
 * database write or email. Pairs with a null key (unknown client IP) are
 * skipped. `peek` pairs are only checked, not counted (see `peekRateLimit`).
 *
 * @param {Array<[keyof typeof RATE_LIMITS, string | null]>} checks
 * @param {{ peek?: Array<[keyof typeof RATE_LIMITS, string | null]> }} [opts]
 * @returns {Response | null}
 */
export function rateLimitResponse(checks, opts = {}) {
  let retryAfterSec = 0
  for (const [bucket, key] of checks) {
    if (key == null) continue
    const result = hitRateLimit(bucket, key)
    if (!result.allowed) retryAfterSec = Math.max(retryAfterSec, result.retryAfterSec)
  }
  for (const [bucket, key] of opts.peek ?? []) {
    if (key == null) continue
    const result = peekRateLimit(bucket, key)
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
