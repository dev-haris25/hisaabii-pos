'use client'

import {
  Bell,
  ChevronRight,
  History,
  Minus,
  Plus,
  Receipt,
  ShoppingBag,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const SESSION_POLL_MS = 4000
const ROUND_STATUS_POLL_MS = 4000
const LOYALTY_STORAGE_PREFIX = 'e-waiter-loyalty:'
/** @type {Array<Record<string, unknown>>} */
const EMPTY_OFFERS = []

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { EWaiterLoyaltyLoginSheet } from '@/components/e-waiter/e-waiter-loyalty-login-sheet'
import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import { EWaiterPastOrdersView } from '@/components/e-waiter/e-waiter-past-orders-view'
import { EWaiterRedeemSheet } from '@/components/e-waiter/e-waiter-redeem-sheet'
import { EWaiterRoundView } from '@/components/e-waiter/e-waiter-round-view'
import { EWaiterSheetScaffold } from '@/components/e-waiter/e-waiter-sheet-scaffold'
import { EWaiterOfferBannerSlider } from '@/components/e-waiter/e-waiter-offer-banner-slider'
import { EWaiterDealCard } from '@/components/e-waiter/e-waiter-deal-card'
import { EWaiterDealSheet } from '@/components/e-waiter/e-waiter-deal-sheet'
import { EWaiterOfferPrice } from '@/components/e-waiter/e-waiter-offer-price'
import {
  OFFER_REFRESH_CODES,
  buildDealDraft,
  dealBoxCap,
  dealBoxDisplayPrice,
  dealNeedsChoice,
  defaultOfferItemSelection,
  offerDisplayName,
  offerHasUsesLeft,
  optionNamesFor,
  priceGuestCart,
} from '@/components/e-waiter/e-waiter-offer-utils'
import {
  cartLineKey,
  computeUnitPriceFromItem,
  defaultVariantSelection,
  menuItemHasCustomizations,
  menuItemHasVariantGroups,
  optionIdsFromSelection,
} from '@/lib/menu/item-modifiers'
import {
  normalizeCalories,
  resolveLineDisplayCalories,
  resolveOptionDisplayCalories,
  selectedVariantOptionsFromItem,
} from '@/lib/menu/resolve-display-calories'
import { assertWithinRestaurantGeofence } from '@/lib/e-waiter/assert-within-geofence'
import { bestDisplayDiscount, offerMenuItemIds } from '@/lib/offers/offer-pricing'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import {
  vatInclusiveLineTotal,
  vatInclusiveUnitPriceFromItem,
} from '@/lib/e-waiter/vat-inclusive-price'
import { cn } from '@/lib/utils'

/**
 * @param {unknown} item
 * @param {'ar' | 'en'} locale
 */
function itemName(item, locale) {
  if (locale === 'ar') return String(item?.nameAr ?? '')
  return String(item?.nameEn ?? '').trim() || String(item?.nameAr ?? '')
}

/**
 * @param {unknown} row
 * @param {'ar' | 'en'} locale
 */
function bilingualName(row, locale) {
  if (locale === 'ar') return String(row?.nameAr ?? '')
  return String(row?.nameEn ?? '').trim() || String(row?.nameAr ?? '')
}

/**
 * @param {unknown} status
 * @param {(key: string) => string} t
 */
function roundStatusLabel(status, t) {
  if (status === 'pending') return t('statusPending')
  if (status === 'preparing') return t('statusPreparing')
  if (status === 'ready') return t('statusReady')
  if (status === 'completed') return t('statusCompleted')
  if (status === 'cancelled') return t('statusCancelled')
  return t('statusPreparing')
}

/**
 * @param {{
 *   themeId: string
 *   locale: 'ar' | 'en'
 *   slug: string
 *   qrToken: string
 *   restaurantName: string
 *   logoUrl: string | null
 *   tableName: string
 *   categories: Array<Record<string, unknown>>
 *   items: Array<Record<string, unknown>>
 *   initialSession?: Record<string, unknown> | null
 *   initialWaiterCallActive?: boolean
 *   loyaltyEnabled?: boolean
 *   offers?: Array<Record<string, unknown>>
 *   geofence?: {
 *     required: false
 *   } | {
 *     required: true
 *     lat: number
 *     lng: number
 *     radiusMeters: number
 *   }
 * }} props
 */
export function EWaiterMenuView({
  themeId,
  locale: localeProp,
  slug,
  qrToken,
  restaurantName,
  logoUrl,
  tableName,
  categories,
  items,
  initialSession = null,
  initialWaiterCallActive = false,
  loyaltyEnabled = false,
  offers: offersProp = EMPTY_OFFERS,
  geofence = { required: false },
}) {
  const t = useTranslations('EWaiter')
  const tErr = useTranslations('AuthErrors')
  const intlLocale = useLocale()
  const locale = localeProp === 'ar' || intlLocale === 'ar' ? 'ar' : 'en'
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const roundsQueryKey = ['e-waiter-rounds', slug, qrToken]

  const categoryFromUrl = (searchParams.get('category') ?? '').trim()
  const activeCategoryId =
    categoryFromUrl && categories.some((c) => c.id === categoryFromUrl)
      ? categoryFromUrl
      : 'all'

  const [cart, setCart] = useState(
    /** @type {Array<Record<string, unknown>>} */ ([]),
  )
  const [configItem, setConfigItem] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [cartOpen, setCartOpen] = useState(false)
  const [orderPending, setOrderPending] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [lastOrder, setLastOrder] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  /** When true, show round manager; when false with lastOrder set, show menu + status banner. */
  const [roundViewOpen, setRoundViewOpen] = useState(false)
  const [session, setSession] = useState(
    /** @type {Record<string, unknown> | null} */ (initialSession),
  )
  const [actionPending, setActionPending] = useState(false)
  const [askBillBusy, setAskBillBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [waiterCalled, setWaiterCalled] = useState(initialWaiterCallActive)
  const [loyaltyAccountId, setLoyaltyAccountId] = useState(
    /** @type {string | null} */ (null),
  )
  const [loyaltyBalance, setLoyaltyBalance] = useState('0')
  const [loyaltyPromptOpen, setLoyaltyPromptOpen] = useState(false)
  const [pastOrdersOpen, setPastOrdersOpen] = useState(false)
  const [redeemOpen, setRedeemOpen] = useState(false)
  const [loyaltyRedeem, setLoyaltyRedeem] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )

  // ---- Offers & Deals ------------------------------------------------------
  const offers = offersProp
  /** Combo deals in the cart (one row per deal + chosen variants). */
  const [dealCart, setDealCart] = useState(
    /** @type {Array<{ key: string, offerId: string, quantity: number, components: Array<Record<string, any>> }>} */ ([]),
  )
  const [dealSheetOffer, setDealSheetOffer] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [offerNotice, setOfferNotice] = useState('')
  const listTopRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  // Fresh offers (router.refresh) → drop deals whose offer vanished.
  const [seenOffers, setSeenOffers] = useState(offers)
  if (seenOffers !== offers) {
    setSeenOffers(offers)
    const liveComboIds = new Set(
      offers.filter((o) => o.kind === 'COMBO').map((o) => String(o.id)),
    )
    if (dealCart.some((d) => !liveComboIds.has(d.offerId))) {
      setDealCart((prev) => prev.filter((d) => liveComboIds.has(d.offerId)))
      setOfferNotice(t('offers.dealsRemoved'))
    }
  }

  const itemsById = useMemo(
    () => new Map(items.map((it) => [String(it.id), it])),
    [items],
  )
  const offersById = useMemo(
    () => new Map(offers.map((o) => [String(o.id), o])),
    [offers],
  )

  const bannerOffers = useMemo(
    () => offers.filter((o) => Boolean(o.bannerUrl) && offerHasUsesLeft(o)),
    [offers],
  )

  const featuredDeals = useMemo(() => {
    /** @type {Array<{ offer: Record<string, unknown>, price: { grossIncl: string, netIncl: string } }>} */
    const rows = []
    for (const offer of offers) {
      if (offer.kind !== 'COMBO' || !offerHasUsesLeft(offer)) continue
      const price = dealBoxDisplayPrice(offer, itemsById, offers)
      if (price) rows.push({ offer, price })
    }
    return rows
  }, [offers, itemsById])

  /** "Deals" capsule (`?category=deals`) — only while a deal is live. */
  const dealsSelected = categoryFromUrl === 'deals' && featuredDeals.length > 0

  const offerFilterParam = (searchParams.get('offer') ?? '').trim()
  const offerFilter =
    offerFilterParam && offersById.get(offerFilterParam)?.kind === 'DISCOUNT'
      ? offersById.get(offerFilterParam)
      : null

  /** @type {'skipped' | 'checking' | 'ok' | 'denied' | 'unavailable' | 'outside'} */
  const [locationGate, setLocationGate] = useState(
    geofence?.required ? 'checking' : 'skipped',
  )
  const [guestCoords, setGuestCoords] = useState(
    /** @type {{ lat: number, lng: number } | null} */ (null),
  )

  const billRequested = session?.billRequested === true
  const roundCount = Number(session?.roundCount ?? 0)
  const canAskForBill = roundCount > 0 && !billRequested
  const locationBlocksOrdering =
    Boolean(geofence?.required) &&
    locationGate !== 'ok' &&
    locationGate !== 'skipped'
  const orderingLocked = billRequested || locationBlocksOrdering

  const menuRoundsQuery = useQuery({
    queryKey: roundsQueryKey,
    enabled:
      !roundViewOpen &&
      (Boolean(lastOrder) || Number(session?.roundCount ?? 0) > 0),
    queryFn: async () => {
      const res = await fetch(
        `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/rounds`,
        { credentials: 'omit' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        const err = new Error(String(data.code ?? 'FETCH_FAILED'))
        Object.assign(err, { code: data.code })
        throw err
      }
      return /** @type {Array<Record<string, unknown>>} */ (data.rounds ?? [])
    },
    refetchInterval: (query) => {
      const list = query.state.data ?? []
      if (list.length === 0) return false
      const allTerminal = list.every(
        (r) => r.status === 'completed' || r.status === 'cancelled',
      )
      if (allTerminal) return false
      return ROUND_STATUS_POLL_MS
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const menuRounds = menuRoundsQuery.data ?? []

  useEffect(() => {
    if (!menuRoundsQuery.isSuccess) return
    const rounds = menuRoundsQuery.data ?? []
    if (rounds.length === 0) {
      setLastOrder(null)
      setRoundViewOpen(false)
      return
    }
    // Restore banner after refresh: lastOrder is in-memory only.
    setLastOrder((prev) => {
      if (prev) return prev
      const latest = rounds[rounds.length - 1]
      return {
        kitchenOrderId: latest.kitchenOrderId,
        orderNumber: latest.orderNumber,
        roundNumber: latest.roundNumber,
        sessionId: session?.sessionId ?? null,
      }
    })
  }, [menuRoundsQuery.isSuccess, menuRoundsQuery.data, session?.sessionId])

  useEffect(() => {
    if (!menuRoundsQuery.isError) return
    const code =
      menuRoundsQuery.error &&
      typeof menuRoundsQuery.error === 'object' &&
      'code' in menuRoundsQuery.error
        ? String(menuRoundsQuery.error.code)
        : ''
    if (code === 'NOT_FOUND') {
      setLastOrder(null)
      setRoundViewOpen(false)
    }
  }, [menuRoundsQuery.isError, menuRoundsQuery.error])

  /**
   * @returns {Promise<
   *   | { ok: true, lat: number, lng: number }
   *   | { ok: false, reason: 'denied' | 'unavailable' }
   * >}
   */
  function requestBrowserLocation() {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve({ ok: false, reason: 'unavailable' })
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            ok: true,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
        },
        (err) => {
          const denied =
            err && typeof err.code === 'number' && err.code === 1
          resolve({ ok: false, reason: denied ? 'denied' : 'unavailable' })
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30_000 },
      )
    })
  }

  async function verifyGuestLocation() {
    if (!geofence?.required) {
      setLocationGate('skipped')
      setGuestCoords(null)
      return
    }
    setLocationGate('checking')
    const result = await requestBrowserLocation()
    if (!result.ok) {
      setGuestCoords(null)
      setLocationGate(result.reason)
      return
    }
    const check = assertWithinRestaurantGeofence(
      {
        locationLat: geofence.lat,
        locationLng: geofence.lng,
        locationRadiusMeters: geofence.radiusMeters,
      },
      result.lat,
      result.lng,
    )
    if (!check.ok) {
      setGuestCoords(null)
      setLocationGate(
        check.code === 'OUTSIDE_GEOFENCE' ? 'outside' : 'denied',
      )
      return
    }
    setGuestCoords({ lat: result.lat, lng: result.lng })
    setLocationGate('ok')
  }

  useEffect(() => {
    void verifyGuestLocation()
    // Geofence is stable for the page lifetime (SSR prop).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + geofence.required only
  }, [geofence?.required, geofence?.lat, geofence?.lng, geofence?.radiusMeters])

  useEffect(() => {
    if (!loyaltyEnabled) return
    try {
      const raw = sessionStorage.getItem(`${LOYALTY_STORAGE_PREFIX}${slug}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.loyaltyAccountId) {
          setLoyaltyAccountId(String(parsed.loyaltyAccountId))
          setLoyaltyBalance(String(parsed.balance ?? '0'))
          return
        }
      }
    } catch {
      // ignore
    }
    setLoyaltyPromptOpen(true)
  }, [loyaltyEnabled, slug])

  useEffect(() => {
    let cancelled = false
    async function pollSession() {
      try {
        const res = await fetch(
          `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/session`,
          { credentials: 'omit' },
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || data.ok === false) return
        setSession(data.session ?? null)
        if (data.waiterCall?.waiterCallActive) setWaiterCalled(true)
        if (data.loyaltyRedeem) setLoyaltyRedeem(data.loyaltyRedeem)
        else setLoyaltyRedeem(null)
      } catch {
        // ignore poll errors
      }
    }
    void pollSession()
    const id = window.setInterval(pollSession, SESSION_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [slug, qrToken])

  /**
   * @param {string | 'all'} nextId
   */
  function setActiveCategoryId(nextId) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('offer')
    if (!nextId || nextId === 'all') params.delete('category')
    else params.set('category', nextId)
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  /**
   * @param {string | null} offerId DISCOUNT offer to filter by (null = clear)
   */
  function setOfferFilterId(offerId) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('category')
    if (offerId) params.set('offer', offerId)
    else params.delete('offer')
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  const filteredItems = useMemo(() => {
    if (offerFilter) {
      const ids = offerMenuItemIds(offerFilter)
      if (!ids) return items
      const wanted = new Set(ids)
      return items.filter((it) => wanted.has(String(it.id)))
    }
    if (activeCategoryId === 'all') return items
    return items.filter((it) => it.categoryId === activeCategoryId)
  }, [items, activeCategoryId, offerFilter])

  const cartCount = useMemo(
    () =>
      cart.reduce((n, line) => n + Number(line.quantity || 0), 0) +
      dealCart.reduce((n, deal) => n + Number(deal.quantity || 0), 0),
    [cart, dealCart],
  )

  const cartPricing = useMemo(
    () =>
      priceGuestCart({
        lines: cart.map((line) => ({
          menuItemId: String(line.menuItemId),
          quantity: Number(line.quantity) || 0,
          unitPrice: String(line.unitPrice ?? '0'),
          optionIds: /** @type {string[]} */ (line.optionIds ?? []),
          vatPreset: String(line.vatPreset ?? 'standard'),
        })),
        deals: dealCart,
        offers,
      }),
    [cart, dealCart, offers],
  )

  const tableHasOfferLines = menuRounds.some((round) =>
    (/** @type {Array<Record<string, unknown>>} */ (round.lines ?? [])).some(
      (line) => Boolean(line.offerId),
    ),
  )
  const loyaltyLinked = Boolean(
    loyaltyEnabled && (session?.loyaltyAccountId || loyaltyAccountId),
  )
  const redeemBlockedNote =
    loyaltyLinked && tableHasOfferLines && !billRequested
      ? t('offers.redeemBlocked')
      : ''

  /**
   * @param {Record<string, unknown>} item
   * @param {string[]} optionIds
   * @param {string[]} customizationIds
   * @param {number} quantity
   */
  function addToCart(item, optionIds, customizationIds, quantity) {
    if (orderingLocked) return
    const qty = Math.max(1, Math.round(quantity) || 1)
    const unitPrice = computeUnitPriceFromItem(item, optionIds, customizationIds)
    const key = cartLineKey(String(item.id), optionIds, customizationIds)
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.key === key)
      if (idx >= 0) {
        const next = [...prev]
        const existing = next[idx]
        next[idx] = {
          ...existing,
          quantity: Number(existing.quantity) + qty,
        }
        return next
      }
      return [
        ...prev,
        {
          key,
          menuItemId: item.id,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          optionIds,
          customizationIds,
          quantity: qty,
          unitPrice,
          vatPreset: item.vatPreset ?? 'standard',
        },
      ]
    })
  }

  /**
   * @param {Record<string, unknown>} item
   */
  function handleQuickAdd(item) {
    if (!guardOrdering()) return
    const needsConfig =
      menuItemHasVariantGroups(item) || menuItemHasCustomizations(item)
    if (needsConfig) {
      setConfigItem(item)
      return
    }
    addToCart(item, [], [], 1)
  }

  /**
   * Same lock as the normal add-to-cart path (bill requested / geofence).
   * @returns {boolean} true when ordering is allowed
   */
  function guardOrdering() {
    if (!orderingLocked) return true
    if (billRequested) setActionMessage(t('billRequestedHint'))
    else if (locationBlocksOrdering) setActionMessage(locationGateMessage())
    return false
  }

  /**
   * Boxes of this deal already in the cart.
   * @param {string} offerId
   */
  function dealBoxesInCart(offerId) {
    return dealCart
      .filter((d) => d.offerId === offerId)
      .reduce((n, d) => n + Number(d.quantity || 0), 0)
  }

  /**
   * Remaining boxes the guest may still add (null = no cap).
   * @param {Record<string, unknown>} offer
   */
  function dealRoomLeft(offer) {
    const cap = dealBoxCap(offer)
    if (cap == null) return null
    return Math.max(0, cap - dealBoxesInCart(String(offer.id)))
  }

  /**
   * @param {NonNullable<ReturnType<typeof buildDealDraft>>} draft
   * @param {number} quantity
   * @returns {boolean} added
   */
  function addDealToCart(draft, quantity) {
    if (orderingLocked) return false
    const offer = offersById.get(draft.offerId)
    if (!offer) {
      setActionMessage(tErr('OFFER_NOT_AVAILABLE'))
      return false
    }
    const room = dealRoomLeft(offer)
    const qty = Math.max(1, Math.round(quantity) || 1)
    if (room != null && qty > room) {
      setOfferNotice(
        t('offers.dealMaxReached', { max: dealBoxCap(offer) ?? 0 }),
      )
      setCartOpen(true)
      return false
    }
    setDealCart((prev) => {
      const idx = prev.findIndex((d) => d.key === draft.key)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty }
        return next
      }
      return [...prev, { ...draft, quantity: qty }]
    })
    return true
  }

  /**
   * Banner / featured deal tap.
   * DISCOUNT → filter the menu; BUY_X_GET_Y → add BUY + GET items;
   * COMBO → add the deal (variant picker first when needed). Cart opens.
   *
   * @param {Record<string, unknown>} offer
   */
  function activateOffer(offer) {
    setOfferNotice('')
    if (offer.kind === 'DISCOUNT') {
      setOfferFilterId(String(offer.id))
      listTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }
    if (!guardOrdering()) return
    if (offer.kind === 'BUY_X_GET_Y') {
      let added = 0
      for (const it of /** @type {Array<Record<string, unknown>>} */ (
        offer.items ?? []
      )) {
        if (it.role !== 'BUY' && it.role !== 'GET') continue
        const menuItem = itemsById.get(String(it.menuItemId))
        if (!menuItem) continue
        const optionIds = optionIdsFromSelection(
          defaultOfferItemSelection(it, menuItem),
        )
        addToCart(menuItem, optionIds, [], Math.max(1, Number(it.quantity) || 1))
        added += 1
      }
      if (added === 0) {
        setActionMessage(t('offers.offerItemsUnavailable'))
        return
      }
      setCartOpen(true)
      return
    }
    if (offer.kind === 'COMBO') {
      const room = dealRoomLeft(offer)
      if (room != null && room < 1) {
        setOfferNotice(
          t('offers.dealMaxReached', { max: dealBoxCap(offer) ?? 0 }),
        )
        setCartOpen(true)
        return
      }
      if (dealNeedsChoice(offer, itemsById)) {
        setDealSheetOffer(offer)
        return
      }
      const draft = buildDealDraft(offer, itemsById)
      if (!draft) {
        setActionMessage(tErr('OFFER_NOT_AVAILABLE'))
        return
      }
      if (addDealToCart(draft, 1)) setCartOpen(true)
    }
  }

  /**
   * @param {string} key
   * @param {number} delta
   */
  function bumpDealQty(key, delta) {
    setDealCart((prev) =>
      prev
        .map((deal) => {
          if (deal.key !== key) return deal
          const offer = offersById.get(deal.offerId)
          const room = offer ? dealRoomLeft(offer) : null
          if (delta > 0 && room != null && room < delta) return deal
          return { ...deal, quantity: Math.max(0, deal.quantity + delta) }
        })
        .filter((deal) => deal.quantity > 0),
    )
  }

  /** @param {string} key */
  function removeDeal(key) {
    setDealCart((prev) => prev.filter((deal) => deal.key !== key))
  }

  function locationGateMessage() {
    if (locationGate === 'checking') return t('locationChecking')
    if (locationGate === 'denied') return t('locationDenied')
    if (locationGate === 'unavailable') return t('locationUnavailable')
    if (locationGate === 'outside') return t('mustBeAtRestaurant')
    return t('mustBeAtRestaurant')
  }

  /**
   * @param {string} key
   * @param {number} delta
   */
  function bumpQty(key, delta) {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.key !== key) return line
          return {
            ...line,
            quantity: Math.max(0, Number(line.quantity) + delta),
          }
        })
        .filter((line) => Number(line.quantity) > 0),
    )
  }

  async function placeOrder() {
    if (
      orderPending ||
      (cart.length === 0 && dealCart.length === 0) ||
      orderingLocked
    ) {
      return
    }
    if (!cartPricing.ok) {
      setOrderError(tErr(String(cartPricing.error?.code ?? 'OFFER_NOT_AVAILABLE')))
      return
    }
    setOrderError('')
    setOfferNotice('')
    setOrderPending(true)
    try {
      let coords = guestCoords
      if (!coords) {
        const result = await requestBrowserLocation()
        if (result.ok) {
          coords = { lat: result.lat, lng: result.lng }
          setGuestCoords(coords)
        }
      }
      const res = await fetch(
        `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/submit`,
        {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            lines: cart.map((line) => ({
              menuItemId: line.menuItemId,
              quantity: Number(line.quantity) || 1,
              variantOptionIds: line.optionIds ?? [],
              customizationIds: line.customizationIds ?? [],
              lineNote: null,
            })),
            deals: dealCart.map((deal) => ({
              offerId: deal.offerId,
              quantity: deal.quantity,
              components: deal.components.map((c) => ({
                offerItemId: c.offerItemId,
                variantOptionIds: c.variantOptionIds ?? [],
              })),
            })),
            ...(cartPricing.applied
              ? { expectedOfferDiscount: cartPricing.totalDiscount }
              : {}),
            loyaltyAccountId: loyaltyAccountId ?? null,
          }),
        },
      )
      /** @type {Record<string, unknown>} */
      let data = {}
      try {
        data = await res.json()
      } catch {
        // ignore
      }
      if (!res.ok || data.ok === false) {
        const code = typeof data.code === 'string' ? data.code : ''
        if (code === 'OUTSIDE_GEOFENCE' || code === 'LOCATION_REQUIRED') {
          setOrderError(t('mustBeAtRestaurant'))
          setLocationGate(
            code === 'OUTSIDE_GEOFENCE' ? 'outside' : 'denied',
          )
          setGuestCoords(null)
        } else if (code === 'BILL_REQUESTED') {
          setOrderError(t('billRequestedHint'))
          setSession((prev) =>
            prev ? { ...prev, billRequested: true } : { billRequested: true },
          )
        } else if (code === 'INVALID_MENU_ITEM') {
          setOrderError(t('orderInvalidItems'))
        } else if (OFFER_REFRESH_CODES.has(code)) {
          // Offers changed: show why, pull fresh offers, keep the cart.
          setOrderError(tErr(code))
          router.refresh()
        } else if (code.startsWith('OFFER') || code === 'RATE_LIMITED') {
          setOrderError(tErr(code))
        } else {
          setOrderError(t('orderFailed'))
        }
        return
      }
      setLastOrder({
        orderNumber: data.orderNumber,
        roundNumber: data.roundNumber,
        kitchenOrderId: data.kitchenOrderId,
        sessionId: data.sessionId,
      })
      setSession((prev) => ({
        ...(prev ?? {}),
        sessionId: data.sessionId,
        roundCount: Math.max(roundCount, Number(data.roundNumber) || 1),
        billRequested: false,
      }))
      setCart([])
      setDealCart([])
      setCartOpen(false)
      // Bust stale rounds cache so round 2+ shows immediately (not after poll).
      await queryClient.invalidateQueries({ queryKey: roundsQueryKey })
      setRoundViewOpen(true)
    } catch {
      setOrderError(t('orderFailed'))
    } finally {
      setOrderPending(false)
    }
  }

  async function askForBill(redeemPoints = null) {
    if (actionPending || askBillBusy) return
    if (!canAskForBill && !billRequested) return
    setActionPending(true)
    setAskBillBusy(true)
    setActionMessage('')
    try {
      /** @type {Record<string, unknown>} */
      const body = {}
      if (redeemPoints != null && String(redeemPoints).trim() !== '') {
        body.redeemPoints = String(redeemPoints).trim()
      }
      const res = await fetch(
        `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/ask-for-bill`,
        {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        const code = typeof data.code === 'string' ? data.code : ''
        setActionMessage(
          code === 'OFFERS_EXCLUSIVE_DISCOUNT'
            ? t('offers.redeemBlocked')
            : code === 'INVALID_REDEEM_AMOUNT' || code === 'LOYALTY_NOT_ELIGIBLE'
              ? t('redeemFailed')
              : code === 'RATE_LIMITED'
                ? tErr('RATE_LIMITED')
                : t('askBillFailed'),
        )
        if (code === 'OFFERS_EXCLUSIVE_DISCOUNT') setRedeemOpen(false)
        return
      }
      if (data.session) setSession(data.session)
      else {
        setSession((prev) =>
          prev ? { ...prev, billRequested: true } : { billRequested: true },
        )
      }
      setCart([])
      setDealCart([])
      setCartOpen(false)
      setRedeemOpen(false)
      setActionMessage(t('askBillConfirmed'))
    } catch {
      setActionMessage(t('askBillFailed'))
    } finally {
      setActionPending(false)
      setAskBillBusy(false)
    }
  }

  async function requestAskForBill() {
    if (actionPending || askBillBusy || !canAskForBill) return

    // Offers / deals on the table → loyalty redeem is not offered (server
    // also rejects it with OFFERS_EXCLUSIVE_DISCOUNT).
    const cachedRounds = /** @type {Array<Record<string, unknown>> | undefined} */ (
      queryClient.getQueryData(roundsQueryKey)
    )
    const offersOnTable =
      tableHasOfferLines ||
      (cachedRounds ?? []).some((round) =>
        (/** @type {Array<Record<string, unknown>>} */ (round.lines ?? [])).some(
          (line) => Boolean(line.offerId),
        ),
      )

    if (loyaltyLinked && !offersOnTable) {
      setAskBillBusy(true)
      try {
        const res = await fetch(
          `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/session`,
          { credentials: 'omit' },
        )
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.ok !== false) {
          if (data.session) setSession(data.session)
          if (data.loyaltyRedeem) setLoyaltyRedeem(data.loyaltyRedeem)
          else setLoyaltyRedeem(null)
          if (data.loyaltyRedeem?.eligible === true) {
            setRedeemOpen(true)
            return
          }
        } else if (loyaltyRedeem?.eligible === true) {
          setRedeemOpen(true)
          return
        }
      } catch {
        if (loyaltyRedeem?.eligible === true) {
          setRedeemOpen(true)
          return
        }
      } finally {
        setAskBillBusy(false)
      }
    }

    await askForBill(null)
  }

  /**
   * @param {{ loyaltyAccountId: string, balance: string }} payload
   */
  function handleLoyaltyLoggedIn(payload) {
    setLoyaltyAccountId(payload.loyaltyAccountId)
    setLoyaltyBalance(payload.balance)
    setLoyaltyPromptOpen(false)
    try {
      sessionStorage.setItem(
        `${LOYALTY_STORAGE_PREFIX}${slug}`,
        JSON.stringify(payload),
      )
    } catch {
      // ignore
    }
  }

  /**
   * @param {string} balance
   */
  function syncLoyaltyBalance(balance) {
    const next = String(balance ?? '0')
    setLoyaltyBalance(next)
    if (!loyaltyAccountId) return
    try {
      sessionStorage.setItem(
        `${LOYALTY_STORAGE_PREFIX}${slug}`,
        JSON.stringify({ loyaltyAccountId, balance: next }),
      )
    } catch {
      // ignore
    }
  }

  /**
   * @param {{
   *   lines: Array<{
   *     menuItemId: string | null
   *     quantity: number
   *     optionIds: string[]
   *     customizationIds: string[]
   *     reorderable: boolean
   *   }>
   * }} order
   */
  function reorderPastOrder(order) {
    if (orderingLocked) return
    let added = 0
    /** @type {Record<string, unknown> | null} */
    let firstConfigItem = null
    for (const line of order.lines ?? []) {
      if (!line.reorderable || !line.menuItemId) continue
      const menuItem = items.find((it) => it.id === line.menuItemId)
      if (!menuItem) continue
      const needsConfig =
        menuItemHasVariantGroups(menuItem) ||
        menuItemHasCustomizations(menuItem)
      const optionIds = Array.isArray(line.optionIds) ? line.optionIds : []
      const customizationIds = Array.isArray(line.customizationIds)
        ? line.customizationIds
        : []
      const qty = Math.max(1, Number(line.quantity) || 1)
      if (needsConfig && optionIds.length === 0 && customizationIds.length === 0) {
        if (!firstConfigItem) firstConfigItem = menuItem
        continue
      }
      addToCart(menuItem, optionIds, customizationIds, qty)
      added += 1
    }
    setPastOrdersOpen(false)
    if (firstConfigItem && added === 0) {
      setConfigItem(firstConfigItem)
      return
    }
    if (added > 0) {
      setActionMessage(t('pastOrdersAdded'))
      setCartOpen(true)
    }
  }

  async function callWaiter() {
    if (actionPending) return
    setActionPending(true)
    setActionMessage('')
    try {
      const res = await fetch(
        `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/call-waiter`,
        { method: 'POST', credentials: 'omit' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        setActionMessage(
          data.code === 'RATE_LIMITED'
            ? tErr('RATE_LIMITED')
            : t('callWaiterFailed'),
        )
        return
      }
      setWaiterCalled(true)
      setActionMessage(t('callWaiterConfirmed'))
    } catch {
      setActionMessage(t('callWaiterFailed'))
    } finally {
      setActionPending(false)
    }
  }

  if (pastOrdersOpen && loyaltyEnabled && loyaltyAccountId) {
    return (
      <EWaiterPastOrdersView
        themeId={themeId}
        locale={locale}
        slug={slug}
        qrToken={qrToken}
        loyaltyAccountId={loyaltyAccountId}
        orderingLocked={orderingLocked}
        onBack={() => setPastOrdersOpen(false)}
        onReorderOrder={reorderPastOrder}
        onLoyaltyBalance={syncLoyaltyBalance}
        loyaltyBadgeLabel={t('loyaltyPointsBadge', {
          balance: loyaltyBalance,
        })}
      />
    )
  }

  if (roundViewOpen && lastOrder?.kitchenOrderId) {
    return (
      <>
        <EWaiterRoundView
          themeId={themeId}
          locale={locale}
          slug={slug}
          qrToken={qrToken}
          kitchenOrderId={String(lastOrder.kitchenOrderId)}
          onBackToMenu={() => setRoundViewOpen(false)}
          onSessionEnded={() => {
            setSession(null)
            setLastOrder(null)
            setRoundViewOpen(false)
            setActionMessage('')
          }}
          billRequested={billRequested}
          canAskForBill={canAskForBill}
          waiterCalled={waiterCalled}
          actionPending={actionPending || askBillBusy}
          onAskForBill={() => void requestAskForBill()}
          askBillPending={askBillBusy}
          onCallWaiter={() => void callWaiter()}
          parentActionMessage={actionMessage}
          offers={offers}
          redeemBlockedNote={redeemBlockedNote}
        />
        {redeemOpen ? (
          <EWaiterRedeemSheet
            maxPoints={String(loyaltyRedeem?.effectiveCeiling ?? '0')}
            balance={String(loyaltyRedeem?.balance ?? loyaltyBalance)}
            pending={actionPending}
            onClose={() => setRedeemOpen(false)}
            onConfirm={(pts) => void askForBill(pts)}
          />
        ) : null}
      </>
    )
  }

  return (
    <div
      className="e-waiter-shell e-waiter-fade-in"
      data-ew={themeId}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <header className="e-waiter-surface sticky top-0 z-20 border-b e-waiter-border shadow-sm">
        <div className="e-waiter-content relative flex min-h-[calc(var(--e-waiter-logo)+1.5rem)] items-center justify-center px-hisabi-margin-mobile py-hisabi-md">
          <div className="absolute start-hisabi-margin-mobile top-1/2 z-10 -translate-y-1/2">
            <AuthLocaleToggle />
          </div>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public restaurant logo
            <img
              src={logoUrl}
              alt={restaurantName}
              className="e-waiter-logo rounded-xl object-contain e-waiter-surface"
            />
          ) : (
            <h1 className="type-headline-sm max-w-[min(100%,12rem)] truncate px-hisabi-xxl text-center font-semibold tracking-tight sm:max-w-[min(100%,20rem)]">
              {restaurantName}
            </h1>
          )}
          {!orderingLocked ? (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="e-waiter-btn-primary e-waiter-tap absolute end-hisabi-margin-mobile top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full shadow-sm active:scale-[0.96]"
              aria-label={t('openCart', { count: cartCount })}
            >
              <ShoppingBag className="size-5" aria-hidden />
              {cartCount > 0 ? (
                <span className="type-label-sm absolute -end-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-hisabi-error px-1 font-bold text-white">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      </header>

      <main className="e-waiter-main e-waiter-content px-hisabi-margin-mobile pt-hisabi-md">
        {bannerOffers.length > 0 ? (
          <EWaiterOfferBannerSlider
            offers={bannerOffers}
            locale={locale}
            onActivate={activateOffer}
          />
        ) : null}

        <div className="mb-hisabi-md space-y-hisabi-sm">
          {lastOrder ? (
            <button
              type="button"
              onClick={() => setRoundViewOpen(true)}
              className="e-waiter-surface flex w-full items-center gap-hisabi-md rounded-xl border e-waiter-border px-hisabi-md py-hisabi-md text-start shadow-sm active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1 space-y-hisabi-sm">
                <p className="type-label-md font-semibold">
                  {t('activeOrdersTitle', {
                    count: Math.max(1, menuRounds.length),
                  })}
                </p>
                {menuRoundsQuery.isLoading && menuRounds.length === 0 ? (
                  <p className="type-body-sm e-waiter-text-muted">
                    {t('roundLoading')}
                  </p>
                ) : (
                  <ul className="space-y-hisabi-xs">
                    {(menuRounds.length > 0
                      ? menuRounds
                      : [
                          {
                            roundNumber: lastOrder.roundNumber ?? 1,
                            orderNumber: lastOrder.orderNumber,
                            status: 'pending',
                          },
                        ]
                    ).map((round) => (
                      <li
                        key={String(
                          round.kitchenOrderId ??
                            `r-${round.roundNumber}-${round.orderNumber}`,
                        )}
                        className="flex items-center justify-between gap-hisabi-sm"
                      >
                        <span className="type-body-sm e-waiter-text-muted truncate">
                          {t('activeRoundRow', {
                            round: String(round.roundNumber ?? ''),
                            number: String(round.orderNumber ?? ''),
                          })}
                        </span>
                        <span className="type-label-sm e-waiter-primary-text shrink-0 font-semibold">
                          {roundStatusLabel(round.status, t)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="type-label-sm e-waiter-primary-text font-semibold">
                  {t('activeOrderTap')}
                </p>
              </div>
              <ChevronRight
                className="e-waiter-text-muted size-5 shrink-0 rtl:rotate-180"
                aria-hidden
              />
            </button>
          ) : null}

          <div className="flex gap-hisabi-sm">
            <button
              type="button"
              disabled={actionPending}
              onClick={() => void callWaiter()}
              className="type-label-sm e-waiter-chip flex min-h-[var(--e-waiter-tap)] flex-1 items-center justify-center gap-hisabi-xs rounded-xl px-hisabi-md font-semibold disabled:opacity-50 min-[768px]:flex-none min-[768px]:min-w-[10rem]"
            >
              <Bell className="size-4 shrink-0" aria-hidden />
              {waiterCalled ? t('waiterCalled') : t('callWaiter')}
            </button>
            {roundCount > 0 ? (
              <button
                type="button"
                disabled={actionPending || askBillBusy || billRequested}
                onClick={() => void requestAskForBill()}
                aria-busy={askBillBusy || undefined}
                className={cn(
                  'type-label-sm flex min-h-[var(--e-waiter-tap)] flex-1 items-center justify-center gap-hisabi-xs rounded-xl px-hisabi-md font-semibold disabled:opacity-50 min-[768px]:flex-none min-[768px]:min-w-[10rem]',
                  billRequested
                    ? 'e-waiter-chip-active'
                    : 'e-waiter-btn-primary',
                )}
              >
                {askBillBusy ? (
                  <HisabiSpinner size="inline" />
                ) : (
                  <Receipt className="size-4 shrink-0" aria-hidden />
                )}
                {billRequested
                  ? t('billRequested')
                  : askBillBusy
                    ? t('askBillPending')
                    : t('askForBill')}
              </button>
            ) : null}
          </div>

          {loyaltyEnabled && loyaltyAccountId ? (
            <button
              type="button"
              onClick={() => setPastOrdersOpen(true)}
              className="type-label-sm e-waiter-chip flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center gap-hisabi-xs rounded-xl font-semibold min-[768px]:w-auto min-[768px]:self-start min-[768px]:px-hisabi-lg"
            >
              <History className="size-4 shrink-0" aria-hidden />
              {t('pastOrdersOpen')}
            </button>
          ) : null}

          {locationBlocksOrdering ? (
            <div
              className="e-waiter-chip flex flex-col gap-hisabi-sm rounded-xl px-hisabi-md py-hisabi-md"
              role="status"
              aria-busy={locationGate === 'checking'}
            >
              <div className="flex items-center justify-center gap-hisabi-sm min-[768px]:justify-start">
                {locationGate === 'checking' ? (
                  <HisabiSpinner size="sm" className="e-waiter-primary-text" />
                ) : null}
                <p className="type-body-sm text-center font-medium min-[768px]:text-start">
                  {locationGateMessage()}
                </p>
              </div>
              {locationGate !== 'checking' ? (
                <button
                  type="button"
                  onClick={() => void verifyGuestLocation()}
                  className="type-label-sm e-waiter-btn-primary mx-auto min-h-[var(--e-waiter-tap)] rounded-xl px-hisabi-lg font-semibold min-[768px]:mx-0 min-[768px]:self-start"
                >
                  {t('locationRetry')}
                </button>
              ) : null}
            </div>
          ) : null}

          {billRequested ? (
            <p className="type-body-sm e-waiter-text-muted text-center min-[768px]:text-start">
              {t('billRequestedHint')}
            </p>
          ) : null}
          {actionMessage && !billRequested && !locationBlocksOrdering ? (
            <p className="type-body-sm text-center font-medium min-[768px]:text-start">
              {actionMessage}
            </p>
          ) : null}
          {offerNotice ? (
            <p
              className="type-body-sm text-center font-medium min-[768px]:text-start"
              role="status"
            >
              {offerNotice}
            </p>
          ) : null}
          {redeemBlockedNote && roundCount > 0 ? (
            <p className="type-body-sm e-waiter-text-muted text-center min-[768px]:text-start">
              {redeemBlockedNote}
            </p>
          ) : null}
        </div>

        <div ref={listTopRef} className="scroll-mt-hisabi-xxl" aria-hidden />

        <div
          className="mb-hisabi-md flex gap-hisabi-sm overflow-x-auto pb-hisabi-xs"
          role="tablist"
          aria-label={t('categoriesAria')}
        >
          <CategoryChip
            active={activeCategoryId === 'all' && !dealsSelected}
            label={t('categoryAll')}
            onClick={() => setActiveCategoryId('all')}
          />
          {featuredDeals.length > 0 ? (
            <CategoryChip
              active={dealsSelected}
              label={t('offers.dealsFilter')}
              onClick={() => setActiveCategoryId('deals')}
            />
          ) : null}
          {categories.map((cat) => (
            <CategoryChip
              key={String(cat.id)}
              active={activeCategoryId === cat.id}
              label={bilingualName(cat, locale)}
              onClick={() => setActiveCategoryId(String(cat.id))}
            />
          ))}
        </div>

        {offerFilter ? (
          <div className="mb-hisabi-md flex">
            <button
              type="button"
              onClick={() => setOfferFilterId(null)}
              className="type-label-sm e-waiter-chip-active inline-flex min-h-[var(--e-waiter-tap)] max-w-full items-center gap-hisabi-xs rounded-full px-hisabi-md font-semibold"
              title={t('offers.clearOfferFilter')}
            >
              <Tag className="size-4 shrink-0" aria-hidden />
              <span className="truncate">
                {t('offers.showingOffer', {
                  name: offerDisplayName(offerFilter, locale),
                })}
              </span>
              <X className="size-4 shrink-0" aria-hidden />
            </button>
          </div>
        ) : null}

        {dealsSelected ? (
          <ul className="e-waiter-menu-grid">
            {featuredDeals.map(({ offer, price }) => (
              <EWaiterDealCard
                key={String(offer.id)}
                offer={offer}
                locale={locale}
                price={price}
                disabled={orderingLocked}
                onActivate={activateOffer}
              />
            ))}
          </ul>
        ) : null}

        {!dealsSelected &&
        !offerFilter &&
        activeCategoryId === 'all' &&
        featuredDeals.length > 0 ? (
          <section
            className="mb-hisabi-lg space-y-hisabi-sm"
            aria-labelledby="e-waiter-featured-deals"
          >
            <h2
              id="e-waiter-featured-deals"
              className="type-title-md font-semibold"
            >
              {t('offers.featuredDeals')}
            </h2>
            <ul className="e-waiter-menu-grid">
              {featuredDeals.map(({ offer, price }) => (
                <EWaiterDealCard
                  key={String(offer.id)}
                  offer={offer}
                  locale={locale}
                  price={price}
                  disabled={orderingLocked}
                  onActivate={activateOffer}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {dealsSelected ? null : filteredItems.length === 0 ? (
          <p className="type-body-md e-waiter-text-muted py-hisabi-xxl text-center">
            {offerFilter ? t('offers.offerItemsUnavailable') : t('emptyMenu')}
          </p>
        ) : (
          <ul className="e-waiter-menu-grid">
            {filteredItems.map((item) => {
              const defaultOptionIds = optionIdsFromSelection(
                defaultVariantSelection(item),
              )
              const priceInc = vatInclusiveUnitPriceFromItem(
                item,
                defaultOptionIds,
                [],
              )
              const offerUnit = bestDisplayDiscount(offers, {
                menuItemId: String(item.id),
                unitPrice: computeUnitPriceFromItem(item, defaultOptionIds, []),
                variantOptionIds: defaultOptionIds,
              })
              const offerPriceInc = offerUnit
                ? vatInclusiveLineTotal({
                    quantity: 1,
                    unitPrice: offerUnit.unitPrice,
                    vatPreset: String(item.vatPreset ?? 'standard'),
                  })
                : null
              return (
                <li
                  key={String(item.id)}
                  className="e-waiter-surface e-waiter-fade-in e-waiter-menu-card rounded-xl border e-waiter-border p-hisabi-md shadow-sm"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- public menu image
                    <img
                      src={String(item.imageUrl)}
                      alt=""
                      className="e-waiter-thumb shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div
                      className="e-waiter-thumb e-waiter-chip flex shrink-0 items-center justify-center rounded-lg type-label-sm"
                      aria-hidden
                    >
                      {itemName(item, locale).slice(0, 1)}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-hisabi-xs">
                    <button
                      type="button"
                      className="text-start"
                      onClick={() => handleQuickAdd(item)}
                    >
                      <p className="type-label-md font-semibold leading-snug">
                        {itemName(item, locale)}
                      </p>
                      {normalizeCalories(item.calories) != null ? (
                        <p className="type-body-sm e-waiter-text-muted mt-0.5">
                          {t('calories', {
                            count: normalizeCalories(item.calories),
                          })}
                        </p>
                      ) : null}
                    </button>
                    <div className="mt-auto flex items-center justify-between gap-hisabi-sm pt-hisabi-xs">
                      <EWaiterOfferPrice
                        original={priceInc}
                        discounted={offerPriceInc}
                        locale={locale}
                      />
                      <button
                        type="button"
                        disabled={orderingLocked}
                        className="e-waiter-btn-primary e-waiter-tap inline-flex items-center justify-center rounded-full shadow-sm active:scale-[0.96] disabled:opacity-40"
                        aria-label={t('addItem', {
                          name: itemName(item, locale),
                        })}
                        onClick={() => handleQuickAdd(item)}
                      >
                        <Plus className="size-5" aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {configItem && !orderingLocked ? (
        <ItemConfigSheet
          item={configItem}
          offers={offers}
          locale={locale}
          onClose={() => setConfigItem(null)}
          onAdd={(optionIds, customizationIds, quantity) => {
            addToCart(configItem, optionIds, customizationIds, quantity)
            setConfigItem(null)
          }}
        />
      ) : null}

      {cartOpen && !orderingLocked ? (
        <CartSheet
          cart={cart}
          dealCart={dealCart}
          offersById={offersById}
          itemsById={itemsById}
          pricing={cartPricing}
          locale={locale}
          orderPending={orderPending}
          orderError={orderError}
          notice={offerNotice}
          onClose={() => {
            if (!orderPending) {
              setCartOpen(false)
              setOrderError('')
            }
          }}
          onBump={bumpQty}
          onBumpDeal={bumpDealQty}
          onRemoveDeal={removeDeal}
          dealRoomLeft={dealRoomLeft}
          onPlaceOrder={() => void placeOrder()}
        />
      ) : null}

      {dealSheetOffer && !orderingLocked ? (
        <EWaiterDealSheet
          offer={dealSheetOffer}
          itemsById={itemsById}
          offers={offers}
          locale={locale}
          maxBoxes={dealRoomLeft(dealSheetOffer)}
          onClose={() => setDealSheetOffer(null)}
          onAdd={(draft, quantity) => {
            if (addDealToCart(draft, quantity)) {
              setDealSheetOffer(null)
              setCartOpen(true)
            }
          }}
        />
      ) : null}

      {loyaltyEnabled && loyaltyPromptOpen ? (
        <EWaiterLoyaltyLoginSheet
          slug={slug}
          qrToken={qrToken}
          onSkip={() => setLoyaltyPromptOpen(false)}
          onLoggedIn={handleLoyaltyLoggedIn}
        />
      ) : null}

      {redeemOpen ? (
        <EWaiterRedeemSheet
          maxPoints={String(loyaltyRedeem?.effectiveCeiling ?? '0')}
          balance={String(loyaltyRedeem?.balance ?? loyaltyBalance)}
          pending={actionPending}
          onClose={() => setRedeemOpen(false)}
          onConfirm={(pts) => void askForBill(pts)}
        />
      ) : null}

      {loyaltyEnabled && loyaltyAccountId ? (
        <LoyaltyPointsBadge
          balance={loyaltyBalance}
          label={t('loyaltyPointsBadge', { balance: loyaltyBalance })}
        />
      ) : null}
    </div>
  )
}

/**
 * @param {{ active: boolean, label: string, onClick: () => void }} props
 */
function CategoryChip({ active, label, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'type-label-sm shrink-0 rounded-full px-hisabi-md py-2 font-semibold whitespace-nowrap transition-colors',
        active ? 'e-waiter-chip-active' : 'e-waiter-chip',
      )}
    >
      {label}
    </button>
  )
}

/**
 * Floating loyalty points pill (bottom-end).
 *
 * @param {{ balance: string, label: string }} props
 */
function LoyaltyPointsBadge({ balance: _balance, label }) {
  return (
    <div
      className="pointer-events-none fixed end-hisabi-margin-mobile z-30 bottom-[calc(var(--spacing-hisabi-lg)+var(--e-waiter-safe-bottom))]"
      role="status"
      aria-label={label}
    >
      <div className="e-waiter-surface pointer-events-auto rounded-xl border e-waiter-border px-hisabi-md py-hisabi-sm shadow-sm">
        <p className="type-label-md font-bold tabular-nums">{label}</p>
      </div>
    </div>
  )
}

/**
 * @param {{
 *   item: Record<string, unknown>
 *   offers: Array<Record<string, unknown>>
 *   locale: 'ar' | 'en'
 *   onClose: () => void
 *   onAdd: (optionIds: string[], customizationIds: string[], quantity: number) => void
 * }} props
 */
function ItemConfigSheet({ item, offers, locale, onClose, onAdd }) {
  const t = useTranslations('EWaiter')
  const [selection, setSelection] = useState(() =>
    defaultVariantSelection(item),
  )
  const [customIds, setCustomIds] = useState(/** @type {string[]} */ ([]))
  const [qty, setQty] = useState(1)

  const optionIds = optionIdsFromSelection(selection)
  const unitPrice = computeUnitPriceFromItem(item, optionIds, customIds)
  const lineInc = vatInclusiveLineTotal({
    quantity: qty,
    unitPrice,
    vatPreset: String(item.vatPreset ?? 'standard'),
  })
  const offerUnit = bestDisplayDiscount(offers, {
    menuItemId: String(item.id),
    unitPrice,
    variantOptionIds: optionIds,
  })
  const offerLineInc = offerUnit
    ? vatInclusiveLineTotal({
        quantity: qty,
        unitPrice: offerUnit.unitPrice,
        vatPreset: String(item.vatPreset ?? 'standard'),
      })
    : null
  const displayCalories = resolveLineDisplayCalories(
    item.calories,
    selectedVariantOptionsFromItem(item, optionIds),
  )

  const groups = /** @type {Array<Record<string, unknown>>} */ (
    item.variantGroups ?? []
  )
  const customs = /** @type {Array<Record<string, unknown>>} */ (
    item.customizations ?? []
  )

  const allGroupsPicked = groups.every((g) => Boolean(selection[String(g.id)]))

  return (
    <EWaiterSheetScaffold onClose={onClose} title={itemName(item, locale)}>
      <div className="space-y-hisabi-lg overflow-y-auto px-hisabi-margin-mobile">
        {displayCalories != null ? (
          <p className="type-body-sm e-waiter-text-muted">
            {t('calories', { count: displayCalories })}
          </p>
        ) : null}

        {groups.map((group) => (
          <fieldset key={String(group.id)} className="space-y-hisabi-sm">
            <legend className="type-label-md font-semibold">
              {bilingualName(group, locale)}
            </legend>
            <div className="flex flex-col gap-hisabi-xs">
              {(/** @type {Array<Record<string, unknown>>} */ (
                group.options ?? []
              )).map((opt) => {
                const selected = selection[String(group.id)] === opt.id
                const changeInc = vatInclusiveLineTotal({
                  quantity: 1,
                  unitPrice: String(opt.priceChange ?? '0'),
                  vatPreset: String(item.vatPreset ?? 'standard'),
                })
                const changeNum = Number(changeInc)
                const optCalories = resolveOptionDisplayCalories(
                  opt.calories,
                  item.calories,
                )
                return (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() =>
                      setSelection((prev) => ({
                        ...prev,
                        [String(group.id)]: String(opt.id),
                      }))
                    }
                    className={cn(
                      'flex min-h-[var(--e-waiter-tap)] items-center justify-between gap-hisabi-md rounded-xl border px-hisabi-md text-start transition-colors',
                      selected
                        ? 'e-waiter-chip-active border-transparent'
                        : 'e-waiter-border e-waiter-surface',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="type-body-md block">
                        {bilingualName(opt, locale)}
                      </span>
                      {optCalories != null ? (
                        <span className="type-body-sm block opacity-80">
                          {t('calories', { count: optCalories })}
                        </span>
                      ) : null}
                    </span>
                    {changeNum !== 0 ? (
                      <span className="type-body-sm shrink-0 opacity-90">
                        {changeNum > 0 ? '+' : ''}
                        {formatSarAmount(changeInc, locale)}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}

        {customs.length > 0 ? (
          <fieldset className="space-y-hisabi-sm">
            <legend className="type-label-md font-semibold">
              {t('extras')}
            </legend>
            <div className="flex flex-col gap-hisabi-xs">
              {customs.map((c) => {
                const on = customIds.includes(String(c.id))
                const changeInc = vatInclusiveLineTotal({
                  quantity: 1,
                  unitPrice: String(c.priceChange ?? '0'),
                  vatPreset: String(item.vatPreset ?? 'standard'),
                })
                const changeNum = Number(changeInc)
                return (
                  <button
                    key={String(c.id)}
                    type="button"
                    onClick={() => {
                      setCustomIds((prev) => {
                        const id = String(c.id)
                        return prev.includes(id)
                          ? prev.filter((x) => x !== id)
                          : [...prev, id]
                      })
                    }}
                    className={cn(
                      'flex min-h-[var(--e-waiter-tap)] items-center justify-between gap-hisabi-md rounded-xl border px-hisabi-md text-start transition-colors',
                      on
                        ? 'e-waiter-chip-active border-transparent'
                        : 'e-waiter-border e-waiter-surface',
                    )}
                  >
                    <span className="type-body-md">
                      {bilingualName(c, locale)}
                    </span>
                    {changeNum !== 0 ? (
                      <span className="type-body-sm shrink-0 opacity-90">
                        {changeNum > 0 ? '+' : ''}
                        {formatSarAmount(changeInc, locale)}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="flex items-center justify-between gap-hisabi-md">
          <p className="type-label-md font-semibold">{t('quantity')}</p>
          <div className="flex items-center gap-hisabi-sm">
            <button
              type="button"
              className="e-waiter-tap e-waiter-chip inline-flex items-center justify-center rounded-full"
              aria-label={t('decreaseQty')}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="type-label-md min-w-8 text-center font-bold">
              {qty}
            </span>
            <button
              type="button"
              className="e-waiter-tap e-waiter-btn-primary inline-flex items-center justify-center rounded-full"
              aria-label={t('increaseQty')}
              onClick={() => setQty((q) => q + 1)}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-hisabi-md border-t e-waiter-border px-hisabi-margin-mobile pt-hisabi-md">
        <button
          type="button"
          disabled={!allGroupsPicked}
          onClick={() => onAdd(optionIds, customIds, qty)}
          className="e-waiter-btn-primary type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-between gap-hisabi-md rounded-2xl px-hisabi-lg font-bold disabled:opacity-40"
        >
          <span>{t('addToCart')}</span>
          <EWaiterOfferPrice
            as="span"
            original={lineInc}
            discounted={offerLineInc}
            locale={locale}
            priceClassName="type-label-md font-bold"
            strikeClassName="type-body-sm line-through opacity-75"
            className="justify-end"
          />
        </button>
      </div>
    </EWaiterSheetScaffold>
  )
}

/**
 * @param {{
 *   cart: Array<Record<string, unknown>>
 *   dealCart: Array<{ key: string, offerId: string, quantity: number, components: Array<Record<string, any>> }>
 *   offersById: Map<string, Record<string, unknown>>
 *   itemsById: Map<string, Record<string, unknown>>
 *   pricing: ReturnType<typeof priceGuestCart>
 *   locale: 'ar' | 'en'
 *   orderPending: boolean
 *   orderError: string
 *   notice: string
 *   onClose: () => void
 *   onBump: (key: string, delta: number) => void
 *   onBumpDeal: (key: string, delta: number) => void
 *   onRemoveDeal: (key: string) => void
 *   dealRoomLeft: (offer: Record<string, unknown>) => number | null
 *   onPlaceOrder: () => void
 * }} props
 */
function CartSheet({
  cart,
  dealCart,
  offersById,
  itemsById,
  pricing,
  locale,
  orderPending,
  orderError,
  notice,
  onClose,
  onBump,
  onBumpDeal,
  onRemoveDeal,
  dealRoomLeft,
  onPlaceOrder,
}) {
  const t = useTranslations('EWaiter')
  const tErr = useTranslations('AuthErrors')
  const isEmpty = cart.length === 0 && dealCart.length === 0
  const hasSavings = pricing.ok && Number(pricing.savingsIncl) > 0
  const engineError =
    !pricing.ok && pricing.error ? tErr(String(pricing.error.code)) : ''

  return (
    <EWaiterSheetScaffold onClose={onClose} title={t('cartTitle')}>
      <div className="space-y-hisabi-md overflow-y-auto px-hisabi-margin-mobile">
        {isEmpty ? (
          <p className="type-body-md e-waiter-text-muted py-hisabi-lg text-center">
            {t('cartEmpty')}
          </p>
        ) : (
          <>
            {dealCart.map((deal, j) => {
              const offer = offersById.get(deal.offerId)
              const room = offer ? dealRoomLeft(offer) : 0
              const row = pricing.dealRows[j]
              return (
                <div
                  key={deal.key}
                  className="flex items-start gap-hisabi-md border-b e-waiter-border pb-hisabi-md"
                >
                  <div className="min-w-0 flex-1 space-y-hisabi-xs">
                    <p className="type-label-md flex flex-wrap items-center gap-hisabi-xs font-semibold">
                      <span className="type-label-sm e-waiter-btn-accent inline-flex rounded-full px-hisabi-sm font-semibold">
                        {t('offers.dealBadge')}
                      </span>
                      <span className="min-w-0">
                        {offer
                          ? offerDisplayName(offer, locale)
                          : t('offers.dealGeneric')}
                      </span>
                    </p>
                    <ul className="type-body-sm e-waiter-text-muted space-y-0.5">
                      {deal.components.map((c) => {
                        const menuItem = itemsById.get(String(c.menuItemId))
                        const opts = menuItem
                          ? optionNamesFor(menuItem, c.variantOptionIds ?? [], locale)
                          : []
                        const label = itemName(c, locale)
                        const qty = Number(c.quantity) || 1
                        return (
                          <li key={String(c.offerItemId)}>
                            {qty > 1
                              ? t('offers.componentQty', { qty, name: label })
                              : label}
                            {opts.length > 0 ? ` · ${opts.join(' · ')}` : ''}
                          </li>
                        )
                      })}
                    </ul>
                    {row ? (
                      <EWaiterOfferPrice
                        original={row.grossIncl}
                        discounted={pricing.ok ? row.netIncl : null}
                        locale={locale}
                        priceClassName="type-body-sm e-waiter-primary-text font-semibold"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-hisabi-xs">
                    <div className="flex items-center gap-hisabi-xs">
                      <button
                        type="button"
                        disabled={orderPending}
                        className="e-waiter-tap e-waiter-chip inline-flex items-center justify-center rounded-full disabled:opacity-50"
                        aria-label={t('decreaseQty')}
                        onClick={() => onBumpDeal(deal.key, -1)}
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <span className="type-label-md min-w-6 text-center font-bold">
                        {String(deal.quantity)}
                      </span>
                      <button
                        type="button"
                        disabled={orderPending || (room != null && room < 1)}
                        className="e-waiter-tap e-waiter-btn-primary inline-flex items-center justify-center rounded-full disabled:opacity-40"
                        aria-label={t('increaseQty')}
                        onClick={() => onBumpDeal(deal.key, 1)}
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={orderPending}
                      onClick={() => onRemoveDeal(deal.key)}
                      className="type-label-sm inline-flex min-h-[var(--e-waiter-tap)] items-center gap-1 rounded-full px-hisabi-sm font-semibold text-hisabi-error disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {t('offers.removeDeal')}
                    </button>
                  </div>
                </div>
              )
            })}
            {cart.map((line, i) => {
              const row = pricing.lineRows[i]
              const lineInc = vatInclusiveLineTotal({
                quantity: Number(line.quantity) || 0,
                unitPrice: String(line.unitPrice ?? '0'),
                vatPreset: String(line.vatPreset ?? 'standard'),
              })
              return (
                <div
                  key={String(line.key)}
                  className="flex items-center gap-hisabi-md border-b e-waiter-border pb-hisabi-md"
                >
                  <div className="min-w-0 flex-1">
                    <p className="type-label-md font-semibold">
                      {itemName(line, locale)}
                    </p>
                    <EWaiterOfferPrice
                      original={lineInc}
                      discounted={row?.offerId ? row.netIncl : null}
                      locale={locale}
                      priceClassName="type-body-sm e-waiter-text-muted"
                    />
                  </div>
                  <div className="flex items-center gap-hisabi-xs">
                    <button
                      type="button"
                      disabled={orderPending}
                      className="e-waiter-tap e-waiter-chip inline-flex items-center justify-center rounded-full disabled:opacity-50"
                      aria-label={t('decreaseQty')}
                      onClick={() => onBump(String(line.key), -1)}
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="type-label-md min-w-6 text-center font-bold">
                      {String(line.quantity)}
                    </span>
                    <button
                      type="button"
                      disabled={orderPending}
                      className="e-waiter-tap e-waiter-btn-primary inline-flex items-center justify-center rounded-full disabled:opacity-50"
                      aria-label={t('increaseQty')}
                      onClick={() => onBump(String(line.key), 1)}
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      <div className="mt-hisabi-md space-y-hisabi-sm border-t e-waiter-border px-hisabi-margin-mobile pt-hisabi-md">
        {hasSavings ? (
          <>
            <div className="flex items-center justify-between">
              <span className="type-body-sm e-waiter-text-muted">
                {t('offers.subtotal')}
              </span>
              <span className="type-body-sm e-waiter-text-muted">
                {formatSarAmount(pricing.grossIncl, locale)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="type-label-sm e-waiter-primary-text font-semibold">
                {t('offers.offerSavings')}
              </span>
              <span className="type-label-sm e-waiter-primary-text font-semibold">
                −{formatSarAmount(pricing.savingsIncl, locale)}
              </span>
            </div>
          </>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="type-label-md font-semibold">{t('cartTotal')}</span>
          <span className="type-headline-sm e-waiter-primary-text font-bold">
            {formatSarAmount(pricing.ok ? pricing.netIncl : pricing.grossIncl, locale)}
          </span>
        </div>
        {notice ? (
          <p className="type-body-sm text-center font-medium" role="status">
            {notice}
          </p>
        ) : null}
        {engineError ? (
          <p className="type-body-sm text-center text-hisabi-error" role="alert">
            {engineError}
          </p>
        ) : orderError ? (
          <p className="type-body-sm text-center text-hisabi-error" role="alert">
            {orderError}
          </p>
        ) : (
          <p className="type-body-sm e-waiter-text-muted text-center">
            {t('placeOrderHint')}
          </p>
        )}
        <button
          type="button"
          disabled={orderPending || isEmpty || !pricing.ok}
          onClick={onPlaceOrder}
          className="e-waiter-btn-primary type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl font-bold disabled:opacity-50"
        >
          {orderPending ? t('placingOrder') : t('placeOrder')}
        </button>
        <button
          type="button"
          disabled={orderPending}
          onClick={onClose}
          className="type-label-md e-waiter-text-muted flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl font-semibold disabled:opacity-50"
        >
          {t('keepBrowsing')}
        </button>
      </div>
    </EWaiterSheetScaffold>
  )
}
