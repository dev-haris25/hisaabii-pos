import { jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { getSessionUser } from '@/lib/auth/get-session-user'

/**
 * Lightweight connectivity probe for desktop offline detection.
 * Auth optional — returns ok even without session so POS can probe before /me.
 */
export async function GET() {
  try {
    const session = await getSessionUser()
    return jsonOk({
      ping: true,
      authenticated: Boolean(session),
      serverTime: new Date().toISOString(),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/sync/ping')
  }
}
