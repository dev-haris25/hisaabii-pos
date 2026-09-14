import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'

/**
 * Active restaurant profile for the signed-in ADMIN.
 * Returns `profile: null` while first-run onboarding is incomplete so the
 * wizard uses POST /business-profiles (same UX as Hisabi create).
 */
export async function GET() {
  try {
    const session = await getSessionUser()
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
    }

    const profile = await getResolvedActiveBusinessProfile(session.id)
    if (!profile || !profile.onboardingCompletedAt) {
      return jsonOk({ profile: null })
    }

    const defaultVatPreset =
      profile.defaultVatPercent === '0' ? 'zero' : 'standard'

    return jsonOk({
      profile: {
        id: profile.id,
        companyNameAr: profile.companyNameAr,
        companyNameEn: profile.companyNameEn,
        crNumber: profile.crNumber,
        vatNumber: profile.vatNumber,
        addressAr: profile.addressAr,
        addressEn: profile.addressEn,
        streetAr: profile.streetAr,
        streetEn: profile.streetEn,
        districtAr: profile.districtAr,
        districtEn: profile.districtEn,
        cityAr: profile.cityAr,
        cityEn: profile.cityEn,
        buildingNumber: profile.buildingNumber,
        secondaryNumber: profile.secondaryNumber,
        postalCode: profile.postalCode,
        shortAddress: profile.shortAddress,
        email: profile.email,
        phone: profile.phone,
        defaultVatPreset,
        useCustomVatRate: false,
        customVatPercent: null,
        hasLogo: Boolean(profile.logoStoragePath),
        updatedAt: profile.updatedAt.toISOString(),
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/business-profile')
  }
}
