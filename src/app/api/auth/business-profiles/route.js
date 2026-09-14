import {
  AUTH_USER_SELECT,
  buildAuthUserFromRowAsync,
} from '@/lib/auth/auth-user-json'
import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import {
  getAccessibleBusinessProfileIds,
} from '@/lib/auth/accessible-business-profiles'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { saveBusinessLogoLocally } from '@/lib/auth/save-business-logo'
import { businessProfileBodySchema } from '@/lib/auth/schemas'
import { defaultVatPercentFromPreset } from '@/lib/auth/vat-preset'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { createMongoAbility } from '@casl/ability'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { getZatcaEnvironment } from '@/lib/zatca/env'
import { prisma } from '@/lib/prisma'

/**
 * Complete (or update) the active restaurant BusinessProfile.
 * First-run uses UPDATE of the draft profile created at register.
 */
export async function POST(request) {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }
    const ability = createMongoAbility(session.abilityRules ?? [])
    if (
      !hasFullAccess(ability) &&
      !ability.can('create', 'BusinessProfile') &&
      !ability.can('update', 'BusinessProfile')
    ) {
      return jsonError(403, 'FORBIDDEN', 'Not allowed')
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
    const active = await getResolvedActiveBusinessProfile(session.id)
    const profileId = active?.id ?? session.businessProfileId
    if (!profileId) {
      return jsonError(400, 'NO_PROFILE', 'No restaurant profile linked')
    }

    /** @type {Record<string, unknown>} */
    const data = {
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
      defaultVatPercent: defaultVatPercentFromPreset(d.defaultVatPreset ?? 'standard'),
      zatcaEnvironment: getZatcaEnvironment(),
      onboardingCompletedAt: new Date(),
    }

    if (d.preserveLogo !== true && d.logoBase64 && d.logoMimeType) {
      const saved = await saveBusinessLogoLocally(
        profileId,
        d.logoBase64,
        d.logoMimeType,
      )
      data.logoStoragePath = saved.logoStoragePath
      data.logoMimeType = saved.logoMimeType
    }

    await prisma.businessProfile.update({
      where: { id: profileId },
      data,
    })

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
    return handleRouteError(err, 'POST /api/auth/business-profiles')
  }
}

export async function GET() {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }

    const ids = await getAccessibleBusinessProfileIds(session.id)
    if (ids.length === 0) {
      return jsonOk({ profiles: [] })
    }

    const activeId =
      session.activeBusinessProfileId ?? session.businessProfileId ?? null

    const profiles = await prisma.businessProfile.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        ownerUserId: true,
        companyNameAr: true,
        companyNameEn: true,
        crNumber: true,
        vatNumber: true,
        logoStoragePath: true,
        onboardingCompletedAt: true,
        zatcaOnboardingSkipped: true,
        updatedAt: true,
        zatcaDevice: {
          select: { productionCsid: true },
        },
      },
    })

    return jsonOk({
      profiles: profiles.map((p) => {
        const hasProductionCsid = Boolean(p.zatcaDevice?.productionCsid)
        const zatcaOnboardingSkipped = p.zatcaOnboardingSkipped === true
        return {
          id: p.id,
          companyNameAr: p.companyNameAr,
          companyNameEn: p.companyNameEn,
          crNumber: p.crNumber,
          vatNumber: p.vatNumber,
          hasLogo: Boolean(p.logoStoragePath),
          onboardingCompleted: Boolean(p.onboardingCompletedAt),
          zatcaOnboardingSkipped,
          zatcaCompleted: hasProductionCsid,
          zatcaPending: !hasProductionCsid,
          updatedAt: p.updatedAt.toISOString(),
          isActive: p.id === activeId,
          isOwner: p.ownerUserId === session.id,
        }
      }),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/business-profiles')
  }
}
