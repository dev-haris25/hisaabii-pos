'use client'

import { useQuery } from '@tanstack/react-query'

import { buildListQueryUrl } from '@/lib/list-views/build-list-query-url'

/**
 * Fetches global list stats independently of filters/pagination.
 * Use queryKey like `['payments', 'stats', profileId]` so
 * `invalidateQueries({ queryKey: ['payments'] })` still refreshes stats after mutations.
 *
 * @param {{
 *   queryKey: readonly unknown[]
 *   path: string
 *   enabled?: boolean
 *   fetcher: (url: string) => Promise<{ stats?: unknown } & Record<string, unknown>>
 *   params?: Record<string, string | number | boolean | null | undefined>
 *   staleTime?: number
 * }} options
 */
export function useListStatsQuery({
  queryKey,
  path,
  enabled = true,
  fetcher,
  params,
  staleTime = 60_000,
}) {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetcher(
        buildListQueryUrl(path, {
          ...(params ?? {}),
          statsOnly: 1,
        }),
      )
      return res?.stats ?? null
    },
    enabled,
    staleTime,
  })
}
