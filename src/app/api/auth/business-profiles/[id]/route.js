import {
  AUTH_USER_SELECT,
  buildAuthUserFromRowAsync,
} from '@/lib/auth/auth-user-json'
import { userCanAccessBusinessProfile } from '@/lib/auth/accessible-business-profiles'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { saveBusinessLogoLocally } from '@/lib/auth/save-business-logo'
import { businessProfileBodySchema } from '@/lib/auth/schemas'
import { defaultVatPercentFromPreset } from '@/lib/auth/vat-preset'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { taxIdDigitsEqual } from '@/lib/business-registration-ids'
import { createMongoAbility } from '@casl/ability'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { getZatcaEnvironment } from '@/lib/zatca/env'
import { invalidateZatcaOnboardingForProfile } from '@/lib/zatca/invalidate-zatca-onboarding'
import { prisma } from '@/lib/prisma'

/**
 * @param {import('@/generated/prisma/client').BusinessProfile & {
 *   zatcaDevice?: { productionCsid: string | null } | null
 * }} row
 */
function mapProfileDetailJson(row) {
  const defaultVatPreset =
    row.defaultVatPercent === '0' ? 'zero' : 'standard'
  const zatcaCompleted = Boolean(row.zatcaDevice?.productionCsid)

  return {
    id: row.id,
    companyNameAr: row.companyNameAr,
    companyNameEn: row.companyNameEn,
    addressAr: row.addressAr,
    addressEn: row.addressEn,
    streetAr: row.streetAr,
    streetEn: row.streetEn,
    districtAr: row.districtAr,
    districtEn: row.districtEn,
    cityAr: row.cityAr,
    cityEn: row.cityEn,
    buildingNumber: row.buildingNumber,
    secondaryNumber: row.secondaryNumber,
    postalCode: row.postalCode,
    shortAddress: row.shortAddress,
    crNumber: row.crNumber,
    vatNumber: row.vatNumber,
    email: row.email,
    phone: row.phone,
    defaultVatPreset,
    useCustomVatRate: false,
    customVatPercent: null,
    hasLogo: Boolean(row.logoStoragePath),
    updatedAt: row.updatedAt.toISOString(),
    zatcaOnboardingSkipped: row.zatcaOnboardingSkipped === true,
    zatcaCompleted,
  }
}

/**
 * @param {import('next/server').NextRequest} _request
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function GET(_request, ctx) {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }
    const ability = createMongoAbility(session.abilityRules ?? [])
    if (
      !hasFullAccess(ability) &&
      !ability.can('read', 'BusinessProfile') &&
      !ability.can('update', 'BusinessProfile')
    ) {
      return jsonError(403, 'FORBIDDEN', 'Not allowed')
    }

    const { id } = await ctx.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid id')
    }

    const canAccess = await userCanAccessBusinessProfile(session.id, id)
    if (!canAccess) {
      return jsonError(404, 'NOT_FOUND', 'Profile not found')
    }

    const row = await prisma.businessProfile.findUnique({
      where: { id },
      include: {
        zatcaDevice: { select: { productionCsid: true } },
      },
    })
    if (!row) {
      return jsonError(404, 'NOT_FOUND', 'Profile not found')
    }

    return jsonOk({ profile: mapProfileDetailJson(row) })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/business-profiles/[id]')
  }
}

/**
 * @param {import('next/server').NextRequest} request
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function PATCH(request, ctx) {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }
    const ability = createMongoAbility(session.abilityRules ?? [])
    if (!hasFullAccess(ability) && !ability.can('update', 'BusinessProfile')) {
      return jsonError(403, 'FORBIDDEN', 'Not allowed')
    }

    const { id } = await ctx.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid id')
    }

    const canAccess = await userCanAccessBusinessProfile(session.id, id)
    if (!canAccess) {
      return jsonError(404, 'NOT_FOUND', 'Profile not found')
    }

    const existing = await prisma.businessProfile.findUnique({
      where: { id },
    })
    if (!existing) {
      return jsonError(404, 'NOT_FOUND', 'Profile not found')
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
    const taxChanged =
      !taxIdDigitsEqual(d.crNumber, existing.crNumber) ||
      !taxIdDigitsEqual(d.vatNumber, existing.vatNumber)

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
    }

    if (d.preserveLogo === true) {
      // keep existing logo fields
    } else if (d.logoBase64 && d.logoMimeType) {
      const saved = await saveBusinessLogoLocally(
        id,
        d.logoBase64,
        d.logoMimeType,
      )
      data.logoStoragePath = saved.logoStoragePath
      data.logoMimeType = saved.logoMimeType
    } else {
      data.logoStoragePath = null
      data.logoMimeType = null
    }

    if (taxChanged) {
      await prisma.$transaction(async (tx) => {
        await tx.businessProfile.update({
          where: { id },
          data,
        })
        await invalidateZatcaOnboardingForProfile(tx, id)
      })
    } else {
      await prisma.businessProfile.update({
        where: { id },
        data,
      })
    }

    const [userRow, updatedProfile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.id },
        select: AUTH_USER_SELECT,
      }),
      prisma.businessProfile.findUnique({
        where: { id },
        include: {
          zatcaDevice: { select: { productionCsid: true } },
        },
      }),
    ])

    if (!userRow) {
      return jsonError(500, 'SERVER_ERROR', 'User not found')
    }

    return jsonOk({
      profile: updatedProfile ? mapProfileDetailJson(updatedProfile) : undefined,
      user: await buildAuthUserFromRowAsync(userRow),
    })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/business-profiles/[id]')
  }
}

/**
 * Hard-delete a restaurant the user belongs to (requires another membership).
 *
 * @param {import('next/server').NextRequest} _request
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function DELETE(_request, ctx) {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }
    const ability = createMongoAbility(session.abilityRules ?? [])
    if (!hasFullAccess(ability) && !ability.can('delete', 'BusinessProfile')) {
      return jsonError(403, 'FORBIDDEN', 'Not allowed')
    }

    const { id } = await ctx.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid id')
    }

    const canAccess = await userCanAccessBusinessProfile(session.id, id)
    if (!canAccess) {
      return jsonError(403, 'FORBIDDEN', 'Not allowed')
    }

    const memberships = await prisma.businessMembership.findMany({
      where: { userId: session.id },
      select: { businessProfileId: true },
      orderBy: { createdAt: 'asc' },
    })

    if (memberships.length <= 1) {
      return jsonError(
        400,
        'LAST_RESTAURANT',
        'Cannot delete your only restaurant',
      )
    }

    const nextProfileId =
      memberships.find((m) => m.businessProfileId !== id)?.businessProfileId ??
      null
    if (!nextProfileId) {
      return jsonError(
        400,
        'LAST_RESTAURANT',
        'Cannot delete your only restaurant',
      )
    }

    const existing = await prisma.businessProfile.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true },
    })
    if (!existing) {
      return jsonError(404, 'NOT_FOUND', 'Profile not found')
    }
    if (existing.ownerUserId !== session.id) {
      return jsonError(403, 'FORBIDDEN', 'Not allowed')
    }

    await prisma.$transaction(async (tx) => {
      // Reassign active pointer before cascade delete so the user is preserved.
      const user = await tx.user.findUnique({
        where: { id: session.id },
        select: {
          activeBusinessProfileId: true,
        },
      })
      if (!user) {
        throw new Error('USER_NOT_FOUND')
      }

      if (user.activeBusinessProfileId === id) {
        await tx.user.update({
          where: { id: session.id },
          data: { activeBusinessProfileId: nextProfileId },
        })
      }

      await tx.businessProfile.delete({
        where: { id },
      })
    })

    const row = await prisma.user.findUnique({
      where: { id: session.id },
      select: AUTH_USER_SELECT,
    })
    if (!row) {
      return jsonError(500, 'SERVER_ERROR', 'User not found')
    }

    return jsonOk({ user: await buildAuthUserFromRowAsync(row) })
  } catch (err) {
    if (err instanceof Error && err.message === 'USER_NOT_FOUND') {
      return jsonError(500, 'SERVER_ERROR', 'User not found')
    }
    return handleRouteError(err, 'DELETE /api/auth/business-profiles/[id]')
  }
}
