'use client'

import { useMutation } from '@tanstack/react-query'
import { FileText, LayoutDashboard, LogOut } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'

import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner'
import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import {
  TableSessionAlertToastListener,
  useTableSessionAlertCount,
} from '@/components/app-shell/table-session-alert-toast-listener'
import { PosCheckoutView } from './pos-checkout-view'
import { TableSessionsFloorView } from '../(app)/table-sessions/table-sessions-floor-view'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { logoutOnlineOrOffline } from '@/lib/desktop/desktop-auth'
import { cn } from '@/lib/utils'

/**
 * POS workspace with Register / Tables tabs (URL: ?tab=tables).
 *
 * @param {{
 *   staffName: string
 *   restaurantName: string
 *   restaurantLogoUrl: string | null
 *   returnToInvoices?: boolean
 *   canUseTablesTab?: boolean
 * }} props
 */
export function PosWorkspaceView({
  staffName,
  restaurantName,
  restaurantLogoUrl,
  returnToInvoices = false,
  canUseTablesTab = false,
}) {
  const t = useTranslations('Pos')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeTab = useMemo(() => {
    if (canUseTablesTab && searchParams.get('tab') === 'tables') return 'tables'
    return 'pos'
  }, [canUseTablesTab, searchParams])

  useEffect(() => {
    if (canUseTablesTab) return
    if (searchParams.get('tab') !== 'tables') return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('tab')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [canUseTablesTab, pathname, router, searchParams])

  const setTab = useCallback(
    (/** @type {'pos' | 'tables'} */ next) => {
      if (next === 'tables' && !canUseTablesTab) return
      const params = new URLSearchParams(searchParams.toString())
      if (next === 'tables') params.set('tab', 'tables')
      else params.delete('tab')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    },
    [canUseTablesTab, pathname, router, searchParams],
  )

  const logoutMutation = useMutation({
    mutationFn: () => logoutOnlineOrOffline(),
  })

  const tableAlertCount = useTableSessionAlertCount({
    disabled: !canUseTablesTab,
  })

  return (
    <div className="type-body-md text-hisabi-on-surface flex min-h-dvh flex-col bg-hisabi-background">
      <TableSessionAlertToastListener />
      <header className="border-hisabi-outline-variant/40 shadow-hisabi-1 sticky top-0 z-30 shrink-0 border-b bg-hisabi-surface-container-lowest">
        <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center gap-hisabi-md px-hisabi-md py-2 md:px-hisabi-lg">
          <div className="flex min-w-0 items-center gap-hisabi-sm justify-self-start">
            <p className="type-label-md min-w-0 truncate font-bold text-hisabi-teal">
              {staffName}
            </p>
            <Link
              href={returnToInvoices ? '/invoices' : '/'}
              aria-label={
                returnToInvoices ? t('viewInvoices') : t('goToDashboard')
              }
              className="type-label-sm text-hisabi-on-surface-variant hover:bg-hisabi-surface-container inline-flex shrink-0 cursor-pointer items-center gap-hisabi-xs rounded-xl px-hisabi-md py-2 font-bold transition-colors"
            >
              {returnToInvoices ? (
                <FileText className="size-4 shrink-0" aria-hidden />
              ) : (
                <LayoutDashboard className="size-4 shrink-0" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {returnToInvoices ? t('viewInvoices') : t('goToDashboard')}
              </span>
            </Link>
          </div>
          {restaurantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated restaurant logo
            <img
              src={restaurantLogoUrl}
              alt={restaurantName || ''}
              className="h-8 max-w-[140px] justify-self-center object-contain"
            />
          ) : (
            <p className="type-label-md max-w-[220px] justify-self-center truncate text-center font-bold text-hisabi-teal">
              {restaurantName || t('title')}
            </p>
          )}
          <div className="flex min-w-0 items-center justify-end gap-hisabi-sm justify-self-end">
            <AuthLocaleToggle />
            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              aria-busy={logoutMutation.isPending}
              className="type-label-sm text-hisabi-on-surface-variant hover:bg-hisabi-surface-container inline-flex cursor-pointer items-center gap-hisabi-xs rounded-xl px-hisabi-md py-2 font-bold transition-colors disabled:opacity-60"
            >
              {logoutMutation.isPending ? (
                <AuthButtonSpinner />
              ) : (
                <LogOut className="size-4 shrink-0" aria-hidden />
              )}
              {t('logout')}
            </button>
          </div>
        </div>

        {canUseTablesTab ? (
          <div className="flex justify-center px-hisabi-md pb-hisabi-sm">
            <div
              className="flex w-full max-w-md rounded-lg border border-hisabi-outline-variant/60 bg-white p-1"
              role="tablist"
              aria-label={t('workspaceTabsAria')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'pos'}
                onClick={() => setTab('pos')}
                className={cn(
                  'type-label-sm flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-lg px-hisabi-md font-bold transition-colors',
                  activeTab === 'pos'
                    ? 'bg-hisabi-primary-container text-white'
                    : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                )}
              >
                {t('tabPos')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'tables'}
                aria-label={
                  tableAlertCount > 0
                    ? t('tabTablesAlertAria', { count: tableAlertCount })
                    : t('tabTables')
                }
                onClick={() => setTab('tables')}
                className={cn(
                  'type-label-sm relative flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-hisabi-xs rounded-lg px-hisabi-md font-bold transition-colors',
                  activeTab === 'tables'
                    ? 'bg-hisabi-primary-container text-white'
                    : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                )}
              >
                {t('tabTables')}
                {tableAlertCount > 0 ? (
                  <span
                    aria-hidden
                    className="type-label-sm flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-hisabi-error px-1 font-bold tabular-nums text-white"
                  >
                    {tableAlertCount > 99 ? '99+' : tableAlertCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        ) : null}
      </header>

      {activeTab === 'tables' ? (
        <div className="flex-1 overflow-auto p-hisabi-md md:p-hisabi-lg">
          <TableSessionsFloorView embedded />
        </div>
      ) : (
        <PosCheckoutView
          staffName={staffName}
          restaurantName={restaurantName}
          restaurantLogoUrl={restaurantLogoUrl}
          returnToInvoices={returnToInvoices}
          embedded
        />
      )}
    </div>
  )
}
