'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { authGet } from '@/lib/api/auth-client'
import { resolveNotificationDisplayTitle } from '@/lib/notifications/resolve-notification-display-title'
import { notificationToastFn } from '@/lib/notifications/notification-toast-severity'
import { useRouter } from '@/i18n/navigation'
import { useAuthStore } from '@/stores/auth-store'

export const NOTIFICATIONS_QUERY_KEY = ['notifications']

/**
 * @param {string | null | undefined} activeBusinessProfileId
 */
export function notificationsQueryKey(activeBusinessProfileId) {
  return ['notifications', activeBusinessProfileId ?? null]
}

export const NOTIFICATION_TOASTER_ID = 'notifications'
export const NOTIFICATIONS_POLL_INTERVAL_MS = 5000

/** Shows toasts when new in-app notifications arrive. */
export function NotificationToastListener({ disabled = false }) {
  const tNotif = useTranslations('InAppNotifications')
  const router = useRouter()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const seenIdsRef = useRef(/** @type {Set<string>} */ (new Set()))
  const initializedRef = useRef(false)

  useEffect(() => {
    seenIdsRef.current = new Set()
    initializedRef.current = false
  }, [activeBusinessProfileId])

  const { data } = useQuery({
    queryKey: notificationsQueryKey(activeBusinessProfileId),
    queryFn: async () => authGet('/notifications'),
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    enabled: Boolean(activeBusinessProfileId) && !disabled,
  })

  useEffect(() => {
    const notifications = data?.notifications ?? []
    if (!data) return

    if (!initializedRef.current) {
      for (const n of notifications) {
        seenIdsRef.current.add(n.id)
      }
      initializedRef.current = true
      return
    }

    for (const n of notifications) {
      if (seenIdsRef.current.has(n.id)) continue
      seenIdsRef.current.add(n.id)

      const toastFn = notificationToastFn(n.type)
      const link = typeof n.link === 'string' && n.link.length > 0 ? n.link : null
      const title = resolveNotificationDisplayTitle(tNotif, n, {
        has: (key) => tNotif.has(key),
      })

      toastFn(title, {
        description: n.message,
        toasterId: NOTIFICATION_TOASTER_ID,
        duration: 8000,
        ...(link
          ? {
              action: {
                label: 'Open',
                onClick: () => router.push(link),
              },
            }
          : {}),
      })
    }
  }, [data, router, tNotif])

  return null
}
