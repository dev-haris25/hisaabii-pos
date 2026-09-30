import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  getOrCreateLoyaltySettings,
  LOYALTY_SETTINGS_CREATE_DEFAULTS,
} from '@/lib/loyalty/get-or-create-loyalty-settings'
import {
  loyaltySettingsPatchSchema,
  loyaltySettingsPatchToData,
  validateLoyaltySettingsPatch,
} from '@/lib/loyalty/loyalty-settings-schema'
import { mapLoyaltySettingsPayload } from '@/lib/loyalty/map-loyalty-settings-json'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request, {
      action: 'read',
      subject: 'Loyalty',
    })
    if (auth.error) return auth.error
    const { profile } = auth

    const settings = await getOrCreateLoyaltySettings(profile.id)

    return jsonOk({
      settings: mapLoyaltySettingsPayload(settings),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/loyalty/settings')
  }
}

/** @param {import('next/server').NextRequest} request */
export async function PATCH(request) {
  try {
    const auth = await authorizeBusinessRequest(request, {
      action: 'update',
      subject: 'Loyalty',
    })
    if (auth.error) return auth.error
    const { profile } = auth

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = loyaltySettingsPatchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    const domainError = validateLoyaltySettingsPatch(d)
    if (domainError) {
      return jsonError(400, domainError.code, domainError.message)
    }

    const settingsData = loyaltySettingsPatchToData(d)

    const settings =
      Object.keys(settingsData).length > 0
        ? await prisma.loyaltySettings.upsert({
            where: { businessProfileId: profile.id },
            create: {
              businessProfileId: profile.id,
              ...LOYALTY_SETTINGS_CREATE_DEFAULTS,
              ...settingsData,
            },
            update: settingsData,
          })
        : await getOrCreateLoyaltySettings(profile.id)

    return jsonOk({
      settings: mapLoyaltySettingsPayload(settings),
    })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/loyalty/settings')
  }
}
