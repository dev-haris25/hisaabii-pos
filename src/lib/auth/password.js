import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEYLEN = 64

/**
 * Salted scrypt hash — used for both ADMIN passwordHash and CASHIER pinHash
 * (rules.md #15: PINs are hashed at rest, never stored plain, same as a password).
 * @param {string} password
 */
export function hashPassword(password) {
  const salt = randomBytes(16)
  const key = scryptSync(password, salt, KEYLEN)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

/**
 * @param {string} password
 * @param {string} stored
 */
export function verifyPassword(password, stored) {
  const idx = stored.indexOf(':')
  if (idx === -1) return false
  const salt = Buffer.from(stored.slice(0, idx), 'hex')
  const expected = Buffer.from(stored.slice(idx + 1), 'hex')
  if (salt.length === 0 || expected.length === 0) return false
  const key = scryptSync(password, salt, KEYLEN)
  if (key.length !== expected.length) return false
  return timingSafeEqual(key, expected)
}
