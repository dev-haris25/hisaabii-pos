import { getSessionUser } from '@/lib/auth/get-session-user'
import { handleRouteError } from '@/lib/api/route-error'
import { jsonOk } from '@/lib/api/json-response'

export async function GET() {
  try {
    const user = await getSessionUser()
    return jsonOk({ user })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/me')
  }
}
