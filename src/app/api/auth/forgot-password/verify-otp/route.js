import { NextResponse } from 'next/server'

import { PWD_RESET_COOKIE, PWD_RESET_MAX_AGE } from '@/lib/auth/constants'
import { verifyOtpForStaff } from '@/lib/auth/otp'
import { signPayload } from '@/lib/auth/token'
import { verifyOtpBodySchema } from '@/lib/auth/schemas'
import { jsonError } from '@/lib/api/json-response'
import { rateLimitResponse } from '@/lib/api/rate-limit'
import { prisma } from '@/lib/prisma'

export async function POST(request) {
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

  const { email, otp } = parsed.data
  const emailNorm = email.toLowerCase()
  const limited = rateLimitResponse([
    ['verifyResetOtpEmail', emailNorm],
  ])
  if (limited) return limited

  const staff = await prisma.user.findUnique({ where: { email: emailNorm } })
  if (!staff) {
    return jsonError(400, 'RESET_NOT_ALLOWED', 'Reset session invalid')
  }

  const result = await verifyOtpForStaff(staff.id, 'password_reset', otp)
  if (!result.ok) {
    if (result.reason === 'TOO_MANY_ATTEMPTS') {
      return jsonError(400, 'TOO_MANY_ATTEMPTS', 'Too many invalid attempts')
    }
    if (result.reason === 'EXPIRED') {
      return jsonError(400, 'INVALID_OTP', 'Code expired')
    }
    return jsonError(400, 'INVALID_OTP', 'Invalid code')
  }

  const exp = Math.floor(Date.now() / 1000) + PWD_RESET_MAX_AGE
  const resetToken = signPayload({ email: emailNorm, exp })

  const out = NextResponse.json({ ok: true, resetToken })
  out.cookies.set(PWD_RESET_COOKIE, resetToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: PWD_RESET_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  })
  return out
}
