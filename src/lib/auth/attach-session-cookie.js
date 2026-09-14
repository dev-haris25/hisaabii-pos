import { SESSION_COOKIE } from '@/lib/auth/constants'
import { signPayload } from '@/lib/auth/token'

/**
 * @param {string} staffId
 * @param {number} maxAgeSeconds
 */
export function createSessionAccessToken(staffId, maxAgeSeconds) {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds
  return signPayload({ sub: staffId, exp })
}

/**
 * @param {import('next/server').NextResponse} res
 * @param {string} staffId
 * @param {number} maxAgeSeconds
 * @param {string} [precomputedToken]
 */
export function attachSessionCookie(res, staffId, maxAgeSeconds, precomputedToken) {
  const token =
    typeof precomputedToken === 'string' && precomputedToken
      ? precomputedToken
      : createSessionAccessToken(staffId, maxAgeSeconds)
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
    secure: process.env.NODE_ENV === 'production',
  })
  return token
}

/** @param {import('next/server').NextResponse} res */
export function clearSessionCookie(res) {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  })
}
