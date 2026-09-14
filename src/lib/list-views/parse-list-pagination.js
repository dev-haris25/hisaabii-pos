/**
 * Whether the client explicitly requested pagination (page or limit in query).
 * Omitting both returns the full filtered result set for pickers.
 *
 * @param {URLSearchParams} searchParams
 */
export function shouldPaginateListRequest(searchParams) {
  return searchParams.has('page') || searchParams.has('limit')
}

/**
 * @param {URLSearchParams} searchParams
 * @param {{ defaultLimit?: number, maxLimit?: number }} [options]
 * @returns {{ page: number, limit: number, skip: number }}
 */
export function parseListPagination(searchParams, options = {}) {
  const { defaultLimit = 10, maxLimit = 100 } = options

  const page = Math.max(
    1,
    Number.parseInt(searchParams.get('page') ?? '1', 10) || 1,
  )
  const limit = Math.min(
    maxLimit,
    Math.max(
      1,
      Number.parseInt(searchParams.get('limit') ?? String(defaultLimit), 10) ||
        defaultLimit,
    ),
  )
  const skip = (page - 1) * limit

  return { page, limit, skip }
}

/**
 * @param {number} page
 * @param {number} limit
 * @param {number} total
 */
export function buildPaginationMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}
