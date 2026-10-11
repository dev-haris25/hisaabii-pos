import { NextResponse } from 'next/server'

import {
  attachSessionCookie,
  createSessionAccessToken,
} from '@/lib/auth/attach-session-cookie'
import {
  AUTH_USER_SELECT,
  buildAuthUserFromRowAsync,
} from '@/lib/auth/auth-user-json'
import {
  SESSION_MAX_AGE_DEFAULT,
  SESSION_MAX_AGE_REMEMBER,
} from '@/lib/auth/constants'
import { verifyPassword } from '@/lib/auth/password'
import { loginBodySchema } from '@/lib/auth/schemas'
import { handleRouteError } from '@/lib/api/route-error'
import { jsonError } from '@/lib/api/json-response'
import { getClientIp, rateLimitResponse } from '@/lib/api/rate-limit'
import { prisma } from '@/lib/prisma'

export async function POST(request) {
  try {
    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = loginBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
    }

    const { email, password, remember } = parsed.data
    const emailNorm = email.toLowerCase()
    const ip = getClientIp(request)
    const limited = rateLimitResponse([
      ['loginIpEmail', `${ip}|${emailNorm}`],
      ['loginIp', ip],
    ])
    if (limited) return limited

    const creds = await prisma.user.findUnique({
      where: { email: emailNorm },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        active: true,
      },
    })
    if (
      !creds ||
      !creds.passwordHash ||
      creds.passwordHash === 'migrated:disabled' ||
      !verifyPassword(password, creds.passwordHash)
    ) {
      return jsonError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
    }
    if (!creds.active) {
      return jsonError(403, 'ACCOUNT_DISABLED', 'Account is disabled')
    }

    const verifiedRow = await prisma.user.findUnique({
      where: { id: creds.id },
      select: { emailVerified: true },
    })

    if (verifiedRow?.emailVerified !== true) {
      return jsonError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email first')
    }

    const maxAge = remember ? SESSION_MAX_AGE_REMEMBER : SESSION_MAX_AGE_DEFAULT

    const row = await prisma.user.findUnique({
      where: { id: creds.id },
      select: AUTH_USER_SELECT,
    })
    if (!row) {
      return jsonError(500, 'SERVER_ERROR', 'User not found')
    }

    const user = await buildAuthUserFromRowAsync(row)
    const token = createSessionAccessToken(creds.id, maxAge)
    const res = NextResponse.json({ ok: true, user, token })
    attachSessionCookie(res, creds.id, maxAge, token)
    return res
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/login')
  }
}
