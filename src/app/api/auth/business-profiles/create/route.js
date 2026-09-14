import { generateRestaurantSlug } from '@/lib/auth/restaurant-slug'
import {
  AUTH_USER_SELECT,
  buildAuthUserFromRowAsync,
} from '@/lib/auth/auth-user-json'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { saveBusinessLogoLocally } from '@/lib/auth/save-business-logo'
import { businessProfileBodySchema } from '@/lib/auth/schemas'
import { defaultVatPercentFromPreset } from '@/lib/auth/vat-preset'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { seedPredefinedRolesForRestaurant } from '@/lib/rbac/seed-predefined-roles'
import { getZatcaEnvironment } from '@/lib/zatca/env'
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

/**
 * POST /api/auth/business-profiles/create
 * Add another restaurant for a user who can create BusinessProfile.
 */
export async function POST(request) {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }
    if (session.isRestaurantOwner !== true) {
      return jsonError(403, 'FORBIDDEN', 'Not allowed')
    }
    if (session.needsBusinessProfileOnboarding) {
      return jsonError(
        400,
        'BUSINESS_PROFILE_REQUIRED',
        'Complete your first restaurant before adding another',
      )
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = businessProfileBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data

    const profileId = await prisma.$transaction(async (tx) => {
      const slug = await createUniqueSlug(tx)
      const profile = await tx.businessProfile.create({
        data: {
          ownerUserId: session.id,
          companyNameAr: d.companyNameAr,
          companyNameEn: d.companyNameEn?.trim() || null,
          crNumber: d.crNumber,
          vatNumber: d.vatNumber,
          addressAr: d.addressAr,
          addressEn: d.addressEn?.trim() || null,
          streetAr: d.streetAr ?? '',
          streetEn: d.streetEn ?? '',
          districtAr: d.districtAr ?? '',
          districtEn: d.districtEn ?? '',
          cityAr: d.cityAr ?? '',
          cityEn: d.cityEn ?? '',
          buildingNumber: d.buildingNumber ?? '',
          secondaryNumber: d.secondaryNumber ?? '',
          postalCode: d.postalCode ?? '',
          shortAddress: d.shortAddress ?? '',
          email: d.email?.trim() || null,
          phone: d.phone?.trim() || null,
          defaultVatPercent: defaultVatPercentFromPreset(
            d.defaultVatPreset ?? 'standard',
          ),
          zatcaEnvironment: getZatcaEnvironment(),
          onboardingCompletedAt: new Date(),
          slug,
        },
      })

      await seedPredefinedRolesForRestaurant(profile.id, session.id, tx)

      await tx.businessSettings.create({
        data: { businessProfileId: profile.id },
      })

      const membership = await tx.businessMembership.findUnique({
        where: {
          userId_businessProfileId: {
            userId: session.id,
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
            name: session.name,
            emailOfficial: session.email,
            joiningDate: new Date(),
            salary: '0',
            status: 'active',
          },
        })
      }

      await tx.user.update({
        where: { id: session.id },
        data: { activeBusinessProfileId: profile.id },
      })

      return profile.id
    })

    if (d.preserveLogo !== true && d.logoBase64 && d.logoMimeType) {
      const saved = await saveBusinessLogoLocally(
        profileId,
        d.logoBase64,
        d.logoMimeType,
      )
      await prisma.businessProfile.update({
        where: { id: profileId },
        data: {
          logoStoragePath: saved.logoStoragePath,
          logoMimeType: saved.logoMimeType,
        },
      })
    }

    const row = await prisma.user.findUnique({
      where: { id: session.id },
      select: AUTH_USER_SELECT,
    })
    if (!row) {
      return jsonError(500, 'SERVER_ERROR', 'User not found')
    }

    return jsonOk({
      user: await buildAuthUserFromRowAsync(row),
      profileId,
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/business-profiles/create')
  }
}
