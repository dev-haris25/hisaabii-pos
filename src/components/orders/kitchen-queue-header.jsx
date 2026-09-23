'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner'
import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import { Link, useRouter } from '@/i18n/navigation'
import { authPost } from '@/lib/api/auth-client'
import { logoutOnlineOrOffline } from '@/lib/desktop/desktop-auth'
import { useAuthStore } from '@/stores/auth-store'

/**
 * @param {{
 *   staffName?: string
 *   restaurantName?: string
 *   showGoToDashboard?: boolean
 *   showStaffName?: boolean
 * }} props
 */
export function KitchenQueueHeader({
  staffName = '',
  restaurantName = '',
  showGoToDashboard = false,
  showStaffName = true,
}) {
  const t = useTranslations('KitchenQueue')
  const router = useRouter()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)

  const logoutMutation = useMutation({
    mutationFn: () => logoutOnlineOrOffline(),
    onSuccess: () => {
      setUser(null)
      queryClient.clear()
      router.replace('/login')
    },
  })

  return (
    <header className="border-hisabi-outline-variant/40 shadow-hisabi-1 sticky top-0 z-30 grid min-h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-hisabi-md border-b bg-hisabi-surface-container-lowest px-hisabi-md py-2 md:px-hisabi-lg">
      <div className="flex min-w-0 items-center gap-hisabi-sm justify-self-start">
        {showStaffName && staffName ? (
          <p className="type-label-md min-w-0 truncate font-bold text-hisabi-teal">
            {staffName}
          </p>
        ) : null}
        {showGoToDashboard ? (
          <Link
            href="/"
            aria-label={t('goToDashboard')}
            className="type-label-sm text-hisabi-on-surface-variant hover:bg-hisabi-surface-container inline-flex shrink-0 cursor-pointer items-center gap-hisabi-xs rounded-hisabi-xl px-hisabi-md py-2 font-bold transition-colors"
          >
            <LayoutDashboard className="size-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{t('goToDashboard')}</span>
          </Link>
        ) : null}
      </div>
      {restaurantName ? (
        <p className="type-label-md max-w-[220px] justify-self-center truncate text-center font-bold text-hisabi-teal">
          {restaurantName}
        </p>
      ) : (
        <span />
      )}
      <div className="flex min-w-0 items-center justify-end gap-hisabi-sm justify-self-end">
        <AuthLocaleToggle />
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          aria-busy={logoutMutation.isPending}
          className="type-label-sm text-hisabi-on-surface-variant hover:bg-hisabi-surface-container inline-flex cursor-pointer items-center gap-hisabi-xs rounded-hisabi-xl px-hisabi-md py-2 font-bold transition-colors disabled:opacity-60"
        >
          {logoutMutation.isPending ? (
            <AuthButtonSpinner />
          ) : (
            <LogOut className="size-4 shrink-0" aria-hidden />
          )}
          {t('logout')}
        </button>
      </div>
    </header>
  )
}
