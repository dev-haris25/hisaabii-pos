'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Receipt } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AppLoader } from '@/components/app-loader'
import { TABLE_SESSION_ALERTS_QUERY_KEY } from '@/components/app-shell/table-session-alert-toast-listener'
import { HisabiSheet } from '@/components/shared/hisabi-sheet'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { TableSessionDetailView } from './[id]/table-session-detail-view'
import { TableSessionReceiptModal } from './table-session-receipt-modal'
import { Link } from '@/i18n/navigation'
import { AuthApiError, authGet, authPost } from '@/lib/api/auth-client'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const POLL_MS = 4000

/**
 * Live floor grid for open sessions / waiter & bill alerts.
 * Available/Occupied uses Table.status only — badges are separate.
 * Live toasts come from TableSessionAlertToastListener (app-wide).
 *
 * @param {{ embedded?: boolean }} [props]
 */
export function TableSessionsFloorView({ embedded = false }) {
  const t = useTranslations('TableSessions')
  const tErr = useTranslations('AuthErrors')
  const ability = useAppAbility()
  const canManageTables = ability.can('read', 'ETable')
  const canUpdateSession = ability.can('update', 'TableSession')
  const queryClient = useQueryClient()
  const profileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? s.user?.businessProfileId ?? null,
  )
  const staffName = useAuthStore((s) => String(s.user?.name ?? ''))

  const [openSessionId, setOpenSessionId] = useState(
    /** @type {string | null} */ (null),
  )
  const [openSessionTableName, setOpenSessionTableName] = useState('')
  const [receipt, setReceipt] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )

  const query = useQuery({
    queryKey: ['table-sessions-floor', profileId],
    queryFn: () => authGet('/table-sessions'),
    refetchInterval: openSessionId || receipt ? false : POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: !openSessionId && !receipt,
  })

  const tables = Array.isArray(query.data?.tables) ? query.data.tables : []

  const resolveMutation = useMutation({
    mutationFn: (/** @type {string} */ tableId) =>
      authPost(`/tables/${tableId}/resolve-waiter-call`, {}),
    onSuccess: () => {
      toast.success(t('resolveWaiterSuccess'))
      void queryClient.invalidateQueries({ queryKey: ['table-sessions-floor'] })
      void queryClient.invalidateQueries({
        queryKey: TABLE_SESSION_ALERTS_QUERY_KEY,
      })
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  if (query.isLoading && tables.length === 0) {
    return (
      <div className="flex justify-center py-hisabi-xxl">
        <AppLoader />
      </div>
    )
  }

  if (query.isError) {
    const code =
      query.error instanceof AuthApiError ? query.error.code : undefined
    return (
      <p className="type-body-md text-hisabi-error py-hisabi-xxl text-center">
        {code ? tErr(code) : tErr('generic')}
      </p>
    )
  }

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-hisabi-container space-y-hisabi-xl',
        !embedded && 'pb-hisabi-xxl',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-hisabi-md">
        <div className="space-y-1">
          <h1
            className={cn(
              'text-hisabi-on-surface tracking-tight',
              embedded ? 'type-headline-md font-semibold' : 'type-headline-xl',
            )}
          >
            {t('title')}
          </h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-2xl">
            {t('subtitle')}
          </p>
        </div>
        {canManageTables ? (
          <Link
            href="/tables"
            className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
          >
            {t('manageTables')}
          </Link>
        ) : null}
      </header>

      {tables.length === 0 ? (
        <p className="type-body-md text-hisabi-on-surface-variant py-hisabi-xxl text-center">
          {t('empty')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((row) => {
            const id = String(row.id)
            const status = String(row.status ?? 'available')
            const occupied = status === 'occupied'
            const open =
              row.openSession && typeof row.openSession === 'object'
                ? row.openSession
                : null
            const sessionId =
              open?.sessionId != null ? String(open.sessionId) : null
            const billRequested = Boolean(open?.billRequested)
            const waiterActive = Boolean(row.waiterCallActive)
            const roundCount =
              typeof open?.roundCount === 'number' ? open.roundCount : 0
            const alert = billRequested || waiterActive
            const tableName = String(row.name ?? '')

            const cardInner = (
              <>
                <div className="flex items-start justify-between gap-hisabi-sm">
                  <h2 className="type-title-md text-hisabi-on-surface font-semibold">
                    {tableName}
                  </h2>
                  <span
                    className={cn(
                      'type-label-sm inline-flex shrink-0 rounded-full px-hisabi-sm py-0.5 font-medium',
                      occupied
                        ? 'bg-hisabi-error/10 text-hisabi-error'
                        : 'bg-hisabi-teal-container/30 text-hisabi-teal',
                    )}
                  >
                    {occupied ? t('statusOccupied') : t('statusAvailable')}
                  </span>
                </div>

                {occupied && roundCount > 0 ? (
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('roundsCount', { count: roundCount })}
                  </p>
                ) : null}

                {(billRequested || waiterActive) && (
                  <div className="flex flex-wrap gap-hisabi-xs">
                    {billRequested ? (
                      <span className="type-label-sm inline-flex animate-pulse items-center gap-1 rounded-full border border-hisabi-error/40 bg-hisabi-error/10 px-hisabi-sm py-0.5 font-semibold text-hisabi-error">
                        <Receipt className="size-3.5" aria-hidden />
                        {t('badgeBillRequested')}
                      </span>
                    ) : null}
                    {waiterActive ? (
                      <span className="type-label-sm inline-flex animate-pulse items-center gap-1 rounded-full border border-hisabi-error/40 bg-hisabi-error/10 px-hisabi-sm py-0.5 font-semibold text-hisabi-error">
                        <Bell className="size-3.5" aria-hidden />
                        {t('badgeWaiterRequested')}
                      </span>
                    ) : null}
                  </div>
                )}

                {sessionId ? (
                  <p className="type-label-sm text-hisabi-primary font-medium">
                    {t('tapForDetail')}
                  </p>
                ) : null}

                {!sessionId && waiterActive && canUpdateSession ? (
                  <button
                    type="button"
                    disabled={resolveMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      resolveMutation.mutate(id)
                    }}
                    className="type-label-sm border-hisabi-outline-variant/40 text-hisabi-on-surface inline-flex min-h-10 items-center justify-center rounded-lg border px-hisabi-md font-semibold transition hover:bg-hisabi-surface-container disabled:opacity-50"
                  >
                    {resolveMutation.isPending
                      ? t('resolveWaiterPending')
                      : t('resolveWaiter')}
                  </button>
                ) : null}
              </>
            )

            const className = cn(
              'flex flex-col gap-hisabi-sm rounded-hisabi-xl border p-hisabi-lg text-start transition',
              alert
                ? 'border-hisabi-error/50 bg-hisabi-error/5'
                : 'border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest',
              sessionId
                ? 'hover:border-hisabi-primary/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hisabi-primary/40'
                : '',
            )

            if (sessionId) {
              return (
                <button
                  key={id}
                  type="button"
                  className={className}
                  onClick={() => {
                    setOpenSessionTableName(tableName)
                    setOpenSessionId(sessionId)
                    void queryClient.invalidateQueries({
                      queryKey: ['table-session-detail', sessionId],
                    })
                  }}
                >
                  {cardInner}
                </button>
              )
            }

            return (
              <div key={id} className={className}>
                {cardInner}
              </div>
            )
          })}
        </div>
      )}

      <HisabiSheet
        open={Boolean(openSessionId)}
        onOpenChange={(open) => {
          if (!open) {
            setOpenSessionId(null)
            setOpenSessionTableName('')
          }
        }}
        title={t('detailTitle', { name: openSessionTableName || '—' })}
        closeLabel={t('close')}
        panelClassName="max-w-lg"
      >
        {openSessionId ? (
          <TableSessionDetailView
            sessionId={openSessionId}
            embedded
            onClose={() => {
              setOpenSessionId(null)
              setOpenSessionTableName('')
            }}
            onSettled={(invoice) => {
              setOpenSessionId(null)
              setOpenSessionTableName('')
              setReceipt(invoice)
            }}
          />
        ) : null}
      </HisabiSheet>

      {receipt ? (
        <TableSessionReceiptModal
          invoice={receipt}
          staffName={staffName}
          restaurantName={
            typeof receipt.sellerName === 'string'
              ? String(receipt.sellerName)
              : ''
          }
          onClose={() => setReceipt(null)}
        />
      ) : null}
    </div>
  )
}
