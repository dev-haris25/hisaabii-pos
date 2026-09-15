'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { AppLoader } from '@/components/app-loader'
import { AuthApiError } from '@/lib/api/auth-client'
import { formatOrderNumber } from '@/lib/orders/riyadh-order-date'
import { cn } from '@/lib/utils'

const POLL_MS = 4000

/**
 * @param {string} slug
 */
async function fetchPublicQueue(slug) {
  const res = await fetch(`/api/public/queue/${encodeURIComponent(slug)}`, {
    credentials: 'omit',
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    // ignore
  }
  if (!res.ok) {
    throw new AuthApiError(
      res.status,
      typeof data.code === 'string' ? data.code : 'NOT_FOUND',
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  return data
}

/**
 * @param {{
 *   slug: string
 *   restaurantName?: string
 *   queueLocale?: string
 * }} props
 */
export function QueueDisplayView({ slug, restaurantName = '' }) {
  const t = useTranslations('KitchenQueue')
  const tErr = useTranslations('AuthErrors')

  const query = useQuery({
    queryKey: ['public-queue', slug],
    queryFn: () => fetchPublicQueue(slug),
    enabled: Boolean(slug),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const preparing = query.data?.preparing ?? []
  const readySorted = useMemo(() => {
    const rows = [...(query.data?.ready ?? [])]
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return rows
  }, [query.data?.ready])
  const featuredReady = readySorted[0] ?? null
  const otherReady = readySorted.slice(1)
  const showLoader = query.isLoading && !query.data

  return (
    <div className="type-body-md text-hisabi-on-surface flex min-h-dvh flex-col bg-hisabi-background">
      {restaurantName ? (
        <p className="type-headline-sm px-hisabi-md pt-hisabi-md text-center font-bold text-hisabi-on-surface md:px-hisabi-xl md:pt-hisabi-lg">
          {restaurantName}
        </p>
      ) : null}
      {showLoader ? (
        <div className="flex flex-1 items-center justify-center">
          <AppLoader />
        </div>
      ) : query.isError ? (
        <p className="type-body-md text-hisabi-error py-hisabi-xl text-center" role="alert">
          {tErr(
            query.error instanceof AuthApiError ? query.error.code : 'generic',
          )}
        </p>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-hisabi-lg p-hisabi-md md:grid-cols-2 md:p-hisabi-xl">
          <QueueColumn
            title={t('inPreparation')}
            empty={t('emptyPreparing')}
            orders={preparing}
            tone="preparing"
          />
          <QueueColumn
            title={t('readyToCollect')}
            empty={t('emptyReady')}
            orders={otherReady}
            featured={featuredReady}
            tone="ready"
          />
        </div>
      )}
    </div>
  )
}

/**
 * @param {{
 *   title: string
 *   empty: string
 *   orders: Array<{ invoiceId: string, orderNumber: number, createdAt?: string }>
 *   featured?: { invoiceId: string, orderNumber: number } | null
 *   tone: 'preparing' | 'ready'
 * }} props
 */
function QueueColumn({ title, empty, orders, featured = null, tone }) {
  const hasOrders = Boolean(featured) || orders.length > 0

  return (
    <section className="flex min-h-0 flex-col rounded-hisabi-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-low p-hisabi-lg">
      <h2 className="type-headline-md mb-hisabi-lg font-bold text-hisabi-on-surface">
        {title}
      </h2>
      {!hasOrders ? (
        <p className="type-body-lg text-hisabi-on-surface-variant">{empty}</p>
      ) : (
        <div className="grid grid-cols-3 content-start gap-hisabi-md">
          {featured ? (
            <QueueTile order={featured} tone={tone} featured />
          ) : null}
          {orders.map((order) => (
            <QueueTile key={order.invoiceId} order={order} tone={tone} />
          ))}
        </div>
      )}
    </section>
  )
}

function QueueTile({ order, tone, featured = false }) {
  return (
    <p
      dir="ltr"
      className={cn(
        'flex items-center justify-center rounded-hisabi-xl text-center font-bold shadow-hisabi-1',
        featured
          ? 'type-headline-xl col-span-3 min-h-40 px-hisabi-xl py-hisabi-xl'
          : 'type-headline-md min-h-20 px-hisabi-md py-hisabi-lg',
        tone === 'ready'
          ? 'bg-hisabi-primary-fixed text-hisabi-on-primary-fixed'
          : 'bg-hisabi-surface-container-high text-hisabi-on-surface',
      )}
    >
      {formatOrderNumber(order.orderNumber)}
    </p>
  )
}
