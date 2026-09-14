import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { PWD_RESET_COOKIE } from '@/lib/auth/constants'
import { hashPassword } from '@/lib/auth/password'
import { verifySignedToken } from '@/lib/auth/token'
import { resetPasswordBodySchema } from '@/lib/auth/schemas'
import { jsonError } from '@/lib/api/json-response'
import { prisma } from '@/lib/prisma'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = resetPasswordBodySchema.safeParse(body)
  if (!parsed.success) {
    const code = parsed.error.issues.some((i) => i.message === 'WEAK_PASSWORD')
      ? 'WEAK_PASSWORD'
      : 'VALIDATION_ERROR'
    return jsonError(400, code, 'Invalid input')
  }

  const { email, password, resetToken: bodyResetToken } = parsed.data
  const emailNorm = email.toLowerCase()

  const jar = await cookies()
  const cookieRaw = jar.get(PWD_RESET_COOKIE)?.value
  const rawToken =
    typeof bodyResetToken === 'string' && bodyResetToken
      ? bodyResetToken
      : cookieRaw

  const payload = rawToken ? verifySignedToken(rawToken) : null
  const allowedEmail =
    typeof payload?.email === 'string' ? payload.email.toLowerCase() : null

  if (!allowedEmail || allowedEmail !== emailNorm) {
    return jsonError(403, 'RESET_NOT_ALLOWED', 'Start reset from email verification')
  }

  const staff = await prisma.user.findUnique({ where: { email: emailNorm } })
  if (!staff) {
    return jsonError(404, 'USER_NOT_FOUND', 'User not found')
  }

  await prisma.user.update({
    where: { id: staff.id },
    data: { passwordHash: hashPassword(password) },
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(PWD_RESET_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
