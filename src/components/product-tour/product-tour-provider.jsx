'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { STATUS, useJoyride } from 'react-joyride'

import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { usePathname, useRouter } from '@/i18n/navigation'
import { authPost } from '@/lib/api/auth-client'
import {
  filterProductTourStepDefs,
  getTourStartHref,
  PRODUCT_TOUR_MIN_STEPS,
  SIDEBAR_SECTION_CHILD_HREFS,
} from '@/lib/product-tour/product-tour-steps'
import { requestOpenRestaurantSwitcher } from '@/lib/product-tour/product-tour-ui-bridge'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { canAccessSidebarHref } from '@/lib/rbac/sidebar-permissions'
import { isCashierOnlyUser } from '@/lib/auth/post-auth-landing-path'
import { useAuthStore } from '@/stores/auth-store'

/**
 * @typedef {{
 *   openSidebarSection: (sectionId: string) => void
 *   collapseAllSidebarSections: () => void
 *   permissionsReady: boolean
 *   appReady: boolean
 * }} ProductTourShellApi
 */

const ProductTourContext = createContext(
  /** @type {{ startTour: () => void } | null} */ (null),
)

/** @param {number} ms */
function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * @param {{
 *   children: import('react').ReactNode
 *   shell: ProductTourShellApi
 * }} props
 */
export function ProductTourProvider({ children, shell }) {
  const t = useTranslations('ProductTour')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const ability = useAppAbility()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const [offerOpen, setOfferOpen] = useState(false)
  const [run, setRun] = useState(false)
  const [activeDefs, setActiveDefs] = useState(
    /** @type {import('@/lib/product-tour/product-tour-steps').ProductTourStepDef[]} */ ([]),
  )
  const [finishOpen, setFinishOpen] = useState(false)
  const markingSeen = useRef(false)
  const offerChecked = useRef(false)

  const isRestaurantOwner = user?.isRestaurantOwner === true
  const canAccessHref = useCallback(
    (href) =>
      canAccessSidebarHref(ability, href, { isRestaurantOwner }),
    [ability, isRestaurantOwner],
  )

  const hasSidebarSection = useCallback(
    (sectionId) => {
      const hrefs = SIDEBAR_SECTION_CHILD_HREFS[sectionId]
      if (!hrefs?.length) return true
      return hrefs.some((href) => canAccessHref(href))
    },
    [canAccessHref],
  )

  const buildFilteredDefs = useCallback(() => {
    return filterProductTourStepDefs({
      canAccessHref,
      hasSidebarSection,
    })
  }, [canAccessHref, hasSidebarSection])

  const markSeen = useCallback(async () => {
    if (markingSeen.current) return
    markingSeen.current = true
    try {
      const res = await authPost('/account/product-tour/seen', {})
      const seenAt = res?.productTourSeenAt ?? new Date().toISOString()
      const current = useAuthStore.getState().user
      if (current) {
        setUser({ ...current, productTourSeenAt: seenAt })
      }
    } catch {
      const current = useAuthStore.getState().user
      if (current) {
        setUser({ ...current, productTourSeenAt: new Date().toISOString() })
      }
    } finally {
      markingSeen.current = false
    }
  }, [setUser])

  const prepareStepUi = useCallback(
    async (def) => {
      if (def.sidebarSectionId) {
        shell.openSidebarSection(def.sidebarSectionId)
        await wait(280)
      }
      if (def.openSwitcher) {
        requestOpenRestaurantSwitcher()
        await wait(320)
      }
      if (def.settingsHref) {
        router.push(def.settingsHref)
        await wait(450)
      }
    },
    [router, shell],
  )

  const joyrideSteps = useMemo(() => {
    const canSeeRestaurantSettings =
      hasFullAccess(ability) || ability.can('read', 'BusinessSettings')

    return activeDefs.map((def, index) => {
      const bodyKey =
        def.id === 'settings' && canSeeRestaurantSettings
          ? 'settingsBodyAdmin'
          : def.bodyKey

      return {
        target: def.target,
        title: t(def.titleKey),
        content: t(bodyKey),
        skipBeacon: true,
        placement: 'right',
        targetWaitTimeout: 4000,
        before: async () => {
          await prepareStepUi(def)
        },
        data: { id: def.id, index },
      }
    })
  }, [ability, activeDefs, prepareStepUi, t])

  const { Tour, controls } = useJoyride({
    steps: joyrideSteps,
    run,
    continuous: true,
    scrollToFirstStep: true,
    options: {
      showProgress: true,
      buttons: ['back', 'primary', 'skip'],
      scrollOffset: 64 + 24,
      primaryColor: 'var(--color-hisabi-primary, #0f4c5c)',
      textColor: '#1a1a1a',
      overlayColor: 'rgba(15, 23, 42, 0.55)',
      zIndex: 10050,
    },
    locale: {
      back: t('back'),
      close: t('close'),
      last: t('finish'),
      next: t('next'),
      skip: t('skipTour'),
    },
    onEvent: (data) => {
      const { status } = data
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setRun(false)
        setActiveDefs([])
        shell.collapseAllSidebarSections()
        if (status === STATUS.FINISHED) {
          setFinishOpen(true)
        }
      }
    },
  })

  const startTour = useCallback(async () => {
    const defs = buildFilteredDefs()
    if (defs.length < PRODUCT_TOUR_MIN_STEPS) {
      await markSeen()
      setOfferOpen(false)
      return
    }

    await markSeen()
    setOfferOpen(false)
    setRun(false)
    controls.stop()

    const startHref = getTourStartHref(ability, { isRestaurantOwner })
    const alreadyThere =
      pathname === startHref ||
      (startHref !== '/' && pathname.startsWith(`${startHref}/`))

    if (!alreadyThere) {
      router.push(startHref)
      await wait(450)
    }

    setActiveDefs(defs)
    await wait(80)
    setRun(true)
    controls.start(0)
  }, [
    ability,
    buildFilteredDefs,
    controls,
    markSeen,
    pathname,
    router,
  ])

  useEffect(() => {
    if (offerChecked.current) return
    if (!shell.appReady || !shell.permissionsReady) return
    if (!user) return
    if (user.productTourSeenAt) {
      offerChecked.current = true
      return
    }

    if (isCashierOnlyUser(user)) {
      offerChecked.current = true
      void markSeen()
      return
    }

    const defs = buildFilteredDefs()
    if (defs.length < PRODUCT_TOUR_MIN_STEPS) {
      offerChecked.current = true
      void markSeen()
      return
    }

    offerChecked.current = true
    setOfferOpen(true)
  }, [
    buildFilteredDefs,
    markSeen,
    shell.appReady,
    shell.permissionsReady,
    user,
  ])

  const ctxValue = useMemo(() => ({ startTour }), [startTour])
  const isRtl = locale === 'ar'

  return (
    <ProductTourContext.Provider value={ctxValue}>
      {children}
      {Tour}

      <HisabiStatusModal
        open={offerOpen}
        onOpenChange={(open) => {
          if (!open) {
            setOfferOpen(false)
            void markSeen()
          }
        }}
        variant="success"
        title={t('offerTitle')}
        description={t('offerBody')}
        primaryLabel={t('startTour')}
        onPrimary={() => {
          void startTour()
        }}
        secondaryLabel={t('skip')}
        onSecondary={() => {
          setOfferOpen(false)
          void markSeen()
        }}
      />

      <HisabiStatusModal
        open={finishOpen}
        onOpenChange={setFinishOpen}
        variant="success"
        title={t('finishTitle')}
        description={t('finishBody')}
        primaryLabel={t('finishDismiss')}
        onPrimary={() => setFinishOpen(false)}
      />

      <span className="sr-only" aria-hidden dir={isRtl ? 'rtl' : 'ltr'} />
    </ProductTourContext.Provider>
  )
}

export function useProductTour() {
  const ctx = useContext(ProductTourContext)
  if (!ctx) {
    throw new Error('useProductTour must be used within ProductTourProvider')
  }
  return ctx
}

/** Safe for pages that may render outside the shell tour provider. */
export function useOptionalProductTour() {
  return useContext(ProductTourContext)
}
