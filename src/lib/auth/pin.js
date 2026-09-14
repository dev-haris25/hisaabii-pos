import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Deterministic HMAC of a cashier PIN, keyed by AUTH_SECRET and namespaced so
 * this key is never reused for anything else. Used only for a fast, indexed
 * `Staff` lookup by (businessProfileId, pinLookupHash) — NOT for verification.
 *
 * Verification always re-checks the slow, salted `pinHash` (src/lib/auth/password.js)
 * after the row is found, so a leaked pinLookupHash alone cannot be used to log in
 * (it has no salt and is only as strong as the PIN's entropy, which is why it is
 * paired with the real scrypt hash for the actual auth check).
 *
 * @param {string} pin
 */
export function pinLookupHash(pin) {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret) {
    throw new Error('AUTH_SECRET is required to hash cashier PINs')
  }
  return createHmac('sha256', `pin-lookup:${secret}`).update(pin).digest('hex')
}

/**
 * Constant-time comparison of two lookup hashes (defensive — Prisma's equality
 * lookup already does this at the DB level, but keep this available for any
 * in-memory comparison path).
 * @param {string} a
 * @param {string} b
 */
export function pinLookupHashesEqual(a, b) {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
