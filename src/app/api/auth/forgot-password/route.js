import { forgotPasswordBodySchema } from '@/lib/auth/schemas'
import { createOtpForStaff } from '@/lib/auth/otp'
import { sendOtpEmail } from '@/lib/email/send-otp-email'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { prisma } from '@/lib/prisma'

export async function POST(request) {
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
  const staff = await prisma.user.findUnique({ where: { email: emailNorm } })
  if (!staff) {
    return jsonError(404, 'USER_NOT_FOUND', 'No account for this email')
  }

  try {
    const code = await createOtpForStaff(staff.id, 'password_reset')
    await sendOtpEmail({
      to: staff.email,
      name: staff.name,
      code,
      purpose: 'password_reset',
      preferredLocale: staff.preferredLocale,
    })
    if (process.env.NODE_ENV === 'development') {
      console.info('[hisabi-pos:auth] password-reset OTP (dev):', code)
    }
  } catch (err) {
    console.error('[hisabi-pos:auth] failed to send password-reset OTP', err)
    return jsonError(500, 'SERVER_ERROR', 'Could not send verification email')
  }

  return jsonOk()
}
