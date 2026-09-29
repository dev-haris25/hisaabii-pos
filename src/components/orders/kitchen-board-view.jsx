'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, LayoutList } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AppLoader } from '@/components/app-loader'
import { KitchenOrderCard } from '@/components/orders/kitchen-order-card'
import { KitchenQueueHeader } from '@/components/orders/kitchen-queue-header'
import { AuthApiError, authGet, authPatch } from '@/lib/api/auth-client'
import { formatKitchenAverage } from '@/lib/orders/kitchen-wait-time'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const POLL_MS = 4000
const TICK_MS = 15000

const COLUMN_NEXT = {
  pending: { status: 'preparing', labelKey: 'startPreparing' },
  preparing: { status: 'ready', labelKey: 'markReadyToServe' },
  ready: { status: 'completed', labelKey: 'markServed' },
}

/**
 * @param {{ restaurantName: string, staffName: string, showGoToDashboard: boolean }} props
 */
export function KitchenBoardView({
  restaurantName,
  staffName,
  showGoToDashboard,
}) {
  const t = useTranslations('KitchenQueue')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const profileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? s.user?.businessProfileId ?? null,
  )
  const [boardTab, setBoardTab] = useState('active')
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const query = useQuery({
    queryKey: ['kitchen-board', profileId],
    queryFn: () => authGet('/orders/board?view=kitchen'),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const applyLocalMove = useCallback(
    (invoiceId, nextStatus) => {
      queryClient.setQueryData(['kitchen-board', profileId], (old) => {
        if (!old) return old
        return moveOrderInBoardData(old, invoiceId, nextStatus)
      })
    },
    [profileId, queryClient],
  )

  const statusMutation = useMutation({
    mutationFn: async ({ invoiceId, status }) =>
      authPatch(`/orders/${invoiceId}/status`, { status }),
    onMutate: async ({ invoiceId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['kitchen-board', profileId] })
      const previous = queryClient.getQueryData(['kitchen-board', profileId])
      applyLocalMove(invoiceId, status)
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['kitchen-board', profileId], ctx.previous)
      }
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-board'] })
    },
  })

  const pending = query.data?.pending ?? []
  const preparing = query.data?.preparing ?? []
  const ready = query.data?.ready ?? []
  const completed = query.data?.completed ?? []
  const stats = query.data?.stats ?? {
    activeCount: 0,
    completedCount: 0,
    averagePrepMs: 0,
  }
  const showLoader = query.isLoading && !query.data
  const busyId = statusMutation.isPending
    ? statusMutation.variables?.invoiceId
    : null

  function requestStatus(invoiceId, status) {
    const current = [...pending, ...preparing, ...ready].find(
      (o) => o.invoiceId === invoiceId,
    )
    if (!current || current.status === status) return
    statusMutation.mutate({ invoiceId, status })
  }

  return (
    <div className="type-body-md text-hisabi-on-surface flex min-h-dvh flex-col bg-hisabi-background">
      <KitchenQueueHeader
        staffName={staffName}
        restaurantName={restaurantName}
        showGoToDashboard={showGoToDashboard}
      />
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-hisabi-md p-hisabi-md md:p-hisabi-lg">
        {showLoader ? (
          <div className="flex flex-1 items-center justify-center py-hisabi-xxl">
            <AppLoader />
          </div>
        ) : query.isError ? (
          <p className="type-body-md text-hisabi-error py-hisabi-xl text-center" role="alert">
            {tErr(
              query.error instanceof AuthApiError ? query.error.code : 'generic',
            )}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-hisabi-md sm:flex-row sm:items-center sm:justify-between">
              <div
                className="inline-flex w-fit rounded-hisabi-xl border border-hisabi-outline-variant/40 bg-hisabi-surface-container-lowest p-1"
                role="tablist"
                aria-label={t('boardTabsLabel')}
              >
                <BoardTab
                  active={boardTab === 'active'}
                  onClick={() => setBoardTab('active')}
                >
                  {t('tabActive')}
                </BoardTab>
                <BoardTab
                  active={boardTab === 'completed'}
                  onClick={() => setBoardTab('completed')}
                >
                  {t('tabCompleted')}
                </BoardTab>
              </div>
              <div className="flex flex-wrap gap-hisabi-sm">
                <StatChip
                  icon={LayoutList}
                  label={t('statActive')}
                  value={String(stats.activeCount)}
                />
                <StatChip
                  icon={CheckCircle2}
                  label={t('statCompleted')}
                  value={String(stats.completedCount)}
                />
                <StatChip
                  icon={Clock3}
                  label={t('statAverage')}
                  value={formatKitchenAverage(stats.averagePrepMs ?? 0, t)}
                />
              </div>
            </div>

            {boardTab === 'active' ? (
              <div className="grid flex-1 grid-cols-1 gap-hisabi-md lg:grid-cols-3">
                <KanbanColumn
                  title={t('pending')}
                  empty={t('emptyPending')}
                  status="pending"
                  orders={pending}
                  locale={locale}
                  nowMs={nowMs}
                  actionLabel={t(COLUMN_NEXT.pending.labelKey)}
                  busyId={busyId}
                  onAction={(invoiceId) =>
                    requestStatus(invoiceId, COLUMN_NEXT.pending.status)
                  }
                  onDropStatus={(invoiceId) =>
                    requestStatus(invoiceId, 'pending')
                  }
                />
                <KanbanColumn
                  title={t('preparing')}
                  empty={t('emptyPreparing')}
                  status="preparing"
                  orders={preparing}
                  locale={locale}
                  nowMs={nowMs}
                  actionLabel={t(COLUMN_NEXT.preparing.labelKey)}
                  busyId={busyId}
                  onAction={(invoiceId) =>
                    requestStatus(invoiceId, COLUMN_NEXT.preparing.status)
                  }
                  onDropStatus={(invoiceId) =>
                    requestStatus(invoiceId, 'preparing')
                  }
                />
                <KanbanColumn
                  title={t('readyToServe')}
                  empty={t('emptyReady')}
                  status="ready"
                  orders={ready}
                  locale={locale}
                  nowMs={nowMs}
                  actionLabel={t(COLUMN_NEXT.ready.labelKey)}
                  busyId={busyId}
                  onAction={(invoiceId) =>
                    requestStatus(invoiceId, COLUMN_NEXT.ready.status)
                  }
                  onDropStatus={(invoiceId) =>
                    requestStatus(invoiceId, 'ready')
                  }
                />
              </div>
            ) : (
              <section className="flex-1">
                <h2 className="type-headline-md mb-hisabi-md font-bold text-hisabi-on-surface">
                  {t('completedHeading')}
                </h2>
                {completed.length === 0 ? (
                  <p className="type-body-md text-hisabi-on-surface-variant">
                    {t('emptyCompleted')}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2 xl:grid-cols-3">
                    {completed.map((order) => (
                      <KitchenOrderCard
                        key={order.invoiceId}
                        order={order}
                        locale={locale}
                        nowMs={nowMs}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function BoardTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'type-label-sm cursor-pointer rounded-hisabi-md px-hisabi-md py-2 font-bold transition-colors',
        active
          ? 'bg-hisabi-primary text-hisabi-on-primary'
          : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
      )}
    >
      {children}
    </button>
  )
}

function StatChip({ icon: Icon, label, value }) {
  return (
    <div className="inline-flex items-center gap-hisabi-sm rounded-hisabi-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest px-hisabi-md py-2">
      <Icon className="size-4 text-hisabi-teal" aria-hidden />
      <span className="type-label-sm text-hisabi-on-surface-variant">{label}</span>
      <span className="type-label-md font-bold text-hisabi-on-surface" dir="ltr">
        {value}
      </span>
    </div>
  )
}

function KanbanColumn({
  title,
  empty,
  status,
  orders,
  locale,
  nowMs,
  actionLabel,
  busyId,
  onAction,
  onDropStatus,
}) {
  const [over, setOver] = useState(false)

  return (
    <section
      className={cn(
        'flex min-h-72 flex-col rounded-hisabi-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-low p-hisabi-md',
        over && 'ring-2 ring-hisabi-teal/40',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const invoiceId = event.dataTransfer.getData('text/invoice-id')
        if (invoiceId) onDropStatus(invoiceId)
      }}
    >
      <div className="mb-hisabi-md flex items-center justify-between gap-hisabi-sm">
        <h2 className="type-headline-sm font-bold text-hisabi-on-surface">
          {title}
        </h2>
        <span
          className="type-label-sm rounded-hisabi-md bg-hisabi-surface-container-lowest px-hisabi-sm py-1 font-bold text-hisabi-teal"
          dir="ltr"
        >
          {orders.length}
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="type-body-sm text-hisabi-on-surface-variant">{empty}</p>
      ) : (
        <div className="flex flex-col gap-hisabi-sm">
          {orders.map((order) => (
            <KitchenOrderCard
              key={order.invoiceId}
              order={order}
              locale={locale}
              nowMs={nowMs}
              actionLabel={actionLabel}
              actionPending={busyId === order.invoiceId}
              draggable
              onAction={() => onAction(order.invoiceId)}
            />
          ))}
        </div>
      )}
      <span className="sr-only">{status}</span>
    </section>
  )
}

function moveOrderInBoardData(old, invoiceId, nextStatus) {
  const buckets = {
    pending: [...(old.pending ?? [])],
    preparing: [...(old.preparing ?? [])],
    ready: [...(old.ready ?? [])],
    completed: [...(old.completed ?? [])],
  }
  /** @type {Record<string, unknown> | null} */
  let found = null
  for (const key of ['pending', 'preparing', 'ready']) {
    const idx = buckets[key].findIndex((o) => o.invoiceId === invoiceId)
    if (idx >= 0) {
      found = { ...buckets[key][idx], status: nextStatus }
      buckets[key].splice(idx, 1)
      break
    }
  }
  if (!found) return old
  if (nextStatus === 'completed') {
    found.completedAt = new Date().toISOString()
    buckets.completed = [found, ...buckets.completed]
  } else if (buckets[nextStatus]) {
    buckets[nextStatus].push(found)
  }
  const activeCount =
    buckets.pending.length + buckets.preparing.length + buckets.ready.length
  return {
    ...old,
    ...buckets,
    stats: {
      ...(old.stats ?? {}),
      activeCount,
      completedCount: buckets.completed.length,
    },
  }
}
