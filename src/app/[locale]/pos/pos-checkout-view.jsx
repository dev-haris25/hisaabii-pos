'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { AppLoader } from '@/components/app-loader'
import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner'
import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { PosThermalReceiptPreview } from '@/components/invoices/pos-thermal-receipt-preview'
import { LineModifierSummary } from '@/components/pos/line-modifier-summary'
import {
  PosMoneyField,
  PosOnScreenNumpad,
  applyNumpadKey,
} from '@/components/pos/pos-on-screen-numpad'
import { PosItemModifiersFlow } from '@/components/pos/pos-item-modifiers-flow'
import { RequiredMark } from '@/components/ui/required-mark'
import { Link, useRouter } from '@/i18n/navigation'
import { AuthApiError, authGet, authPost } from '@/lib/api/auth-client'
import { getHisabiDesktop, isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'
import {
  openTillCashDrawer,
  writeTillCustomerDisplay,
} from '@/lib/desktop/till-hardware'
import { printDocument } from '@/lib/print/print-document'
import { receiptActionLabel } from '@/lib/print/receipt-action-label'
import { toastPrintError } from '@/lib/print/toast-print-error'
import { toastPrintResult } from '@/lib/print/toast-print-result'
import {
  allocateOrderDiscount,
  computeInvoiceTotals,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import {
  buildModifiersSnapshotFromItem,
  cartLineKey,
  menuItemHasCustomizations,
  menuItemHasVariantGroups,
} from '@/lib/menu/item-modifiers'
import {
  isDiscountWithinCap,
  isValidDiscountPercent,
  orderDiscountMoneyFromPercent,
  parseDiscountCap,
} from '@/lib/pos/discount-cap'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const MONEY_RE = /^\d+(\.\d{1,4})?$/

/**
 * Plain-language shortfall list for the POS stock modal.
 * @param {Array<Record<string, unknown>>} shortfalls
 * @param {string} locale
 * @param {(key: string, values?: Record<string, string>) => string} t
 */
function formatStockShortfallDetail(shortfalls, locale, t) {
  const names = shortfalls
    .map((s) => {
      if (locale === 'ar') return String(s.nameAr ?? '').trim()
      return String(s.nameEn || s.nameAr || '').trim()
    })
    .filter(Boolean)

  if (names.length === 0) return t('stockConfirmTitle')
  if (names.length === 1) {
    return t('stockConfirmShortOne', { name: names[0] })
  }
  if (names.length === 2) {
    return t('stockConfirmShortTwo', { a: names[0], b: names[1] })
  }
  return t('stockConfirmShortMany', {
    list: names.slice(0, -1).join(', '),
    last: names[names.length - 1],
  })
}

/**
 * @param {Array<Record<string, unknown>>} shortfalls
 * @param {string} locale
 * @param {(key: string, values?: Record<string, string>) => string} t
 */
function formatAllotmentMissingDetail(shortfalls, locale, t) {
  const names = shortfalls
    .map((s) => {
      if (locale === 'ar') return String(s.nameAr ?? '').trim()
      return String(s.nameEn || s.nameAr || '').trim()
    })
    .filter(Boolean)

  if (names.length === 0) return t('kitchenStockConfirmTitle')
  if (names.length === 1) {
    return t('kitchenStockConfirmShortOne', { name: names[0] })
  }
  if (names.length === 2) {
    return t('kitchenStockConfirmShortTwo', { a: names[0], b: names[1] })
  }
  return t('kitchenStockConfirmShortMany', {
    list: names.slice(0, -1).join(', '),
    last: names[names.length - 1],
  })
}

/**
 * @typedef {{
 *   lineKey: string
 *   menuItemId: string
 *   name: string
 *   nameAr: string
 *   unitPrice: string
 *   vatPreset: string
 *   quantity: number
 *   imageUrl: string | null
 *   variantOptionIds: string[]
 *   customizationIds: string[]
 *   variantSelection: Record<string, string>
 *   modifiersSnapshot: unknown
 *   lineNote: string
 * }} CartLine
 */

/**
 * @param {{
 *   staffName: string
 *   restaurantName: string
 *   restaurantLogoUrl?: string | null
 *   returnToInvoices?: boolean
 *   embedded?: boolean
 * }} props
 */
export function PosCheckoutView({
  staffName,
  restaurantName,
  restaurantLogoUrl = null,
  returnToInvoices = false,
  embedded = false,
}) {
  const t = useTranslations('Pos')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? s.user?.businessProfileId ?? null,
  )

  const cartPanelRef = useRef(/** @type {HTMLElement | null} */ (null))
  const [cartStickTop, setCartStickTop] = useState(/** @type {string | null} */ (null))

  const [categoryId, setCategoryId] = useState(/** @type {string | 'all'} */ ('all'))
  const [itemSearch, setItemSearch] = useState('')
  /** @type {[CartLine[], function]} */
  const [cart, setCart] = useState(/** @type {CartLine[]} */ ([]))
  const [paymentMethod, setPaymentMethod] = useState(
    /** @type {'cash' | 'card'} */ ('cash'),
  )
  const [amountTendered, setAmountTendered] = useState('')
  const [discount, setDiscount] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ discount: '', tendered: '' })
  const [numpadField, setNumpadField] = useState(
    /** @type {null | 'discount' | 'tendered'} */ (null),
  )
  /** @type {[Record<string, unknown> | null, function]} */
  const [receipt, setReceipt] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  /** @type {[{ item: Record<string, unknown> | null, mode: 'add' | 'edit', lineKey: string | null, selection?: Record<string, string>, customizationIds?: string[] }, function]} */
  const [configurator, setConfigurator] = useState({
    item: /** @type {Record<string, unknown> | null} */ (null),
    mode: /** @type {'add' | 'edit'} */ ('add'),
    lineKey: /** @type {string | null} */ (null),
  })
  const [stockConfirm, setStockConfirm] = useState(
    /** @type {{ shortfalls: Array<Record<string, unknown>> } | null} */ (null),
  )
  const [allotmentConfirm, setAllotmentConfirm] = useState(
    /** @type {{ shortfalls: Array<Record<string, unknown>> } | null} */ (null),
  )

  const menuQuery = useQuery({
    queryKey: ['pos', 'menu', activeBusinessProfileId],
    queryFn: () => authGet('/pos/menu'),
    enabled: Boolean(activeBusinessProfileId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })

  useEffect(() => {
    setCategoryId('all')
    setItemSearch('')
    setCart([])
    setReceipt(null)
    setDiscount('')
    setAmountTendered('')
    setPaymentMethod('cash')
    setNumpadField(null)
    router.refresh()
    void queryClient.invalidateQueries({ queryKey: ['pos', 'menu'] })
  }, [activeBusinessProfileId, queryClient, router])

  const categories = menuQuery.data?.categories ?? []
  const items = menuQuery.data?.items ?? []
  const discountCap = menuQuery.data?.discountCap ?? null
  const discountCapLimit = parseDiscountCap(discountCap)
  const keypadEnabled = menuQuery.data?.posOnScreenKeypad === true
  const desktop = isHisabiDesktop()

  const tillQuery = useQuery({
    queryKey: ['pos', 'bound-till'],
    enabled: desktop,
    queryFn: async () => {
      const tillId = await getHisabiDesktop()?.getTillId?.()
      if (!tillId) return { till: null }
      return authGet(`/pos/till?id=${encodeURIComponent(tillId)}`)
    },
    staleTime: 15_000,
  })
  const boundTill = tillQuery.data?.till ?? null

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    return items.filter((item) => {
      if (categoryId !== 'all' && item.categoryId !== categoryId) return false
      if (!q) return true
      const nameAr = String(item.nameAr ?? '').toLowerCase()
      const nameEn = String(item.nameEn ?? '').toLowerCase()
      return nameAr.includes(q) || nameEn.includes(q)
    })
  }, [items, categoryId, itemSearch])

  const cartTotals = useMemo(() => {
    if (cart.length === 0) {
      return {
        subtotal: '0.00',
        totalDiscount: '0.00',
        totalVat: '0.00',
        grandTotal: '0.00',
        perLine: [],
      }
    }
    const base = cart.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatPreset: line.vatPreset,
    }))
    const lineDiscounts = allocateOrderDiscount(
      base,
      orderDiscountMoneyFromPercent(base, discount.trim() || '0'),
    )
    return computeInvoiceTotals(
      base.map((line, i) => ({
        ...line,
        discount: lineDiscounts[i],
      })),
    )
  }, [cart, discount])

  useEffect(() => {
    if (!desktop) return undefined
    const text = cart.length === 0 ? '0.00' : String(cartTotals.grandTotal)
    const timer = window.setTimeout(() => {
      void writeTillCustomerDisplay(boundTill, text).catch(() => {})
    }, 200)
    return () => window.clearTimeout(timer)
  }, [desktop, boundTill, cart.length, cartTotals.grandTotal])

  const changeDisplay = useMemo(() => {
    if (paymentMethod !== 'cash') return null
    const tendered = parseMoney(amountTendered)
    const grand = parseMoney(cartTotals.grandTotal)
    if (!amountTendered.trim() || tendered < grand) return null
    return decimalStringFromNumber(tendered - grand)
  }, [paymentMethod, amountTendered, cartTotals.grandTotal])

  useLayoutEffect(() => {
    const el = cartPanelRef.current
    if (!el) return

    const update = () => {
      const desktop = window.matchMedia('(min-width: 1024px)').matches
      if (!desktop) {
        setCartStickTop(null)
        return
      }
      const headerPx = embedded ? 16 : 72
      const gapPx = 16
      const top = Math.min(headerPx, window.innerHeight - el.offsetHeight - gapPx)
      setCartStickTop(`${top}px`)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [embedded, cart, discount, paymentMethod, amountTendered])

  const logoutMutation = useMutation({
    mutationFn: () => authPost('/logout'),
    onSuccess: () => {
      setUser(null)
      queryClient.clear()
      router.replace('/login')
    },
  })

  const checkoutMutation = useMutation({
    mutationFn: (
      /** @type {{ allowNegativeStock?: boolean, allowMainStockIfNoKitchenStock?: boolean } | void} */ opts,
    ) => {
      const options = opts && typeof opts === 'object' ? opts : {}
      /** @type {Record<string, unknown>} */
      const body = {
        lines: cart.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          variantOptionIds: l.variantOptionIds ?? [],
          customizationIds: l.customizationIds ?? [],
          lineNote: l.lineNote?.trim() || undefined,
        })),
        paymentMethod,
      }
      if (paymentMethod === 'cash') {
        body.amountTendered = amountTendered.trim()
      }
      const disc = discount.trim()
      if (disc && parseMoney(disc) > 0) {
        body.discount = disc
      }
      if (options.allowNegativeStock) {
        body.allowNegativeStock = true
      }
      if (options.allowMainStockIfNoKitchenStock) {
        body.allowMainStockIfNoKitchenStock = true
      }
      return authPost('/pos/checkout', body)
    },
    onSuccess: (data) => {
      setStockConfirm(null)
      setAllotmentConfirm(null)
      setReceipt(data.invoice ?? null)
      setCart([])
      setAmountTendered('')
      setDiscount('')
      setPaymentMethod('cash')
      setFieldErrors({ discount: '', tendered: '' })
      setNumpadField(null)
      void openTillCashDrawer(boundTill).catch(() => {})
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      if (code === 'DISCOUNT_EXCEEDS_CAP') {
        setFieldErrors((prev) => ({
          ...prev,
          discount: t('validationDiscountCap'),
        }))
        scrollAfterFieldValidation()
        return
      }
      if (
        code === 'NO_KITCHEN_STOCK_CONFIRM' ||
        code === 'NO_ALLOTMENT_CONFIRM'
      ) {
        const details =
          err instanceof AuthApiError && Array.isArray(err.details)
            ? err.details
            : []
        setAllotmentConfirm({ shortfalls: details })
        return
      }
      if (code === 'INSUFFICIENT_STOCK_CONFIRM') {
        const details =
          err instanceof AuthApiError && Array.isArray(err.details)
            ? err.details
            : []
        setStockConfirm({ shortfalls: details })
        return
      }
      if (code === 'INSUFFICIENT_STOCK') {
        // Hard block (e.g. unexpected); still surface shortfalls if present.
        const details =
          err instanceof AuthApiError && Array.isArray(err.details)
            ? err.details
            : []
        if (details.length > 0) {
          setStockConfirm({ shortfalls: details })
          return
        }
        toast.error(tErr('INSUFFICIENT_STOCK'))
        return
      }
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  function itemDisplayName(item) {
    return locale === 'ar'
      ? item.nameAr
      : item.nameEn?.trim() || item.nameAr
  }

  function categoryDisplayName(cat) {
    return locale === 'ar'
      ? cat.nameAr
      : cat.nameEn?.trim() || cat.nameAr
  }

  function commitCartLine(item, payload, existingKey = null) {
    const nextKey = cartLineKey(
      item.id,
      payload.variantOptionIds,
      payload.customizationIds,
    )
    const snapshot = buildModifiersSnapshotFromItem(
      item,
      payload.variantOptionIds,
      payload.customizationIds,
    )
    const name = itemDisplayName(item)
    const nameAr = String(item.nameAr ?? '').trim()
    setCart((prev) => {
      if (existingKey) {
        return prev.map((line) =>
          line.lineKey === existingKey
            ? {
                ...line,
                lineKey: nextKey,
                name,
                nameAr,
                unitPrice: payload.unitPrice,
                variantOptionIds: payload.variantOptionIds,
                customizationIds: payload.customizationIds,
                variantSelection: payload.variantSelection,
                modifiersSnapshot: snapshot,
              }
            : line,
        )
      }
      const idx = prev.findIndex((line) => line.lineKey === nextKey)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          quantity: Math.min(999, next[idx].quantity + 1),
        }
        return next
      }
      return [
        ...prev,
        {
          lineKey: nextKey,
          menuItemId: item.id,
          name,
          nameAr,
          unitPrice: payload.unitPrice,
          vatPreset: item.vatPreset,
          quantity: 1,
          imageUrl:
            typeof item.imageUrl === 'string' && item.imageUrl
              ? item.imageUrl
              : null,
          variantOptionIds: payload.variantOptionIds,
          customizationIds: payload.customizationIds,
          variantSelection: payload.variantSelection,
          modifiersSnapshot: snapshot,
          lineNote: '',
        },
      ]
    })
    setConfigurator({ item: null, mode: 'add', lineKey: null })
  }

  function addToCart(item) {
    const hasV = menuItemHasVariantGroups(item)
    const hasC = menuItemHasCustomizations(item)
    if (!hasV && !hasC) {
      commitCartLine(
        item,
        {
          variantOptionIds: [],
          customizationIds: [],
          variantSelection: {},
          unitPrice: String(item.price),
        },
        null,
      )
      return
    }
    setConfigurator({
      item,
      mode: 'add',
      lineKey: null,
    })
  }

  function editCartLine(line) {
    const item = items.find((row) => row.id === line.menuItemId)
    if (!item) return
    if (
      !menuItemHasVariantGroups(item) &&
      !menuItemHasCustomizations(item)
    ) {
      return
    }
    setConfigurator({
      item,
      mode: 'edit',
      lineKey: line.lineKey,
      selection: line.variantSelection,
      customizationIds: line.customizationIds,
    })
  }

  function setQty(lineKey, quantity) {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.lineKey !== lineKey)
      return prev.map((l) =>
        l.lineKey === lineKey
          ? { ...l, quantity: Math.min(999, quantity) }
          : l,
      )
    })
  }

  function setLineNote(lineKey, lineNote) {
    setCart((prev) =>
      prev.map((l) => (l.lineKey === lineKey ? { ...l, lineNote } : l)),
    )
  }

  function removeLine(lineKey) {
    setCart((prev) => prev.filter((l) => l.lineKey !== lineKey))
  }

  function clearCart() {
    setCart([])
    setAmountTendered('')
    setDiscount('')
  }

  const printMutation = useMutation({
    mutationFn: () => {
      const invoiceId =
        receipt && typeof receipt.id === 'string' ? receipt.id : ''
      if (!invoiceId) {
        throw new AuthApiError(400, 'VALIDATION_ERROR', 'Missing invoice')
      }
      return printDocument({
        invoiceId,
        invoice: receipt ?? undefined,
        logoUrl: restaurantLogoUrl,
      })
    },
    onSuccess: (data) => {
      toastPrintResult(t, data)
    },
    onError: (err) => {
      toastPrintError(err)
    },
  })

  function closeReceipt() {
    setReceipt(null)
  }

  const canCheckout = cart.length > 0 && !checkoutMutation.isPending

  function handleCheckout() {
    const nextErrors = { discount: '', tendered: '' }
    const disc = discount.trim()
    if (disc) {
      if (!isValidDiscountPercent(disc)) {
        nextErrors.discount = t('validationDiscount')
      } else if (!isDiscountWithinCap(disc, discountCap)) {
        nextErrors.discount = t('validationDiscountCap')
      }
    }
    if (paymentMethod === 'cash') {
      const tendered = amountTendered.trim()
      if (!tendered || !MONEY_RE.test(tendered)) {
        nextErrors.tendered = t('validationTendered')
      } else if (parseMoney(tendered) < parseMoney(cartTotals.grandTotal)) {
        nextErrors.tendered = t('validationTenderedShort')
      }
    }
    if (nextErrors.discount || nextErrors.tendered) {
      setFieldErrors(nextErrors)
      scrollAfterFieldValidation()
      return
    }
    setFieldErrors({ discount: '', tendered: '' })
    setNumpadField(null)
    checkoutMutation.mutate()
  }

  function openNumpad(field) {
    if (!keypadEnabled) return
    setNumpadField(field)
  }

  function handleNumpadKey(key) {
    if (numpadField === 'discount') {
      setDiscount((prev) => applyNumpadKey(prev, key))
      if (fieldErrors.discount) {
        setFieldErrors((prev) => ({ ...prev, discount: '' }))
      }
      return
    }
    if (numpadField === 'tendered') {
      setAmountTendered((prev) => applyNumpadKey(prev, key))
      if (fieldErrors.tendered) {
        setFieldErrors((prev) => ({ ...prev, tendered: '' }))
      }
    }
  }

  return (
    <div
      className={cn(
        'type-body-md text-hisabi-on-surface flex flex-col bg-hisabi-background',
        embedded ? 'min-h-[calc(100dvh-4rem)]' : 'min-h-dvh',
      )}
    >
      {embedded ? null : (
        <header className="border-hisabi-outline-variant/40 shadow-hisabi-1 sticky top-0 z-30 grid min-h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-hisabi-md border-b bg-hisabi-surface-container-lowest px-hisabi-md py-2 md:px-hisabi-lg">
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
        </header>
      )}

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-hisabi-md p-hisabi-md lg:flex-row lg:items-stretch lg:gap-hisabi-lg lg:p-hisabi-lg">
        <section className="flex min-w-0 flex-1 flex-col gap-hisabi-md">
          <label className="relative block">
            <span className="sr-only">{t('searchItems')}</span>
            <Search
              className="text-hisabi-outline pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
              aria-hidden
            />
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
              className="type-body-md text-hisabi-on-surface w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest py-hisabi-sm ps-10 pe-10 outline-none transition-colors focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10"
            />
            {itemSearch ? (
              <button
                type="button"
                onClick={() => setItemSearch('')}
                aria-label={t('searchClear')}
                className="text-hisabi-outline hover:bg-hisabi-surface-container absolute end-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg transition-colors"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </label>
          <div className="flex gap-hisabi-sm overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setCategoryId('all')}
              className={cn(
                'type-label-sm shrink-0 cursor-pointer rounded-xl px-hisabi-md py-2 font-bold transition-colors',
                categoryId === 'all'
                  ? 'bg-hisabi-primary-container text-white'
                  : 'bg-hisabi-surface-container-lowest text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
              )}
            >
              {t('allCategories')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={cn(
                  'type-label-sm shrink-0 cursor-pointer rounded-xl px-hisabi-md py-2 font-bold transition-colors',
                  categoryId === cat.id
                    ? 'bg-hisabi-primary-container text-white'
                    : 'bg-hisabi-surface-container-lowest text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                )}
              >
                {categoryDisplayName(cat)}
              </button>
            ))}
          </div>

          {menuQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center py-hisabi-xxl">
              <AppLoader />
            </div>
          ) : menuQuery.isError ? (
            <p className="type-body-md text-hisabi-error py-hisabi-xl text-center" role="alert">
              {tErr(
                menuQuery.error instanceof AuthApiError
                  ? menuQuery.error.code
                  : 'generic',
              )}
            </p>
          ) : filteredItems.length === 0 ? (
            <p className="type-body-md text-hisabi-on-surface-variant py-hisabi-xl text-center">
              {items.length === 0
                ? t('emptyMenu')
                : itemSearch.trim()
                  ? t('emptySearch')
                  : t('emptyCategory')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-hisabi-sm sm:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map((item) => {
                const name = itemDisplayName(item)
                const arabicUnderEn =
                  locale !== 'ar' ? String(item.nameAr ?? '').trim() : ''
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addToCart(item)}
                    className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest text-start shadow-sm transition-all hover:border-hisabi-primary/40 hover:shadow-md active:scale-[0.98]"
                  >
                    <div className="bg-hisabi-surface-container-high text-hisabi-primary relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden text-lg font-bold">
                      {typeof item.imageUrl === 'string' && item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authenticated menu image
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : (
                        name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-hisabi-md">
                      <span className="type-body-md line-clamp-2 pb-0.5 font-bold leading-normal text-hisabi-on-surface">
                        {name}
                      </span>
                      {arabicUnderEn ? (
                        <span className="type-body-sm line-clamp-2 text-start text-hisabi-on-surface-variant">
                          {arabicUnderEn}
                        </span>
                      ) : null}
                      <span
                        dir="ltr"
                        className="type-body-sm font-medium text-hisabi-teal"
                      >
                        {formatSarAmount(item.price, locale)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <aside
          ref={cartPanelRef}
          style={cartStickTop ? { top: cartStickTop } : undefined}
          className="border-hisabi-outline-variant/30 flex w-full shrink-0 flex-col rounded-xl border bg-hisabi-surface-container-lowest shadow-sm lg:w-[380px] lg:self-start lg:sticky"
        >
          <div className="flex items-center justify-between gap-hisabi-sm border-b border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
            <div className="flex items-center gap-hisabi-sm">
              <ShoppingCart className="size-5 text-hisabi-primary" aria-hidden />
              <h2 className="type-headline-md font-bold text-hisabi-primary">
                {t('cartTitle')}
              </h2>
            </div>
            {cart.length > 0 ? (
              <button
                type="button"
                onClick={clearCart}
                className="type-label-sm text-hisabi-error hover:bg-hisabi-error/8 cursor-pointer rounded-lg px-2 py-1 font-bold transition-colors"
              >
                {t('clearCart')}
              </button>
            ) : null}
          </div>

          <div className="space-y-hisabi-sm px-hisabi-md py-hisabi-md">
            {cart.length === 0 ? (
              <p className="type-body-md text-hisabi-on-surface-variant py-hisabi-xl text-center">
                {t('emptyCart')}
              </p>
            ) : (
              cart.map((line, idx) => {
                const lineTotal =
                  cartTotals.perLine[idx]?.lineTotalStr ??
                  decimalStringFromNumber(
                    parseMoney(line.unitPrice) * line.quantity,
                  )
                return (
                  <div
                    key={line.lineKey}
                    className="flex items-stretch gap-hisabi-sm rounded-lg bg-hisabi-surface-container-low/60 px-hisabi-sm py-hisabi-sm"
                  >
                    <div className="bg-hisabi-surface-container-high text-hisabi-primary relative flex w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold self-stretch min-h-[4.5rem]">
                      {line.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authenticated menu image
                        <img
                          src={line.imageUrl}
                          alt=""
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : (
                        line.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => editCartLine(line)}
                        className="block w-full min-w-0 text-start hover:underline"
                      >
                        <span className="type-label-md line-clamp-2 font-bold text-hisabi-on-surface">
                          {line.name}
                        </span>
                        {locale !== 'ar' && line.nameAr ? (
                          <span className="type-body-sm mt-0.5 line-clamp-2 block text-start text-hisabi-on-surface-variant">
                            {line.nameAr}
                          </span>
                        ) : null}
                      </button>
                      <LineModifierSummary
                        snapshot={line.modifiersSnapshot}
                        locale={locale}
                      />
                      <p dir="ltr" className="type-body-sm text-hisabi-on-surface-variant">
                        {formatSarAmount(line.unitPrice, locale)} × {line.quantity}
                      </p>
                      <label className="mt-hisabi-xs block">
                        <span className="sr-only">{t('lineNote')}</span>
                        <input
                          type="text"
                          value={line.lineNote}
                          maxLength={300}
                          onChange={(e) =>
                            setLineNote(line.lineKey, e.target.value.slice(0, 300))
                          }
                          placeholder={t('lineNotePlaceholder')}
                          className="type-body-sm text-hisabi-on-surface w-full rounded-md border border-hisabi-outline-variant/50 bg-white px-2 py-1 outline-none focus:border-hisabi-primary"
                        />
                      </label>
                      <div className="mt-hisabi-xs flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={t('qtyDecrease')}
                          onClick={() =>
                            setQty(line.lineKey, line.quantity - 1)
                          }
                          className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hisabi-outline-variant/50 bg-white text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
                        >
                          <Minus className="size-4" aria-hidden />
                        </button>
                        <span
                          dir="ltr"
                          className="type-label-md w-8 text-center font-bold"
                        >
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={t('qtyIncrease')}
                          onClick={() =>
                            setQty(line.lineKey, line.quantity + 1)
                          }
                          className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hisabi-outline-variant/50 bg-white text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
                      <span
                        dir="ltr"
                        className="type-label-md font-bold text-hisabi-on-surface"
                      >
                        {formatSarAmount(lineTotal, locale)}
                      </span>
                      <button
                        type="button"
                        aria-label={t('removeLine')}
                        onClick={() => removeLine(line.lineKey)}
                        className="text-hisabi-error hover:bg-hisabi-error/8 flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="space-y-hisabi-md border-t border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
            <div className="space-y-1">
              <div className="type-body-sm flex justify-between text-hisabi-on-surface-variant">
                <span>{t('subtotal')}</span>
                <span dir="ltr">{formatSarAmount(cartTotals.subtotal, locale)}</span>
              </div>
              {parseMoney(cartTotals.totalDiscount) > 0 ? (
                <div className="type-body-sm flex justify-between text-hisabi-on-surface-variant">
                  <span>{t('discount')}</span>
                  <span dir="ltr">−{formatSarAmount(cartTotals.totalDiscount, locale)}</span>
                </div>
              ) : null}
              <div className="type-body-sm flex justify-between text-hisabi-on-surface-variant">
                <span>{t('vat')}</span>
                <span dir="ltr">{formatSarAmount(cartTotals.totalVat, locale)}</span>
              </div>
              <div className="type-label-md flex justify-between font-bold text-hisabi-on-surface">
                <span>{t('grandTotal')}</span>
                <span dir="ltr">{formatSarAmount(cartTotals.grandTotal, locale)}</span>
              </div>
            </div>

            <div className="space-y-hisabi-xs">
              <label
                htmlFor="pos-discount"
                className="type-label-sm text-hisabi-on-surface-variant block"
              >
                {t('discount')}
              </label>
              <PosMoneyField
                id="pos-discount"
                keypadEnabled={keypadEnabled}
                active={numpadField === 'discount'}
                dir="ltr"
                value={discount}
                onChange={(e) => {
                  if (keypadEnabled) return
                  setDiscount(e.target.value)
                  if (fieldErrors.discount) {
                    setFieldErrors((prev) => ({ ...prev, discount: '' }))
                  }
                }}
                onClick={() => openNumpad('discount')}
                onFocus={() => openNumpad('discount')}
                placeholder={t('discountPlaceholder')}
                className={cn(
                  'type-body-md text-hisabi-on-surface w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-hisabi-sm outline-none focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10',
                  fieldErrors.discount &&
                    'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                )}
                aria-invalid={fieldErrors.discount ? true : undefined}
                aria-describedby={
                  fieldErrors.discount ? 'pos-discount-error' : undefined
                }
              />
              {fieldErrors.discount ? (
                <p
                  id="pos-discount-error"
                  className="type-body-sm text-hisabi-error"
                  role="alert"
                >
                  {fieldErrors.discount}
                </p>
              ) : null}
              {discountCapLimit != null ? (
                <p className="type-body-sm text-hisabi-on-surface-variant">
                  {t('discountCapHint', {
                    percent: discountCapLimit,
                  })}
                </p>
              ) : null}
            </div>

            <div>
              <p className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-xs">
                {t('paymentMethod')}
              </p>
              <div className="flex rounded-lg border border-hisabi-outline-variant/60 bg-white p-1">
                {(
                  /** @type {const} */ ([
                    ['cash', 'paymentCash'],
                    ['card', 'paymentCard'],
                  ])
                ).map(([key, labelKey]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(key)
                      if (key !== 'cash' && numpadField === 'tendered') {
                        setNumpadField(null)
                      }
                    }}
                    className={cn(
                      'type-label-sm flex-1 cursor-pointer rounded-lg px-hisabi-md py-2 font-bold transition-colors',
                      paymentMethod === key
                        ? 'bg-hisabi-primary-container text-white'
                        : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                    )}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'cash' ? (
              <div className="space-y-hisabi-xs">
                <label
                  htmlFor="pos-tendered"
                  className="type-label-sm text-hisabi-on-surface-variant block"
                >
                  {t('amountReceived')}
                  <RequiredMark />
                </label>
                <PosMoneyField
                  id="pos-tendered"
                  keypadEnabled={keypadEnabled}
                  active={numpadField === 'tendered'}
                  dir="ltr"
                  value={amountTendered}
                  onChange={(e) => {
                    if (keypadEnabled) return
                    setAmountTendered(e.target.value)
                    if (fieldErrors.tendered) {
                      setFieldErrors((prev) => ({ ...prev, tendered: '' }))
                    }
                  }}
                  onClick={() => openNumpad('tendered')}
                  onFocus={() => openNumpad('tendered')}
                  placeholder={t('amountReceivedPlaceholder')}
                  className={cn(
                    'type-body-md text-hisabi-on-surface w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-hisabi-sm outline-none focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10',
                    fieldErrors.tendered &&
                      'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                  )}
                  aria-invalid={fieldErrors.tendered ? true : undefined}
                  aria-describedby={
                    fieldErrors.tendered ? 'pos-tendered-error' : undefined
                  }
                />
                {fieldErrors.tendered ? (
                  <p
                    id="pos-tendered-error"
                    className="type-body-sm text-hisabi-error"
                    role="alert"
                  >
                    {fieldErrors.tendered}
                  </p>
                ) : null}
                {changeDisplay != null ? (
                  <p className="type-label-md flex justify-between font-bold text-hisabi-teal">
                    <span>{t('change')}</span>
                    <span dir="ltr">{formatSarAmount(changeDisplay, locale)}</span>
                  </p>
                ) : null}
              </div>
            ) : null}

            <AuthSubmitButton
              type="button"
              disabled={!canCheckout}
              pending={checkoutMutation.isPending}
              onClick={handleCheckout}
            >
              {t('checkout')}
            </AuthSubmitButton>
          </div>
        </aside>
      </div>

      {keypadEnabled ? (
        <PosOnScreenNumpad
          open={numpadField != null}
          title={
            numpadField === 'tendered' ? t('amountReceived') : t('discount')
          }
          value={numpadField === 'tendered' ? amountTendered : discount}
          onKey={handleNumpadKey}
          onClose={() => setNumpadField(null)}
          onDone={() => setNumpadField(null)}
        />
      ) : null}

      <PosItemModifiersFlow
        open={Boolean(configurator.item)}
        item={configurator.item}
        locale={locale}
        mode={configurator.mode}
        initialSelection={configurator.selection}
        initialCustomizationIds={configurator.customizationIds}
        onClose={() =>
          setConfigurator({ item: null, mode: 'add', lineKey: null })
        }
        onConfirm={(payload) => {
          if (!configurator.item) return
          commitCartLine(
            configurator.item,
            payload,
            configurator.lineKey,
          )
        }}
      />

      {receipt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-hisabi-md backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-receipt-title"
            className="relative flex max-h-[min(92vh,900px)] w-full max-w-[22rem] flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-hisabi-2"
          >
            <button
              type="button"
              onClick={closeReceipt}
              className="text-hisabi-outline hover:bg-hisabi-surface-container absolute end-2 top-2 z-10 cursor-pointer rounded-lg p-2 transition-colors"
              aria-label={t('newSale')}
            >
              <X className="size-5" aria-hidden />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto px-hisabi-lg py-hisabi-lg">
              <p
                id="pos-receipt-title"
                className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-sm text-center"
              >
                {t('successTitle')} — {t('receiptPreviewHint')}
              </p>

              <PosThermalReceiptPreview
                invoice={/** @type {any} */ (receipt)}
                logoUrl={restaurantLogoUrl}
                fallbackStaffName={staffName}
                fallbackSellerName={restaurantName}
              />
            </div>

            <div className="shrink-0 space-y-hisabi-sm border-t border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest px-hisabi-lg py-hisabi-md">
              {typeof receipt.qrCode === 'string' && receipt.qrCode ? (
                <AuthSubmitButton
                  type="button"
                  pending={printMutation.isPending}
                  onClick={() => printMutation.mutate()}
                >
                  {receiptActionLabel(t)}
                </AuthSubmitButton>
              ) : (
                <p className="type-body-sm text-hisabi-on-surface-variant text-center">
                  {t('printBlockedNoQr')}
                </p>
              )}
              <AuthSubmitButton
                type="button"
                variant="secondary"
                onClick={closeReceipt}
              >
                {t('newSale')}
              </AuthSubmitButton>
            </div>
          </div>
        </div>
      ) : null}

      <HisabiStatusModal
        open={Boolean(allotmentConfirm)}
        onOpenChange={(open) => {
          if (!open) setAllotmentConfirm(null)
        }}
        variant="warning"
        title={t('kitchenStockConfirmTitle')}
        description={
          allotmentConfirm
            ? t('kitchenStockConfirmBody', {
                detail: formatAllotmentMissingDetail(
                  allotmentConfirm.shortfalls,
                  locale,
                  t,
                ),
              })
            : undefined
        }
        primaryLabel={t('kitchenStockConfirmContinue')}
        secondaryLabel={t('kitchenStockConfirmCancel')}
        primaryPending={checkoutMutation.isPending}
        onPrimary={() => {
          checkoutMutation.mutate({ allowMainStockIfNoKitchenStock: true })
        }}
        onSecondary={() => setAllotmentConfirm(null)}
      />

      <HisabiStatusModal
        open={Boolean(stockConfirm)}
        onOpenChange={(open) => {
          if (!open) setStockConfirm(null)
        }}
        variant="warning"
        title={t('stockConfirmTitle')}
        description={
          stockConfirm
            ? t('stockConfirmBody', {
                detail: formatStockShortfallDetail(
                  stockConfirm.shortfalls,
                  locale,
                  t,
                ),
              })
            : undefined
        }
        primaryLabel={t('stockConfirmContinue')}
        secondaryLabel={t('stockConfirmCancel')}
        primaryPending={checkoutMutation.isPending}
        onPrimary={() => {
          checkoutMutation.mutate({ allowNegativeStock: true })
        }}
        onSecondary={() => setStockConfirm(null)}
      />
    </div>
  )
}
