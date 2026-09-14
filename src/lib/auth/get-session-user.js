import {
  AUTH_USER_SELECT,
  buildAuthUserFromRowAsync,
} from '@/lib/auth/auth-user-json'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { verifySignedToken } from '@/lib/auth/token'
import { prisma } from '@/lib/prisma'
import { cookies, headers } from 'next/headers'

/**
 * @param {string | null | undefined} authorizationHeader
 * @returns {string | null}
 */
function userIdFromBearerHeader(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())
  if (!match) return null
  const payload = verifySignedToken(match[1].trim())
  return typeof payload?.sub === 'string' ? payload.sub : null
}

/**
 * Resolves the current user from Bearer token or session cookie.
 * @returns {Promise<(Awaited<ReturnType<typeof buildAuthUserFromRowAsync>> & { active: boolean }) | null>}
 */
export async function getSessionUser() {
  const hdrs = await headers()
  let userId = userIdFromBearerHeader(hdrs.get('authorization'))

  if (!userId) {
    const jar = await cookies()
    const raw = jar.get(SESSION_COOKIE)?.value
    const payload = raw ? verifySignedToken(raw) : null
    userId = typeof payload?.sub === 'string' ? payload.sub : null
  }

  if (!userId) return null

  const gate = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      emailVerified: true,
      active: true,
      passwordHash: true,
      email: true,
    },
  })
  if (!gate || gate.active !== true) return null
  if (!gate.email || !gate.passwordHash) return null
  if (gate.passwordHash === 'migrated:disabled') return null
  if (gate.emailVerified !== true) return null

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: AUTH_USER_SELECT,
  })
  if (!row) return null

  const user = await buildAuthUserFromRowAsync(row)
  return { ...user, active: true }
}
