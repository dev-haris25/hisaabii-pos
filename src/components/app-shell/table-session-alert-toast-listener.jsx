'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { useAppAbility } from '@/components/rbac/ability-provider'
import { NOTIFICATION_TOASTER_ID } from '@/components/app-shell/notification-toast-listener'
import { authGet } from '@/lib/api/auth-client'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { useAuthStore } from '@/stores/auth-store'

export const TABLE_SESSION_ALERTS_QUERY_KEY = ['table-session-alerts']

/**
 * @param {string | null | undefined} activeBusinessProfileId
 */
export function tableSessionAlertsQueryKey(activeBusinessProfileId) {
  return [...TABLE_SESSION_ALERTS_QUERY_KEY, activeBusinessProfileId ?? null]
}

export const TABLE_SESSION_ALERTS_POLL_MS = 4000

/**
 * @param {{ disabled?: boolean }} [options]
 */
export function useTableSessionAlertsQuery({ disabled = false } = {}) {
  const ability = useAppAbility()
  const canReadSessions =
    hasFullAccess(ability) || ability.can('read', 'TableSession')
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? s.user?.businessProfileId ?? null,
  )

  const isEnabled =
    Boolean(activeBusinessProfileId) && canReadSessions && !disabled

  const query = useQuery({
    queryKey: tableSessionAlertsQueryKey(activeBusinessProfileId),
    queryFn: async () => authGet('/table-sessions/notifications'),
    refetchInterval: TABLE_SESSION_ALERTS_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    enabled: isEnabled,
  })

  return { ...query, isEnabled }
}

/**
 * Open table calls (waiter and/or bill), one count per table until resolved.
 *
 * @param {{ disabled?: boolean }} [options]
 */
export function useTableSessionAlertCount({ disabled = false } = {}) {
  const { data } = useTableSessionAlertsQuery({ disabled })
  const total = data?.counts?.total
  return typeof total === 'number' && total > 0 ? total : 0
}

/**
 * Ephemeral live toasts for call-waiter / ask-for-bill.
 * Polls the lightweight alerts endpoint; primes on first fetch so late logins
 * do not see backlog toasts. Never writes to the in-app notifications sheet.
 *
 * @param {{ disabled?: boolean }} [props]
 */
export function TableSessionAlertToastListener({ disabled = false }) {
  const t = useTranslations('TableSessions')
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? s.user?.businessProfileId ?? null,
  )

  /** @type {React.MutableRefObject<Map<string, { billAt: string | null, waiterAt: string | null }>>} */
  const seenRef = useRef(new Map())
  const primedRef = useRef(false)

  useEffect(() => {
    seenRef.current = new Map()
    primedRef.current = false
  }, [activeBusinessProfileId])

  const { data, isSuccess, isEnabled } = useTableSessionAlertsQuery({ disabled })

  useEffect(() => {
    if (!isEnabled || !isSuccess) return

    const rows = Array.isArray(data?.notifications) ? data.notifications : []

    /** @type {Map<string, { billAt: string | null, waiterAt: string | null }>} */
    const nextSeen = new Map()

    for (const row of rows) {
      const tableId = String(row.tableId ?? '')
      if (!tableId) continue

      const billAt =
        row.billRequested && typeof row.billRequestedAt === 'string'
          ? row.billRequestedAt
          : null
      const waiterAt =
        row.waiterCallActive && typeof row.waiterCallRequestedAt === 'string'
          ? row.waiterCallRequestedAt
          : null

      nextSeen.set(tableId, { billAt, waiterAt })

      if (!primedRef.current) continue

      const prev = seenRef.current.get(tableId) ?? {
        billAt: null,
        waiterAt: null,
      }
      const name = String(row.tableName ?? '')

      if (billAt && billAt !== prev.billAt) {
        toast.message(t('toastBillRequested', { name }), {
          description: t('toastBillRequestedBody'),
          toasterId: NOTIFICATION_TOASTER_ID,
          duration: 8000,
        })
      }
      if (waiterAt && waiterAt !== prev.waiterAt) {
        toast.message(t('toastWaiterRequested', { name }), {
          description: t('toastWaiterRequestedBody'),
          toasterId: NOTIFICATION_TOASTER_ID,
          duration: 8000,
        })
      }
    }

    // Clear timestamps for tables that dropped off the alert list so a
    // re-request after resolve still toasts.
    seenRef.current = nextSeen
    primedRef.current = true
  }, [data, isEnabled, isSuccess, t])

  return null
}
