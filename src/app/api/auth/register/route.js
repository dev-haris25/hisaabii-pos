import { generateRestaurantSlug } from '@/lib/auth/restaurant-slug'
import { hashPassword } from '@/lib/auth/password'
import { createOtpForUser } from '@/lib/auth/otp'
import { registerBodySchema } from '@/lib/auth/schemas'
import { sendOtpEmail } from '@/lib/email/send-otp-email'
import { handleRouteError } from '@/lib/api/route-error'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { seedPredefinedRolesForRestaurant } from '@/lib/rbac/seed-predefined-roles'
import { prisma } from '@/lib/prisma'

/** @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx */
async function createUniqueSlug(tx) {
  for (let i = 0; i < 12; i++) {
    const slug = generateRestaurantSlug()
    const existing = await tx.businessProfile.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!existing) return slug
  }
  throw new Error('Could not allocate restaurant slug')
}

export async function POST(request) {
  try {
    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = registerBodySchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      let code = 'VALIDATION_ERROR'
      if (first?.message === 'PASSWORD_MISMATCH') code = 'PASSWORD_MISMATCH'
      else if (first?.message === 'WEAK_PASSWORD') code = 'WEAK_PASSWORD'
      return jsonError(400, code, 'Invalid input')
    }

    const { name, email, password } = parsed.data
    const emailNorm = email.toLowerCase()

    const existing = await prisma.user.findUnique({
      where: { email: emailNorm },
    })
    if (existing) {
      return jsonError(409, 'EMAIL_IN_USE', 'Email already registered')
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: name.trim(),
          email: emailNorm,
          passwordHash: hashPassword(password),
          emailVerified: false,
        },
      })

      const slug = await createUniqueSlug(tx)
      const profile = await tx.businessProfile.create({
        data: {
          ownerUserId: created.id,
          companyNameAr: '',
          crNumber: '',
          vatNumber: '',
          addressAr: '',
          slug,
        },
      })

      await tx.businessSettings.create({
        data: { businessProfileId: profile.id },
      })

      await tx.user.update({
        where: { id: created.id },
        data: { activeBusinessProfileId: profile.id },
      })

      await seedPredefinedRolesForRestaurant(profile.id, created.id, tx)

      // Owner HR row — visible only to the owner in employee lists
      const membership = await tx.businessMembership.findUnique({
        where: {
          userId_businessProfileId: {
            userId: created.id,
            businessProfileId: profile.id,
          },
        },
        select: { id: true },
      })
      if (membership) {
        await tx.employee.create({
          data: {
            businessProfileId: profile.id,
            businessMembershipId: membership.id,
            name: name.trim(),
            emailOfficial: emailNorm,
            joiningDate: new Date(),
            salary: '0',
            status: 'active',
          },
        })
      }

      return created
    })

    try {
      const code = await createOtpForUser(user.id, 'register')
      const info = await sendOtpEmail({
        to: user.email,
        name: user.name,
        code,
        purpose: 'register',
        preferredLocale: user.preferredLocale,
      })
      console.info('[hisabi-pos:auth] registration OTP email accepted by SMTP', {
        to: user.email,
        messageId: info?.messageId ?? null,
      })
      if (process.env.NODE_ENV === 'development') {
        console.info('[hisabi-pos:auth] registration OTP code (dev log only):', code)
      }
    } catch (err) {
      console.error('[hisabi-pos:auth] failed to send registration OTP email', err)
      return jsonError(500, 'SERVER_ERROR', 'Could not send verification email')
    }

    return jsonOk({ email: emailNorm })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/register')
  }
}
