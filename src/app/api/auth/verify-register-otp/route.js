import { NextResponse } from 'next/server'

import {
  attachSessionCookie,
  createSessionAccessToken,
} from '@/lib/auth/attach-session-cookie'
import {
  AUTH_USER_SELECT,
  buildAuthUserFromRowAsync,
} from '@/lib/auth/auth-user-json'
import { SESSION_MAX_AGE_DEFAULT } from '@/lib/auth/constants'
import { verifyOtpForStaff } from '@/lib/auth/otp'
import { verifyOtpBodySchema } from '@/lib/auth/schemas'
import { handleRouteError } from '@/lib/api/route-error'
import { jsonError } from '@/lib/api/json-response'
import { prisma } from '@/lib/prisma'

export async function POST(request) {
  try {
    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = verifyOtpBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
    }

    const emailNorm = parsed.data.email.toLowerCase()
    const staff = await prisma.user.findUnique({
      where: { email: emailNorm },
      select: { id: true, emailVerified: true },
    })
    if (!staff) {
      return jsonError(400, 'INVALID_OTP', 'Invalid or expired code')
    }
    if (staff.emailVerified) {
      return jsonError(400, 'ALREADY_VERIFIED', 'Email already verified')
    }

    const result = await verifyOtpForStaff(staff.id, 'register', parsed.data.otp)
    if (!result.ok) {
      return jsonError(400, 'INVALID_OTP', 'Invalid or expired code')
    }

    await prisma.user.update({
      where: { id: staff.id },
      data: { emailVerified: true },
    })

    const row = await prisma.user.findUnique({
      where: { id: staff.id },
      select: AUTH_USER_SELECT,
    })
    if (!row) {
      return jsonError(500, 'SERVER_ERROR', 'User not found')
    }

    const user = await buildAuthUserFromRowAsync(row)
    const maxAge = SESSION_MAX_AGE_DEFAULT
    const token = createSessionAccessToken(staff.id, maxAge)
    const res = NextResponse.json({ ok: true, user, token })
    attachSessionCookie(res, staff.id, maxAge, token)
    return res
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/verify-register-otp')
  }
}
