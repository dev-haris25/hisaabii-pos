'use client'

import { useMemo } from 'react'

/**
 * Derive pagination display values from a server-paginated API response.
 *
 * @param {number} page Current page from URL/state
 * @param {{ page?: number, limit?: number, total?: number, totalPages?: number } | null | undefined} pagination
 */
export function useServerPaginatedRows(page, pagination) {
  return useMemo(() => {
    const total = pagination?.total ?? 0
    const totalPages = Math.max(1, pagination?.totalPages ?? 1)
    const safePage = Math.min(Math.max(1, page), totalPages)

    return { total, totalPages, safePage }
  }, [page, pagination?.total, pagination?.totalPages])
}
