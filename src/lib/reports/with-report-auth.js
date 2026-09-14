import { resolveOwnerAnalyticsScope } from '@/lib/auth/owned-restaurant-scope'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * @param {import('next/server').NextRequest} [request]
 * @returns {Promise<{ ok: true, profile: { id: string }, session: import('@/lib/auth/auth-user-json').AuthUser, analyticsProfileIds: string[] } | { ok: false, response: Response }>}
 */
export async function withReportAuth(request) {
  const auth = await authorizeBusinessRequest(request ?? {})
  if (auth.error) {
    return { ok: false, response: auth.error }
  }
  const scopeRaw = request
    ? new URL(request.url).searchParams.get('scope')
    : null
  const analytics = await resolveOwnerAnalyticsScope({
    session: auth.session,
    activeProfileId: auth.profile.id,
    scopeRaw,
  })
  return {
    ok: true,
    profile: auth.profile,
    session: auth.session,
    analyticsProfileIds: analytics.ids,
  }
}
