import { jsonOk } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { VISA_EXPIRY_WINDOW_DAYS } from '@/lib/hr/visa-expiry-status'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Count of active employees whose visa is already expired or expiring within
 * the shared 30-day window. Mirrors `getVisaExpiryStatus(daysLeft) !== 'ok'`.
 *
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth

  const threshold = new Date(Date.now() + VISA_EXPIRY_WINDOW_DAYS * DAY_MS)

  const count = await prisma.employee.count({
    where: {
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
      status: 'active',
      visaExpiry: { not: null, lte: threshold },
    },
  })

  return jsonOk({ count })
}
