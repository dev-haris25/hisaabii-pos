'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronUp,
  Building2,
  FileBarChart,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Monitor,
  CookingPot,
  Tv,
  Search,
  Settings,
  Users,
  UtensilsCrossed,
  UserCircle,
  Warehouse,
  TicketPercent,
  BadgePercent,
  Gift,
  Table2,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner'
import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { GlobalSearch } from '@/components/app-shell/global-search'
import { NotificationsBell } from '@/components/app-shell/notifications-bell'
import { NotificationToastListener } from '@/components/app-shell/notification-toast-listener'
import { TableSessionAlertToastListener } from '@/components/app-shell/table-session-alert-toast-listener'
import { RestaurantSwitcher } from '@/components/app-shell/restaurant-switcher'
import { ZatcaOnboardingModal } from '@/components/app-shell/zatca-onboarding-modal'
import { ProductTourProvider } from '@/components/product-tour/product-tour-provider'
import { AbilityProvider, useOptionalAppAbility } from '@/components/rbac/ability-provider'
import { useIsHisabiDesktop } from '@/hooks/use-is-hisabi-desktop'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { authGet, authPost } from '@/lib/api/auth-client'
import { logoutSession } from '@/lib/desktop/desktop-auth'
import { resolveActiveSidebarChildHref } from '@/lib/app-shell/sidebar-nav'
import { tourIdForSidebarHref } from '@/lib/product-tour/tour-dom-ids'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import {
  canAccessSidebarHref,
  filterSidebarChildren,
} from '@/lib/rbac/sidebar-permissions'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const SIDEBAR_BADGE_TONES = {
  gold: 'bg-hisabi-gold text-hisabi-on-gold',
  error: 'bg-hisabi-error text-white',
}

/** Same pill shape as the header notifications unread circle. */
/** @param {{ count: number, ariaLabel?: string, tone?: 'gold' | 'error' }} props */
function SidebarCountBadge({ count, ariaLabel, tone = 'gold' }) {
  if (!count || count <= 0) return null
  const label = count > 9 ? '9+' : String(count)
  return (
    <span
      className={cn(
        'flex min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4',
        SIDEBAR_BADGE_TONES[tone] ?? SIDEBAR_BADGE_TONES.gold,
      )}
      aria-label={ariaLabel}
    >
      {label}
    </span>
  )
}

/**
 * App shell: primary sidebar + sticky header (Hisabi AppShell group pattern).
 * Nav is filtered by CASL ability rules.
 *
 * @param {{
 *   children: import('react').ReactNode
 *   userName: string
 *   userEmail?: string | null
 *   contentClassName?: string
 *   hasBusinessProfile?: boolean
 *   zatcaOnboardingSkippedEffective?: boolean
 *   abilityRules?: Array<Record<string, unknown>>
 *   accessibleBusinessProfileCount?: number
 *   roleName?: string | null
 *   isRestaurantOwner?: boolean
 * }} props
 */
export function AdminAppShell({
  children,
  userName,
  userEmail = '',
  contentClassName,
  hasBusinessProfile = true,
  zatcaOnboardingSkippedEffective = false,
  abilityRules = [],
  accessibleBusinessProfileCount = 1,
  roleName = null,
  isRestaurantOwner = false,
}) {
  return (
    <AbilityProvider rules={abilityRules}>
      <AdminAppShellInner
        userName={userName}
        userEmail={userEmail}
        contentClassName={contentClassName}
        hasBusinessProfile={hasBusinessProfile}
        zatcaOnboardingSkippedEffective={zatcaOnboardingSkippedEffective}
        accessibleBusinessProfileCount={accessibleBusinessProfileCount}
        roleName={roleName}
        isRestaurantOwner={isRestaurantOwner}
      >
        {children}
      </AdminAppShellInner>
    </AbilityProvider>
  )
}

/**
 * @param {{
 *   children: import('react').ReactNode
 *   userName: string
 *   userEmail?: string | null
 *   contentClassName?: string
 *   hasBusinessProfile?: boolean
 *   zatcaOnboardingSkippedEffective?: boolean
 *   accessibleBusinessProfileCount?: number
 *   roleName?: string | null
 *   isRestaurantOwner?: boolean
 * }} props
 */
function AdminAppShellInner({
  children,
  userName,
  userEmail = '',
  contentClassName,
  hasBusinessProfile = true,
  zatcaOnboardingSkippedEffective = false,
  accessibleBusinessProfileCount = 1,
  roleName = null,
  isRestaurantOwner = false,
}) {
  const t = useTranslations('AppShell')
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const desktop = useIsHisabiDesktop()
  const setUser = useAuthStore((s) => s.setUser)
  const liveZatcaSkipped = useAuthStore(
    (s) => s.user?.zatcaOnboardingSkippedEffective,
  )
  const liveNeedsZatca = useAuthStore((s) => s.user?.needsZatcaOnboarding)
  const ability = useOptionalAppAbility()
  const isRtl = useIsRtl()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [zatcaModalOpen, setZatcaModalOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState(() => ({
    menu: pathname.startsWith('/menu'),
    invoices: pathname.startsWith('/invoices'),
    restaurants: pathname.startsWith('/restaurants'),
    hr: pathname.startsWith('/hr'),
    reports: pathname.startsWith('/reports'),
    loyalty: pathname.startsWith('/loyalty'),
  }))

  const openSidebarSection = useCallback((sectionId) => {
    setOpenGroups((prev) => ({ ...prev, [sectionId]: true }))
  }, [])

  const collapseAllSidebarSections = useCallback(() => {
    setOpenGroups({
      menu: false,
      invoices: false,
      restaurants: false,
      hr: false,
      reports: false,
      loyalty: false,
    })
  }, [])

  const productTourShell = useMemo(
    () => ({
      openSidebarSection,
      collapseAllSidebarSections,
      permissionsReady: true,
      appReady: hasBusinessProfile === true,
    }),
    [openSidebarSection, collapseAllSidebarSections, hasBusinessProfile],
  )

  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const { data: visaExpiryData } = useQuery({
    queryKey: ['visa-expiry-count', activeBusinessProfileId],
    queryFn: async () => authGet('/hr/employees/visa-expiry-count'),
    enabled: hasBusinessProfile === true && Boolean(activeBusinessProfileId),
    staleTime: 60_000,
  })
  const visaExpiryCount = visaExpiryData?.count ?? 0

  const { data: lowStockData } = useQuery({
    queryKey: ['low-stock-count', activeBusinessProfileId],
    queryFn: async () => authGet('/stock/items/low-stock-count'),
    enabled:
      hasBusinessProfile === true &&
      Boolean(activeBusinessProfileId) &&
      Boolean(ability?.can('read', 'StockItem')),
    staleTime: 60_000,
  })
  const lowStockCount = lowStockData?.count ?? 0

  const canReadTableSessions =
    hasFullAccess(ability) || Boolean(ability?.can('read', 'TableSession'))
  const { data: activeTablesData } = useQuery({
    queryKey: ['tables-active-exists', activeBusinessProfileId],
    queryFn: async () => authGet('/tables/active-exists'),
    enabled:
      hasBusinessProfile === true &&
      Boolean(activeBusinessProfileId) &&
      canReadTableSessions,
    staleTime: 30_000,
  })
  const hasActiveTables = activeTablesData?.hasActiveTables === true

  const skippedEffective =
    typeof liveZatcaSkipped === 'boolean'
      ? liveZatcaSkipped
      : zatcaOnboardingSkippedEffective
  const zatcaNotDone =
    liveNeedsZatca === true || skippedEffective === true

  const canManageBusiness =
    hasFullAccess(ability) ||
    ability.can('update', 'BusinessProfile') ||
    ability.can('create', 'BusinessProfile')

  const showZatcaOnboardingReminder =
    canManageBusiness && hasBusinessProfile === true && zatcaNotDone

  const showRestaurantSwitcher =
    hasBusinessProfile &&
    (accessibleBusinessProfileCount > 1 || isRestaurantOwner)

  const navItems = useMemo(() => {
    /** @type {Array<any>} */
    const all = [
      {
        id: 'dashboard',
        href: '/',
        labelKey: 'navDashboard',
        exact: true,
        icon: LayoutDashboard,
      },
      {
        id: 'restaurants',
        labelKey: 'navRestaurants',
        icon: Building2,
        isGroupActive: (p) => p === '/restaurants' || p.startsWith('/restaurants/'),
        children: [
          { href: '/restaurants', labelKey: 'subRestaurantsList' },
          { href: '/restaurants/create', labelKey: 'navCreateRestaurant' },
        ],
      },
      {
        id: 'pos',
        href: '/pos',
        labelKey: 'navPos',
        icon: Monitor,
      },
      {
        id: 'pos-tables',
        href: '/pos?tab=tables',
        labelKey: 'navOpenTables',
        icon: LayoutGrid,
      },
      {
        id: 'kitchen',
        href: '/kitchen',
        labelKey: 'navKitchenBoard',
        icon: CookingPot,
      },
      {
        id: 'queue',
        href: '/queue',
        labelKey: 'navCustomerQueue',
        icon: Tv,
      },
      {
        id: 'menu',
        labelKey: 'navMenu',
        icon: UtensilsCrossed,
        isGroupActive: (p) => p === '/menu' || p.startsWith('/menu/'),
        children: [
          { href: '/menu', labelKey: 'subMenuList' },
          { href: '/menu/items/new', labelKey: 'subMenuAdd' },
          { href: '/menu/categories', labelKey: 'subMenuCategories' },
        ],
      },
      {
        id: 'stock',
        labelKey: 'navStock',
        icon: Warehouse,
        isGroupActive: (p) => p === '/stock' || p.startsWith('/stock/'),
        children: [
          { href: '/stock', labelKey: 'subStockItems' },
          { href: '/stock/items/new', labelKey: 'subStockAdd' },
          { href: '/stock/day-end', labelKey: 'subStockDayEnd' },
          { href: '/stock/movements', labelKey: 'subStockMovements' },
        ],
      },
      {
        id: 'coupons',
        href: '/coupons',
        labelKey: 'navCoupons',
        icon: TicketPercent,
      },
      {
        id: 'offers',
        href: '/offers',
        labelKey: 'navOffers',
        icon: BadgePercent,
      },
      {
        id: 'loyalty',
        labelKey: 'navLoyalty',
        icon: Gift,
        isGroupActive: (p) => p === '/loyalty' || p.startsWith('/loyalty/'),
        children: [
          { href: '/loyalty/customers', labelKey: 'subLoyaltyCustomers' },
          { href: '/loyalty/settings', labelKey: 'subLoyaltySettings' },
        ],
      },
      {
        id: 'tables',
        href: '/tables',
        labelKey: 'navManageTables',
        icon: Table2,
      },
      {
        id: 'invoices',
        labelKey: 'navInvoices',
        icon: FileText,
        isGroupActive: (p) => p === '/invoices' || p.startsWith('/invoices/'),
        children: [
          {
            href: '/invoices',
            labelKey: 'subInvoicesList',
            isActive: (p) =>
              p === '/invoices' ||
              (p.startsWith('/invoices/') &&
                !p.startsWith('/invoices/credit-notes') &&
                !p.startsWith('/invoices/debit-notes')),
          },
          { href: '/invoices/credit-notes', labelKey: 'subCreditNotes' },
          { href: '/invoices/debit-notes', labelKey: 'subDebitNotes' },
        ],
      },
      {
        id: 'hr',
        labelKey: 'navHr',
        icon: Users,
        isGroupActive: (p) => p === '/hr' || p.startsWith('/hr/'),
        children: [
          { href: '/hr/employees', labelKey: 'subHrEmployees' },
          { href: '/hr/payslip-categories', labelKey: 'subHrPayslipCategories' },
          { href: '/hr/salary-slips', labelKey: 'subHrSalarySlips' },
          { href: '/hr/employee-payments', labelKey: 'subHrEmployeePayments' },
          { href: '/hr/visa-status', labelKey: 'subHrVisaStatus' },
        ],
      },
      {
        id: 'reports',
        labelKey: 'navReports',
        icon: FileBarChart,
        isGroupActive: (p) => p === '/reports' || p.startsWith('/reports/'),
        children: [
          { href: '/reports/sales', labelKey: 'subReportSales' },
          { href: '/reports/menu-items', labelKey: 'subReportMenuItems' },
          { href: '/reports/categories', labelKey: 'subReportCategories' },
          { href: '/reports/tax', labelKey: 'subReportTax' },
          { href: '/reports/daily', labelKey: 'subReportDaily' },
          { href: '/reports/date-range-summary', labelKey: 'subReportDateRangeSummary' },
          { href: '/reports/comparison', labelKey: 'subReportComparison' },
          { href: '/reports/cashiers', labelKey: 'subReportCashiers' },
          { href: '/reports/payments', labelKey: 'subReportPayments' },
          { href: '/reports/zatca-status', labelKey: 'subReportZatcaStatus' },
          { href: '/reports/credit-debit-notes', labelKey: 'subReportCreditDebitNotes' },
          { href: '/reports/voids', labelKey: 'subReportVoids' },
          { href: '/reports/discounts', labelKey: 'subReportDiscounts' },
          { href: '/reports/salary-slips', labelKey: 'subReportSalarySlips' },
          { href: '/reports/employee-payments', labelKey: 'subReportEmployeePayments' },
          { href: '/reports/advances', labelKey: 'subReportAdvances' },
        ],
      },
      {
        id: 'settings',
        href: '/settings',
        labelKey: 'navSettings',
        icon: Settings,
      },
    ]

    const sidebarOpts = { isRestaurantOwner }
    return all
      .map((item) => {
        if (item.id === 'pos-tables' && !hasActiveTables) return null
        if (item.children?.length) {
          const children = filterSidebarChildren(
            ability,
            item.children,
            sidebarOpts,
          )
          if (children.length === 0) return null
          return { ...item, children }
        }
        if (!canAccessSidebarHref(ability, item.href, sidebarOpts)) return null
        return item
      })
      .filter(Boolean)
  }, [ability, hasActiveTables, isRestaurantOwner])

  useEffect(() => {
    // Close drawer / search sheet on navigation (Hisabi ClientPortalShell).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync UI to route
    setMobileNavOpen(false)
    setMobileSearchOpen(false)
  }, [pathname])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- expand group for current route
    setOpenGroups((prev) => {
      const next = { ...prev }
      if (pathname.startsWith('/menu')) next.menu = true
      if (pathname.startsWith('/invoices')) next.invoices = true
      if (pathname.startsWith('/reports')) next.reports = true
      if (pathname.startsWith('/restaurants')) next.restaurants = true
      if (pathname.startsWith('/hr')) next.hr = true
      if (pathname.startsWith('/loyalty')) next.loyalty = true
      return next
    })
  }, [pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    function onKey(e) {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileSearchOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileSearchOpen])

  useEffect(() => {
    if (!mobileSearchOpen) return
    function onKey(e) {
      if (e.key === 'Escape') setMobileSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileSearchOpen])

  const headerSearchInputClass =
    'type-body-sm focus:ring-hisabi-teal-container w-full min-w-0 rounded-xl border-0 bg-hisabi-surface-container py-2.5 pe-hisabi-md ps-11 text-hisabi-on-surface outline-none ring-1 ring-hisabi-outline-variant/40 focus:ring-2'

  const logoutMutation = useMutation({
    mutationFn: () => logoutSession(),
    onSuccess: () => {
      setUser(null)
      queryClient.clear()
      router.replace('/login')
    },
  })

  function navLinkClass(active) {
    return cn(
      'type-label-md flex cursor-pointer items-center gap-hisabi-sm px-hisabi-md py-3 transition-colors',
      active
        ? 'border-s-4 border-hisabi-gold bg-hisabi-on-primary/12 font-semibold text-hisabi-on-primary'
        : 'text-hisabi-on-primary/80 hover:bg-hisabi-on-primary/8 hover:text-hisabi-on-primary',
    )
  }

  function subNavClass(active) {
    return cn(
      'type-label-md flex items-center gap-hisabi-xs py-3 ps-14 pe-hisabi-md transition-colors',
      active
        ? 'border-s-4 border-hisabi-gold bg-hisabi-on-primary/12 font-semibold text-hisabi-on-primary'
        : 'text-hisabi-on-primary/80 hover:bg-hisabi-on-primary/8 hover:text-hisabi-on-primary cursor-pointer',
    )
  }

  function isActive(href, exact) {
    const [pathPart, queryPart] = href.split('?')
    const pathMatch = exact
      ? pathname === pathPart
      : pathname === pathPart || pathname.startsWith(`${pathPart}/`)
    if (!pathMatch) return false

    if (queryPart) {
      const want = new URLSearchParams(queryPart)
      for (const [key, value] of want.entries()) {
        if (searchParams.get(key) !== value) return false
      }
      return true
    }

    // Plain /pos should not stay active when Tables tab is open.
    if (pathPart === '/pos' && searchParams.get('tab') === 'tables') {
      return false
    }
    return true
  }

  function toggleGroup(id) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <ProductTourProvider shell={productTourShell}>
    <div className="type-body-md text-hisabi-on-surface min-h-screen bg-hisabi-background">
      <NotificationToastListener disabled={!hasBusinessProfile} />
      <TableSessionAlertToastListener disabled={!hasBusinessProfile} />
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity md:hidden"
          aria-label={t('closeMenuAria')}
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'border-hisabi-on-primary/15 fixed inset-y-0 start-0 z-40 flex w-[min(100vw,var(--width-hisabi-sidebar))] max-w-full flex-col overflow-x-hidden overflow-y-auto border-e bg-hisabi-primary shadow-hisabi-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          'transition-transform duration-300 ease-out md:translate-x-0',
          mobileNavOpen
            ? 'max-md:translate-x-0'
            : isRtl
              ? 'max-md:translate-x-full'
              : 'max-md:-translate-x-full',
        )}
      >
        <div className="flex items-start justify-between gap-hisabi-sm px-hisabi-lg py-hisabi-lg">
          <div className="min-w-0">
            <Image
              src="/images/hisabi-logo-dark.png"
              alt={t('brand')}
              width={84}
              height={32}
              className="h-8 w-auto"
              priority
            />
            <p className="mt-1 text-[10px] font-medium tracking-widest text-hisabi-on-primary/55 uppercase">
              {t('suiteTagline')}
            </p>
          </div>
          <button
            type="button"
            className="text-hisabi-on-primary/80 hover:bg-hisabi-on-primary/10 -me-1 -mt-1 rounded-lg p-2 transition-colors md:hidden"
            aria-label={t('closeMenuAria')}
            onClick={() => setMobileNavOpen(false)}
          >
            <X className="size-6 shrink-0" aria-hidden />
          </button>
        </div>

        {showRestaurantSwitcher ? (
          <div className="px-hisabi-sm pb-hisabi-md">
            <RestaurantSwitcher
              userEmail={userEmail || ''}
              userName={userName}
              hasBusinessProfile={hasBusinessProfile}
              canCreateRestaurant={isRestaurantOwner}
            />
          </div>
        ) : null}

        {showZatcaOnboardingReminder ? (
          <div className="mx-hisabi-sm mb-hisabi-md rounded-xl border border-hisabi-gold/60 bg-hisabi-gold-muted/30 px-hisabi-sm py-hisabi-sm">
            <p className="type-body-sm mb-hisabi-sm text-hisabi-on-primary">
              {t('zatcaIncompleteHint')}
            </p>
            <button
              type="button"
              onClick={() => {
                setMobileNavOpen(false)
                setZatcaModalOpen(true)
              }}
              className="type-label-sm inline-flex min-h-[36px] w-full cursor-pointer items-center justify-center rounded-lg bg-hisabi-gold-muted px-hisabi-sm py-2 font-bold text-hisabi-on-secondary-container transition-colors hover:bg-hisabi-gold-muted-hover"
            >
              {t('completeZatcaCta')}
            </button>
          </div>
        ) : null}

        <nav className="flex-1 space-y-0.5 px-hisabi-xs pb-hisabi-md">
          {navItems.map((item) => {
            const Icon = item.icon

            if (item.children?.length) {
              const groupOpen = Boolean(openGroups[item.id])
              const groupActive = item.isGroupActive(pathname)
              const parentActive = groupActive && !groupOpen
              const activeChildHref = resolveActiveSidebarChildHref(
                pathname,
                item.children,
              )

              return (
                <div key={item.id}>
                  <button
                    type="button"
                    data-tour={item.id}
                    onClick={() => toggleGroup(item.id)}
                    className={cn(navLinkClass(parentActive), 'w-full text-start')}
                    aria-expanded={groupOpen}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    <span className="flex-1 text-start">{t(item.labelKey)}</span>
                    {item.id === 'hr' && !groupOpen ? (
                      <SidebarCountBadge
                        count={visaExpiryCount}
                        tone="error"
                        ariaLabel={t('visaExpiryBadge', { count: visaExpiryCount })}
                      />
                    ) : null}
                    {item.id === 'stock' && !groupOpen ? (
                      <SidebarCountBadge
                        count={lowStockCount}
                        tone="error"
                        ariaLabel={t('lowStockSidebarBadge', { count: lowStockCount })}
                      />
                    ) : null}
                    {groupOpen ? (
                      <ChevronUp className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <ChevronDown className="size-4 shrink-0" aria-hidden />
                    )}
                  </button>
                  {groupOpen ? (
                    <div>
                      {item.children.map((child) => {
                        const childActive = child.href === activeChildHref
                        const tourId = tourIdForSidebarHref(child.href)
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            prefetch={desktop ? false : undefined}
                            data-tour={tourId}
                            className={subNavClass(childActive)}
                            onClick={() => setMobileNavOpen(false)}
                          >
                            <span className="flex-1">{t(child.labelKey)}</span>
                            {child.href === '/hr/visa-status' ? (
                              <SidebarCountBadge
                                count={visaExpiryCount}
                                tone="error"
                                ariaLabel={t('visaExpiryBadge', {
                                  count: visaExpiryCount,
                                })}
                              />
                            ) : null}
                            {child.href === '/stock' ? (
                              <SidebarCountBadge
                                count={lowStockCount}
                                tone="error"
                                ariaLabel={t('lowStockSidebarBadge', {
                                  count: lowStockCount,
                                })}
                              />
                            ) : null}
                          </Link>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            }

            const active = isActive(item.href, item.exact)
            const tourId = tourIdForSidebarHref(item.href) ?? item.id
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={desktop ? false : undefined}
                data-tour={tourId}
                className={navLinkClass(active)}
                target={item.id === 'queue' ? '_blank' : undefined}
                rel={item.id === 'queue' ? 'noopener noreferrer' : undefined}
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {t(item.labelKey)}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto border-t border-hisabi-on-primary/12 p-hisabi-md">
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            aria-busy={logoutMutation.isPending}
            className={cn(
              'type-label-md shadow-hisabi-1 flex w-full cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl bg-hisabi-gold px-hisabi-md py-3 font-bold text-hisabi-on-gold transition-colors hover:bg-hisabi-gold-hover active:scale-[0.98]',
              'disabled:cursor-not-allowed disabled:opacity-70',
            )}
          >
            {logoutMutation.isPending ? (
              <AuthButtonSpinner />
            ) : (
              <LogOut className="size-5 shrink-0" aria-hidden />
            )}
            {t('signOut')}
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:ms-[var(--width-hisabi-sidebar)]">
        <header className="border-hisabi-outline-variant/40 shadow-hisabi-1 sticky top-0 z-30 flex min-h-16 w-full shrink-0 flex-nowrap items-center gap-hisabi-sm overflow-hidden border-b bg-hisabi-surface-container-lowest px-hisabi-md py-2 md:h-16 md:gap-hisabi-lg md:px-hisabi-lg md:py-0">
          <button
            type="button"
            className="text-hisabi-outline hover:bg-hisabi-surface-container -ms-1 shrink-0 rounded-lg p-2 transition-colors md:hidden"
            aria-label={t('openMenuAria')}
            aria-expanded={mobileNavOpen}
            onClick={() => {
              setMobileSearchOpen(false)
              setMobileNavOpen(true)
            }}
          >
            <Menu className="size-6 shrink-0" aria-hidden />
          </button>
          <div className="shrink-0 md:hidden">
            <AuthLocaleToggle />
          </div>
          <div className="min-w-0 flex-1 md:hidden" aria-hidden />
          <div className="relative hidden min-w-0 max-w-xl flex-1 md:block md:pe-hisabi-lg">
            <GlobalSearch
              key={pathname}
              disabled={hasBusinessProfile !== true}
              inputClassName={headerSearchInputClass}
            />
          </div>
          <div className="ms-auto flex shrink-0 items-center max-md:gap-2 md:gap-hisabi-lg">
            <div className="hidden shrink-0 md:block">
              <AuthLocaleToggle />
            </div>
            <NotificationsBell disabled={!hasBusinessProfile} />
            <button
              type="button"
              className="text-hisabi-outline hover:bg-hisabi-surface-container inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors md:hidden"
              aria-label={t('openSearchAria')}
              onClick={() => {
                setMobileNavOpen(false)
                setMobileSearchOpen(true)
              }}
            >
              <Search className="size-6 shrink-0" aria-hidden />
            </button>
            <div
              className="flex size-8 shrink-0 items-center justify-center md:size-auto md:gap-hisabi-sm md:border-s md:border-hisabi-outline-variant/50 md:ps-hisabi-lg"
              title={userEmail || userName}
            >
              <span className="sr-only md:hidden">{userEmail || userName}</span>
              <div className="hidden max-w-xs min-w-0 text-end md:block">
                <p className="type-label-sm truncate font-bold leading-none text-hisabi-teal">
                  {userName}
                </p>
                {userEmail ? (
                  <p className="type-body-sm text-hisabi-outline mt-0.5 truncate">
                    {userEmail}
                  </p>
                ) : roleName ? (
                  <p className="type-body-sm text-hisabi-outline mt-0.5 truncate">
                    {roleName}
                  </p>
                ) : null}
              </div>
              <UserCircle
                className="size-6 shrink-0 text-hisabi-outline md:size-8"
                aria-hidden
              />
            </div>
          </div>
        </header>

        <div className="relative flex-1">
          <div
            className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04]"
            aria-hidden
          >
            <svg
              className="text-hisabi-primary-container absolute end-0 top-0 size-[min(800px,100vw)]"
              fill="currentColor"
              viewBox="0 0 100 100"
            >
              <path
                d="M0,0 L100,0 L100,100 L0,100 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
              />
              <path
                d="M0,0 L100,100 M100,0 L0,100"
                stroke="currentColor"
                strokeWidth="0.25"
              />
            </svg>
          </div>
          <div
            className={
              contentClassName ??
              (pathname === '/pos' || pathname.startsWith('/pos/')
                ? 'p-0 md:p-0'
                : 'p-hisabi-md md:p-hisabi-xl')
            }
          >
            {children}
          </div>
        </div>
      </div>

      {mobileSearchOpen ? (
        <div
          className="fixed inset-0 z-[50] flex flex-col md:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-search-sheet-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label={t('closeSearchAria')}
            onClick={() => setMobileSearchOpen(false)}
          />
          <div
            className="border-hisabi-outline-variant/40 relative z-10 flex shrink-0 items-center gap-hisabi-sm border-b bg-hisabi-surface-container-lowest p-hisabi-md shadow-md"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="mobile-search-sheet-title" className="sr-only">
              {t('searchPlaceholder')}
            </h2>
            <div className="relative min-w-0 flex-1">
              <GlobalSearch
                key={`mobile-${pathname}`}
                disabled={hasBusinessProfile !== true}
                autoFocus
                className="max-w-none"
                inputClassName={headerSearchInputClass}
                panelClassName="max-w-none w-full"
                onNavigate={() => setMobileSearchOpen(false)}
              />
            </div>
            <button
              type="button"
              className="text-hisabi-outline hover:bg-hisabi-surface-container shrink-0 rounded-lg p-2 transition-colors"
              aria-label={t('closeSearchAria')}
              onClick={() => setMobileSearchOpen(false)}
            >
              <X className="size-6 shrink-0" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {canManageBusiness ? (
        <ZatcaOnboardingModal
          open={zatcaModalOpen}
          onOpenChange={setZatcaModalOpen}
        />
      ) : null}
    </div>
    </ProductTourProvider>
  )
}
