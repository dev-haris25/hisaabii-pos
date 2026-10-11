import { createOtpForStaff } from '@/lib/auth/otp'
import { forgotPasswordBodySchema } from '@/lib/auth/schemas'
import { sendOtpEmail } from '@/lib/email/send-otp-email'
import { handleRouteError } from '@/lib/api/route-error'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { rateLimitResponse } from '@/lib/api/rate-limit'
import { prisma } from '@/lib/prisma'

/** Resend registration OTP. */
export async function POST(request) {
  try {
    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = forgotPasswordBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
    }

    const emailNorm = parsed.data.email.toLowerCase()
    const limited = rateLimitResponse([
      ['resendRegisterOtpEmail', emailNorm],
    ])
    if (limited) return limited
    const staff = await prisma.user.findUnique({
      where: { email: emailNorm },
    })
    if (!staff) {
      // Don't leak whether the email exists
      return jsonOk({ email: emailNorm })
    }
    if (staff.emailVerified) {
      return jsonError(400, 'ALREADY_VERIFIED', 'Email already verified')
    }

    try {
      const code = await createOtpForStaff(staff.id, 'register')
      await sendOtpEmail({
        to: staff.email,
        name: staff.name,
        code,
        purpose: 'register',
        preferredLocale: staff.preferredLocale,
      })
      if (process.env.NODE_ENV === 'development') {
        console.info('[hisabi-pos:auth] resend registration OTP (dev):', code)
      }
    } catch (err) {
      console.error('[hisabi-pos:auth] resend OTP failed', err)
      return jsonError(500, 'SERVER_ERROR', 'Could not send verification email')
    }

    return jsonOk({ email: emailNorm })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/resend-register-otp')
  }
}
