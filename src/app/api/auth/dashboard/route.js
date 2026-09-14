import { jsonOk } from '@/lib/api/json-response'
import { ANALYTICS_SCOPE_ALL } from '@/lib/auth/analytics-scope-query'
import { resolveOwnerAnalyticsScope } from '@/lib/auth/owned-restaurant-scope'
import { queryPosDashboard } from '@/lib/dashboard/query-pos-dashboard'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { prisma } from '@/lib/prisma'

export async function GET(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error

  const scopeRaw = new URL(request.url).searchParams.get('scope')
  const analytics = await resolveOwnerAnalyticsScope({
    session: auth.session,
    activeProfileId: auth.profile.id,
    scopeRaw,
  })

  let restaurantName = null
  if (analytics.scope !== ANALYTICS_SCOPE_ALL && analytics.ids[0]) {
    if (analytics.ids[0] === auth.profile.id) {
      restaurantName =
        auth.profile.companyNameEn || auth.profile.companyNameAr || null
    } else {
      const scoped = await prisma.businessProfile.findUnique({
        where: { id: analytics.ids[0] },
        select: { companyNameEn: true, companyNameAr: true },
      })
      restaurantName = scoped?.companyNameEn || scoped?.companyNameAr || null
    }
  }

  const result = await queryPosDashboard(analytics.ids, auth.ability, {
    restaurantName,
  })
  return jsonOk(result)
}
