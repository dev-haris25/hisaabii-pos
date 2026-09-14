import crypto from 'node:crypto'

import { DUMMY_OTP } from '@/lib/auth/constants'
import { prisma } from '@/lib/prisma'

const OTP_LENGTH = 6
const OTP_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5

/** @returns {string} 6-digit numeric code */
export function generateOtpCode() {
  const max = 10 ** OTP_LENGTH
  const n = crypto.randomInt(0, max)
  return String(n).padStart(OTP_LENGTH, '0')
}

/** @param {string} code */
export function hashOtpCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

/**
 * Dev-only dummy OTP (`000000`). OTP screens are never skipped.
 * - register (email verify) → HISABI_DEV_AUTOVERIFY_LOGIN
 * - password_reset → HISABI_DEV_AUTOVERIFY_OTP
 * Ignored when NODE_ENV=production.
 *
 * @param {'register' | 'password_reset'} purpose
 * @param {string} code
 */
function isDevDummyOtpAllowed(purpose, code) {
  if (process.env.NODE_ENV === 'production' || code !== DUMMY_OTP) {
    return false
  }
  if (purpose === 'register') {
    return process.env.HISABI_DEV_AUTOVERIFY_LOGIN === 'true'
  }
  if (purpose === 'password_reset') {
    return process.env.HISABI_DEV_AUTOVERIFY_OTP === 'true'
  }
  return false
}

/**
 * @param {string} userId
 * @param {'register' | 'password_reset'} purpose
 */
export async function createOtpForUser(userId, purpose) {
  const code = generateOtpCode()
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000)

  await prisma.$transaction([
    prisma.otpCode.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.otpCode.create({
      data: { userId, purpose, codeHash: hashOtpCode(code), expiresAt },
    }),
  ])

  return code
}

/** @deprecated use createOtpForUser */
export const createOtpForStaff = createOtpForUser

/**
 * @param {string} userId
 * @param {'register' | 'password_reset'} purpose
 * @param {string} code
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'NOT_FOUND' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'MISMATCH' }>}
 */
export async function verifyOtpForUser(userId, purpose, code) {
  if (isDevDummyOtpAllowed(purpose, code)) {
    await prisma.otpCode.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    return { ok: true }
  }

  const row = await prisma.otpCode.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!row) return { ok: false, reason: 'NOT_FOUND' }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'EXPIRED' }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'TOO_MANY_ATTEMPTS' }

  if (hashOtpCode(code) !== row.codeHash) {
    await prisma.otpCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    })
    return { ok: false, reason: 'MISMATCH' }
  }

  await prisma.otpCode.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  })
  return { ok: true }
}

/** @deprecated use verifyOtpForUser */
export const verifyOtpForStaff = verifyOtpForUser
