'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  NOTIFICATIONS_POLL_INTERVAL_MS,
  notificationsQueryKey,
} from '@/components/app-shell/notification-toast-listener'
import { Link } from '@/i18n/navigation'
import { authGet, authPatch } from '@/lib/api/auth-client'
import { resolveNotificationDisplayTitle } from '@/lib/notifications/resolve-notification-display-title'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

export function NotificationsBell({ disabled = false }) {
  const t = useTranslations('AppShell')
  const tNotif = useTranslations('InAppNotifications')
  const queryClient = useQueryClient()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const queryKey = notificationsQueryKey(activeBusinessProfileId)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  const notificationsQuery = useQuery({
    queryKey,
    queryFn: async () => authGet('/notifications'),
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    enabled: Boolean(activeBusinessProfileId) && !disabled,
  })

  const unreadCount = notificationsQuery.data?.unreadCount ?? 0
  const notifications = notificationsQuery.data?.notifications ?? []

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onDocClick(e) {
      const target = /** @type {Node | null} */ (e.target)
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  async function markRead(id) {
    const previous = queryClient.getQueryData(queryKey)
    const now = new Date().toISOString()
    queryClient.setQueryData(queryKey, (prev) => {
      if (!prev || typeof prev !== 'object') return prev
      let decremented = false
      const next = (prev.notifications ?? []).map((n) => {
        if (n.id !== id || n.readAt) return n
        decremented = true
        return { ...n, readAt: now }
      })
      return {
        ...prev,
        notifications: next,
        unreadCount: decremented
          ? Math.max(0, (prev.unreadCount ?? 0) - 1)
          : prev.unreadCount,
      }
    })
    try {
      await authPatch('/notifications', { id })
    } catch {
      queryClient.setQueryData(queryKey, previous)
    }
  }

  async function markAllRead() {
    const previous = queryClient.getQueryData(queryKey)
    const now = new Date().toISOString()
    queryClient.setQueryData(queryKey, (prev) => {
      if (!prev || typeof prev !== 'object') return prev
      return {
        ...prev,
        notifications: (prev.notifications ?? []).map((n) =>
          n.readAt ? n : { ...n, readAt: now },
        ),
        unreadCount: 0,
      }
    })
    try {
      await authPatch('/notifications', { all: true })
    } catch {
      queryClient.setQueryData(queryKey, previous)
    }
  }

  const panel =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            className="border-hisabi-outline-variant fixed end-4 top-20 z-[250] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-hisabi-surface shadow-lg md:end-6"
            role="dialog"
            aria-label={t('notifications')}
          >
            <div className="flex items-center justify-between border-b border-hisabi-outline-variant/60 px-3 py-2">
              <p className="type-label-md font-semibold">{t('notifications')}</p>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="text-hisabi-primary text-xs font-medium hover:underline"
                  onClick={() => void markAllRead()}
                >
                  {t('markAllRead')}
                </button>
              ) : null}
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="text-hisabi-on-surface-variant px-3 py-6 text-center text-sm">
                  {t('noNotifications')}
                </li>
              ) : (
                notifications.map((n) => {
                  const title = resolveNotificationDisplayTitle(tNotif, n, {
                    has: (key) => tNotif.has(key),
                  })
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        'border-b border-hisabi-outline-variant/40 px-3 py-2 last:border-b-0',
                        !n.readAt && 'bg-hisabi-primary-container/15',
                      )}
                    >
                      {n.link ? (
                        <Link
                          href={n.link}
                          className="block text-start"
                          onClick={() => {
                            void markRead(n.id)
                            setOpen(false)
                          }}
                        >
                          <p className="type-label-sm font-semibold">{title}</p>
                          <p className="type-body-sm text-hisabi-on-surface-variant mt-0.5">
                            {n.message}
                          </p>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="block w-full text-start"
                          onClick={() => void markRead(n.id)}
                        >
                          <p className="type-label-sm font-semibold">{title}</p>
                          <p className="type-body-sm text-hisabi-on-surface-variant mt-0.5">
                            {n.message}
                          </p>
                        </button>
                      )}
                    </li>
                  )
                })
              )}
            </ul>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        className="text-hisabi-outline hover:bg-hisabi-surface-container relative inline-flex size-8 items-center justify-center rounded-lg transition-colors md:size-auto md:p-1"
        aria-label={t('notifications')}
        title={t('notifications')}
        aria-expanded={open}
        disabled={disabled || !activeBusinessProfileId}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 ? (
          <span className="bg-hisabi-error absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
      {panel}
    </div>
  )
}
