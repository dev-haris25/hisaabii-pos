import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createMongoAbility } from '@casl/ability'
import { LogOut, WifiOff } from 'lucide-react'

import { PosCheckoutView } from '@/app/[locale]/pos/pos-checkout-view.jsx'
import { KitchenBoardView } from '@/components/orders/kitchen-board-view.jsx'
import { OfflineInvoicesScreen } from './OfflineInvoices.jsx'
import { useAuthStore } from '@/stores/auth-store.js'
import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle.jsx'
import { hasFullAccess } from '@/lib/rbac/ability-utils.js'
import { fetchLocalTillPrimaryStatus } from '@/lib/desktop/local-till-primary.js'
import { logoutOnlineOrOffline } from '@/lib/desktop/desktop-auth.js'
import {
  fetchOfflineCheckoutUnlockStatus,
  unlockOfflineCheckoutMode,
} from '@/lib/desktop/offline-unlock-client.js'
import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner.jsx'

const PING_MS = 8_000

function getDesktop() {
  return typeof window !== 'undefined' ? window.hisabiDesktop : null
}

/**
 * Probe the real cloud host (absolute URL) — works from file:// offline shell.
 * @param {string} appUrl
 */
async function probeAbsoluteCloud(appUrl) {
  if (!appUrl) return false
  const base = appUrl.replace(/\/+$/, '')
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${base}/api/auth/sync/ping`, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

function OfflineBadge() {
  const t = useTranslations('AppShell')
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-hisabi-secondary-container px-2 py-0.5 text-[11px] font-bold leading-4 text-hisabi-secondary"
      role="status"
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      {t('desktopOfflineBadge')}
    </span>
  )
}

function TillSelectScreen({ tills, onSelected }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(/** @type {string | null} */ (null))

  async function selectTill(id) {
    setBusy(true)
    setError(null)
    try {
      const desktop = getDesktop()
      await desktop?.setTillId?.(id)
      onSelected(id)
    } catch {
      setError('Could not save till selection. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-hisabi-background flex min-h-dvh flex-col">
      <header className="border-hisabi-outline-variant/40 shadow-hisabi-1 sticky top-0 z-30 flex min-h-14 items-center justify-between gap-hisabi-md border-b bg-hisabi-surface-container-lowest px-hisabi-md py-2 md:px-hisabi-lg">
        <OfflineBadge />
        <p className="type-label-md font-bold text-hisabi-teal">Hisabi POS</p>
        <AuthLocaleToggle />
      </header>
      <div className="flex flex-1 items-center justify-center p-hisabi-lg">
        <div className="w-full max-w-sm rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest p-hisabi-lg shadow-hisabi-2">
          <h1 className="type-headline-md text-hisabi-on-surface mb-hisabi-sm font-bold">
            Which till is this?
          </h1>
          <p className="type-body-sm text-hisabi-on-surface-variant mb-hisabi-md">
            This machine hasn&apos;t been bound to a till yet. Select which
            till this device is so offline sales can be attributed
            correctly.
          </p>
          {error ? (
            <p className="type-body-sm text-hisabi-error mb-hisabi-sm">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-hisabi-sm">
            {tills.map((till) => (
              <button
                key={till.id}
                type="button"
                disabled={busy}
                onClick={() => selectTill(till.id)}
                className="border-hisabi-outline-variant hover:bg-hisabi-surface-container type-label-md flex items-center justify-between rounded-lg border px-hisabi-lg py-hisabi-sm text-start font-bold text-hisabi-on-surface disabled:opacity-60"
              >
                <span>{till.name}</span>
                {till.isPrimary ? (
                  <span className="type-label-sm text-hisabi-secondary font-bold">
                    Primary
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function LoginScreen({ onLoggedIn, statusMessage }) {
  const t = useTranslations('Pos')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(/** @type {string | null} */ (null))
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const desktop = getDesktop()
      if (!desktop?.offlineLogin) {
        setError('Desktop bridge unavailable')
        return
      }
      const result = await desktop.offlineLogin({
        email,
        password,
        remember: true,
      })
      if (!result?.ok) {
        setError('Invalid email or password, or no access on this till.')
        return
      }
      if (result.token && desktop.setOfflineSessionToken) {
        await desktop.setOfflineSessionToken(result.token)
      }
      onLoggedIn(result.user)
    } catch {
      setError(
        'Could not sign in offline. Finish first sync while online, then try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-hisabi-background flex min-h-dvh flex-col">
      <header className="border-hisabi-outline-variant/40 shadow-hisabi-1 sticky top-0 z-30 flex min-h-14 items-center justify-between gap-hisabi-md border-b bg-hisabi-surface-container-lowest px-hisabi-md py-2 md:px-hisabi-lg">
        <OfflineBadge />
        <p className="type-label-md font-bold text-hisabi-teal">Hisabi POS</p>
        <AuthLocaleToggle />
      </header>
      <div className="flex flex-1 items-center justify-center p-hisabi-lg">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest p-hisabi-lg shadow-hisabi-2"
        >
          <h1 className="type-headline-md text-hisabi-on-surface mb-hisabi-sm font-bold">
            {t('title')}
          </h1>
          {statusMessage ? (
            <p className="type-body-sm text-hisabi-on-surface-variant mb-hisabi-md">
              {statusMessage}
            </p>
          ) : null}
          <label className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-sm grid gap-1 font-semibold">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-hisabi-outline-variant rounded-lg border px-3 py-2 text-hisabi-on-surface"
            />
          </label>
          <label className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-md grid gap-1 font-semibold">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-hisabi-outline-variant rounded-lg border px-3 py-2 text-hisabi-on-surface"
            />
          </label>
          {error ? (
            <p className="type-body-sm text-hisabi-error mb-hisabi-sm">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="bg-hisabi-primary text-hisabi-on-primary type-label-md w-full rounded-lg px-hisabi-lg py-hisabi-sm font-bold disabled:opacity-60"
          >
            {busy ? '…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ShellNav({ path, setPath, showPos, showInvoices, showKitchen }) {
  return (
    <nav className="border-hisabi-outline-variant/40 flex shrink-0 gap-2 border-b bg-hisabi-surface-container-low px-hisabi-md py-2">
      {showPos ? (
        <button
          type="button"
          onClick={() => setPath('/pos')}
          className={
            path === '/pos'
              ? 'bg-hisabi-primary text-hisabi-on-primary type-label-sm rounded-lg px-3 py-1.5 font-bold'
              : 'type-label-sm text-hisabi-on-surface-variant rounded-lg px-3 py-1.5 font-bold'
          }
        >
          POS
        </button>
      ) : null}
      {showInvoices ? (
        <button
          type="button"
          onClick={() => setPath('/invoices')}
          className={
            path === '/invoices'
              ? 'bg-hisabi-primary text-hisabi-on-primary type-label-sm rounded-lg px-3 py-1.5 font-bold'
              : 'type-label-sm text-hisabi-on-surface-variant rounded-lg px-3 py-1.5 font-bold'
          }
        >
          Invoices
        </button>
      ) : null}
      {showKitchen ? (
        <button
          type="button"
          onClick={() => setPath('/kitchen')}
          className={
            path === '/kitchen'
              ? 'bg-hisabi-primary text-hisabi-on-primary type-label-sm rounded-lg px-3 py-1.5 font-bold'
              : 'type-label-sm text-hisabi-on-surface-variant rounded-lg px-3 py-1.5 font-bold'
          }
        >
          Kitchen
        </button>
      ) : null}
      <div className="ms-auto flex items-center">
        <OfflineBadge />
      </div>
    </nav>
  )
}

/**
 * Admin, primary till, offline mode still locked for this outage. Replaces
 * the old modal-over-POS approach: admin lands here directly instead of
 * seeing POS with a dialog stacked on top of it.
 */
function OfflineSettingsScreen({ onUnlocked, onSignOut, signingOut }) {
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState(/** @type {string | null} */ (null))

  async function handleUnlock() {
    setUnlocking(true)
    setError(null)
    try {
      await unlockOfflineCheckoutMode()
      onUnlocked()
    } catch (err) {
      setError(
        (err && typeof err === 'object' && 'message' in err && err.message) ||
          'Could not enable offline sale. Try again.',
      )
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <div className="bg-hisabi-background flex min-h-dvh flex-col">
      <header className="border-hisabi-outline-variant/40 shadow-hisabi-1 sticky top-0 z-30 flex min-h-14 items-center justify-between gap-hisabi-md border-b bg-hisabi-surface-container-lowest px-hisabi-md py-2 md:px-hisabi-lg">
        <OfflineBadge />
        <p className="type-label-md font-bold text-hisabi-teal">Hisabi POS</p>
        <AuthLocaleToggle />
      </header>
      <div className="flex flex-1 items-center justify-center p-hisabi-lg">
        <div className="w-full max-w-sm rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest p-hisabi-lg text-center shadow-hisabi-2">
          <h1 className="type-headline-md text-hisabi-on-surface mb-hisabi-sm font-bold">
            Offline sale settings
          </h1>
          <p className="type-body-sm text-hisabi-on-surface-variant mb-hisabi-lg">
            This till is offline. Enable offline sale so staff can take POS
            orders until you&apos;re back online — this resets automatically
            once the till reconnects and syncs.
          </p>
          {error ? (
            <p className="type-body-sm text-hisabi-error mb-hisabi-sm">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-hisabi-sm">
            <button
              type="button"
              disabled={unlocking}
              aria-busy={unlocking}
              onClick={handleUnlock}
              className="bg-hisabi-primary text-hisabi-on-primary type-label-md inline-flex items-center justify-center gap-hisabi-xs rounded-lg px-hisabi-lg py-hisabi-sm font-bold disabled:opacity-60"
            >
              {unlocking ? <AuthButtonSpinner /> : null}
              Enable offline sale
            </button>
            <button
              type="button"
              disabled={signingOut}
              aria-busy={signingOut}
              onClick={onSignOut}
              className="type-label-md text-hisabi-on-surface-variant hover:bg-hisabi-surface-container rounded-lg px-hisabi-lg py-hisabi-sm font-bold disabled:opacity-60"
            >
              {signingOut ? <AuthButtonSpinner /> : null}
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Neither POS/Invoices (non-primary till) nor Kitchen board access. */
function NoOfflineAccessScreen({ onSignOut, signingOut }) {
  return (
    <div className="bg-hisabi-background flex min-h-dvh flex-col">
      <header className="border-hisabi-outline-variant/40 shadow-hisabi-1 sticky top-0 z-30 flex min-h-14 items-center justify-between gap-hisabi-md border-b bg-hisabi-surface-container-lowest px-hisabi-md py-2 md:px-hisabi-lg">
        <OfflineBadge />
        <p className="type-label-md font-bold text-hisabi-teal">Hisabi POS</p>
        <AuthLocaleToggle />
      </header>
      <div className="flex flex-1 items-center justify-center p-hisabi-lg">
        <div className="w-full max-w-sm rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest p-hisabi-lg text-center shadow-hisabi-2">
          <h1 className="type-headline-md text-hisabi-on-surface mb-hisabi-sm font-bold">
            Nothing available offline
          </h1>
          <p className="type-body-sm text-hisabi-on-surface-variant mb-hisabi-lg">
            While offline, this till only supports POS/Invoices (primary
            till) and the Kitchen board (staff with kitchen access). Your
            account doesn&apos;t have offline access on this till.
          </p>
          <button
            type="button"
            disabled={signingOut}
            aria-busy={signingOut}
            onClick={onSignOut}
            className="bg-hisabi-primary text-hisabi-on-primary type-label-md mx-auto inline-flex items-center gap-hisabi-xs rounded-lg px-hisabi-lg py-hisabi-sm font-bold disabled:opacity-60"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * @param {{ path: string, setPath: (p: string) => void }} props
 */
export function OfflineApp({ path, setPath }) {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [booting, setBooting] = useState(true)
  const [offlineReady, setOfflineReady] = useState(false)
  const [appUrl, setAppUrl] = useState(/** @type {string | null} */ (null))
  const [tillsNeedingSelection, setTillsNeedingSelection] = useState(
    /** @type {Array<{ id: string, name: string, isPrimary: boolean }> | null} */ (
      null
    ),
  )
  const [isPrimaryTill, setIsPrimaryTill] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const restoreSession = useCallback(async () => {
    setBooting(true)
    const desktop = getDesktop()
    if (!desktop) {
      setBooting(false)
      return
    }
    try {
      const status = await desktop.getLocalStatus?.()
      setOfflineReady(Boolean(status?.offlineReady))
      const cfg = await desktop.getAppConfig?.()
      if (cfg?.appUrl) setAppUrl(String(cfg.appUrl))

      // If this machine has never been bound to a till (main process could
      // only auto-resolve the single-till case), ask which till it is
      // before doing anything else — till identity affects offline sales
      // attribution/ZATCA regardless of who signs in.
      const boundTillId = await desktop.getTillId?.()
      if (!boundTillId) {
        const tills = (await desktop.listTills?.()) || []
        if (tills.length > 1) {
          setTillsNeedingSelection(tills)
          setBooting(false)
          return
        }
      }

      // Local SQLite (works fully offline) — decides whether POS/Invoices
      // are in scope for this till, regardless of who signs in.
      try {
        const primaryStatus = await fetchLocalTillPrimaryStatus()
        setIsPrimaryTill(Boolean(primaryStatus?.isPrimary))
      } catch {
        setIsPrimaryTill(false)
      }

      const token = await desktop.getOfflineSessionToken?.()
      if (token && desktop.offlineMe) {
        const me = await desktop.offlineMe(token)
        if (me?.ok && me.user) {
          setUser(me.user)
          setBooting(false)
          return
        }
      }
    } catch {
      /* show login */
    }
    setBooting(false)
  }, [setUser])

  useEffect(() => {
    void restoreSession()
  }, [restoreSession])

  // Auto hand-off when cloud becomes reachable
  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (cancelled) return
      let url = appUrl
      if (!url) {
        try {
          const cfg = await getDesktop()?.getAppConfig?.()
          url = cfg?.appUrl ? String(cfg.appUrl) : null
          if (url) setAppUrl(url)
        } catch {
          /* ignore */
        }
      }
      const ok = await probeAbsoluteCloud(url || '')
      if (ok && !cancelled && getDesktop()?.retryLoadApp) {
        getDesktop().retryLoadApp()
      }
    }
    void tick()
    const id = window.setInterval(() => {
      void tick()
    }, PING_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [appUrl])

  const hasKitchenAccess = useMemo(() => {
    if (!user) return false
    const ability = createMongoAbility(user.abilityRules ?? [])
    return hasFullAccess(ability) || ability.can('read', 'KitchenBoard')
  }, [user])

  const isAdminUser = useMemo(() => {
    if (!user) return false
    return (
      user.isRestaurantOwner === true ||
      user.roleName === 'Admin' ||
      user.roleName === 'Owner' ||
      (Array.isArray(user.roleNames) &&
        (user.roleNames.includes('Admin') || user.roleNames.includes('Owner')))
    )
  }, [user])

  // Only relevant for admin on the primary till — decides whether they land
  // on the offline-sale Settings gate instead of POS. `undefined` = not
  // checked yet, `null` = not applicable to this user/till combination.
  const [unlockStatus, setUnlockStatus] = useState(
    /** @type {{ unlocked: boolean } | null | undefined} */ (null),
  )

  useEffect(() => {
    if (!user || !isPrimaryTill || !isAdminUser) {
      setUnlockStatus(null)
      return undefined
    }
    let cancelled = false
    setUnlockStatus(undefined)
    ;(async () => {
      const res = await fetchOfflineCheckoutUnlockStatus()
      if (!cancelled) setUnlockStatus(res)
    })()
    return () => {
      cancelled = true
    }
  }, [user, isPrimaryTill, isAdminUser])

  // Non-primary tills don't have POS/Invoices in scope at all — always land
  // staff with kitchen access straight on the Kitchen board.
  useEffect(() => {
    if (!user || isPrimaryTill) return
    if (hasKitchenAccess && path !== '/kitchen') setPath('/kitchen')
  }, [user, isPrimaryTill, hasKitchenAccess, path, setPath])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await logoutOnlineOrOffline()
    } catch {
      /* ignore — still clear local user state below */
    } finally {
      setUser(null)
      setSigningOut(false)
    }
  }

  if (booting) {
    return (
      <div className="bg-hisabi-background flex min-h-dvh items-center justify-center">
        <p className="type-body-md text-hisabi-on-surface-variant">Loading…</p>
      </div>
    )
  }

  if (tillsNeedingSelection) {
    return (
      <TillSelectScreen
        tills={tillsNeedingSelection}
        onSelected={() => {
          setTillsNeedingSelection(null)
          void restoreSession()
        }}
      />
    )
  }

  if (!user) {
    return (
      <LoginScreen
        onLoggedIn={(u) => setUser(u)}
        statusMessage={
          offlineReady
            ? null
            : 'This till has no synced data yet. Connect to the internet once, then try again.'
        }
      />
    )
  }

  // Only POS/Invoices (primary till) and Kitchen board (kitchen access) are
  // ever in scope offline — nothing else to fall back to for this account.
  if (!isPrimaryTill && !hasKitchenAccess) {
    return (
      <NoOfflineAccessScreen onSignOut={handleSignOut} signingOut={signingOut} />
    )
  }

  // Admin, primary till, offline mode not yet unlocked for this outage —
  // land on the Settings gate instead of POS (replaces the old
  // modal-over-POS approach for this specific case only; non-admin users
  // still see PosPrimaryOfflineUnlockLock's blocking screen inside POS,
  // unchanged). Once already unlocked, admin goes straight into POS.
  if (isPrimaryTill && isAdminUser) {
    if (unlockStatus === undefined) {
      return (
        <div className="bg-hisabi-background flex min-h-dvh items-center justify-center">
          <p className="type-body-md text-hisabi-on-surface-variant">
            Loading…
          </p>
        </div>
      )
    }
    if (unlockStatus?.unlocked === false) {
      return (
        <OfflineSettingsScreen
          onUnlocked={() => setUnlockStatus({ unlocked: true })}
          onSignOut={handleSignOut}
          signingOut={signingOut}
        />
      )
    }
  }

  const staffName = user.name || user.email || ''
  const showGoToDashboard = false
  const showKitchenView =
    (path === '/kitchen' || !isPrimaryTill) && path !== '/invoices'
  const showInvoicesView = isPrimaryTill && path === '/invoices'

  return (
    <div className="bg-hisabi-background flex min-h-dvh flex-col">
      <ShellNav
        path={path}
        setPath={setPath}
        showPos={isPrimaryTill}
        showInvoices={isPrimaryTill}
        showKitchen={hasKitchenAccess}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {showInvoicesView ? (
          <OfflineInvoicesScreen />
        ) : showKitchenView ? (
          <KitchenBoardView
            staffName={staffName}
            restaurantName=""
            showGoToDashboard={showGoToDashboard}
          />
        ) : (
          <PosCheckoutView
            staffName={staffName}
            restaurantName=""
            restaurantLogoUrl={null}
            returnToInvoices={false}
            embedded={false}
          />
        )}
      </div>
    </div>
  )
}
