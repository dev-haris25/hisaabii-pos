import { jsonError, jsonOk } from '@/lib/api/json-response'
import {
  GLOBAL_SEARCH_MAX_LENGTH,
  globalSearch,
} from '@/lib/global-search-service'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  const auth = await authorizeBusinessRequest(request, {
    skipPermissionCheck: true,
  })
  if (auth.error) return auth.error

  const { profile, ability } = auth
  const q = new URL(request.url).searchParams.get('q') ?? ''
  if (q.length > GLOBAL_SEARCH_MAX_LENGTH) {
    return jsonError(400, 'VALIDATION_ERROR', 'Search query is too long')
  }

  const results = await globalSearch(profile.id, ability, q)
  return jsonOk(results)
}
