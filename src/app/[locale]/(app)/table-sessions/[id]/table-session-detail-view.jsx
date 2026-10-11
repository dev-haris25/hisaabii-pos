'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Receipt, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AppLoader } from '@/components/app-loader'
import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { TABLE_SESSION_ALERTS_QUERY_KEY } from '@/components/app-shell/table-session-alert-toast-listener'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import {
  PosMoneyField,
  PosOnScreenNumpad,
  applyNumpadKey,
} from '@/components/pos/pos-on-screen-numpad'
import { PageBackButton } from '@/components/shared/page-back-button'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { TableSessionReceiptModal } from '../table-session-receipt-modal'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authGet, authPost } from '@/lib/api/auth-client'
import {
  allocateOrderDiscount,
  computeInvoiceTotals,
  computeLineAmounts,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import {
  isDiscountWithinCap,
  isValidDiscountPercent,
  orderDiscountMoneyFromPercent,
  parseDiscountCap,
} from '@/lib/pos/discount-cap'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

/**
 * @param {{
 *   sessionId: string
 *   embedded?: boolean
 *   onClose?: () => void
 *   onSettled?: (invoice: Record<string, unknown>) => void
 * }} props
 */
export function TableSessionDetailView({
  sessionId,
  embedded = false,
  onClose,
  onSettled,
}) {
  const t = useTranslations('TableSessions')
  const tPos = useTranslations('Pos')
  const tKitchen = useTranslations('KitchenQueue')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const ability = useAppAbility()
  const canUpdate = ability.can('update', 'TableSession')
  const queryClient = useQueryClient()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const staffName = String(user?.name ?? '')

  const [settleOpen, setSettleOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState(
    /** @type {'cash' | 'card'} */ ('cash'),
  )
  const [amountTendered, setAmountTendered] = useState('')
  const [tenderError, setTenderError] = useState('')
  const [discount, setDiscount] = useState('')
  const [discountError, setDiscountError] = useState('')
  const [couponCodeInput, setCouponCodeInput] = useState('')
  const [couponError, setCouponError] = useState(
    /** @type {string | null} */ (null),
  )
  const [couponValidating, setCouponValidating] = useState(false)
  /** @type {[null | { code: string, discountAmount: string, lineDiscounts: string[] }, function]} */
  const [appliedCoupon, setAppliedCoupon] = useState(
    /** @type {null | { code: string, discountAmount: string, lineDiscounts: string[] }} */ (
      null
    ),
  )
  const [numpadField, setNumpadField] = useState(
    /** @type {null | 'discount' | 'tendered'} */ (null),
  )
  const [receipt, setReceipt] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )

  const query = useQuery({
    queryKey: ['table-session-detail', sessionId],
    queryFn: () => authGet(`/table-sessions/${sessionId}`),
    refetchInterval: settleOpen || receipt ? false : 4000,
    refetchOnWindowFocus: !settleOpen && !receipt,
  })

  const resolveMutation = useMutation({
    mutationFn: (/** @type {string} */ tableId) =>
      authPost(`/tables/${tableId}/resolve-waiter-call`, {}),
    onSuccess: () => {
      toast.success(t('resolveWaiterSuccess'))
      void queryClient.invalidateQueries({
        queryKey: ['table-session-detail', sessionId],
      })
      void queryClient.invalidateQueries({ queryKey: ['table-sessions-floor'] })
      void queryClient.invalidateQueries({
        queryKey: TABLE_SESSION_ALERTS_QUERY_KEY,
      })
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const reopenMutation = useMutation({
    mutationFn: () =>
      authPost(`/table-sessions/${sessionId}/reopen-ordering`, {}),
    onSuccess: () => {
      toast.success(t('reopenSuccess'))
      void queryClient.invalidateQueries({
        queryKey: ['table-session-detail', sessionId],
      })
      void queryClient.invalidateQueries({ queryKey: ['table-sessions-floor'] })
      void queryClient.invalidateQueries({
        queryKey: TABLE_SESSION_ALERTS_QUERY_KEY,
      })
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const settleMutation = useMutation({
    mutationFn: async () => {
      const redeemActive =
        query.data?.session?.requestedRedeemPoints != null &&
        String(query.data.session.requestedRedeemPoints).trim() !== ''
      /** @type {Record<string, unknown>} */
      const body = { paymentMethod }
      if (paymentMethod === 'cash') {
        body.amountTendered = decimalStringFromNumber(
          parseMoney(amountTendered.trim()),
        )
      }
      const offerLinesActive = (
        Array.isArray(query.data?.lines) ? query.data.lines : []
      ).some((line) => Boolean(line?.offerId))
      // Offers / deals are exclusive: never send coupon or manual discount.
      if (!redeemActive && !offerLinesActive) {
        if (appliedCoupon?.code) {
          body.couponCode = appliedCoupon.code
        } else if (discount.trim()) {
          body.discount = discount.trim()
        }
      }
      return authPost(`/table-sessions/${sessionId}/settle`, body)
    },
    onSuccess: (data) => {
      const invoice = data?.invoice
      // Settled and invoiced, but the ZATCA report failed (no QR yet).
      if (invoice && !(typeof invoice.qrCode === 'string' && invoice.qrCode)) {
        toast.warning(t('settleSuccessZatcaPending'))
      } else {
        toast.success(t('settleSuccess'))
      }
      if (data?.loyaltyRedeem?.clamped) {
        toast.message(t('settleRedeemClamped'))
      }
      setSettleOpen(false)
      setTenderError('')
      setDiscountError('')
      setNumpadField(null)
      setDiscount('')
      setCouponCodeInput('')
      setCouponError(null)
      setAppliedCoupon(null)
      void queryClient.invalidateQueries({ queryKey: ['table-sessions-floor'] })
      void queryClient.invalidateQueries({
        queryKey: TABLE_SESSION_ALERTS_QUERY_KEY,
      })

      if (invoice && typeof invoice === 'object') {
        if (typeof onSettled === 'function') {
          onSettled(/** @type {Record<string, unknown>} */ (invoice))
        } else {
          setReceipt(/** @type {Record<string, unknown>} */ (invoice))
        }
        return
      }

      if (embedded) {
        onClose?.()
      } else {
        router.push('/pos?tab=tables')
        router.refresh()
      }
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      if (code === 'INSUFFICIENT_TENDER') {
        setTenderError(tErr('INSUFFICIENT_TENDER'))
        return
      }
      if (code === 'DISCOUNT_EXCEEDS_CAP' || code === 'INVALID_DISCOUNT') {
        setDiscountError(code ? tErr(code) : tPos('validationDiscount'))
        return
      }
      if (
        code === 'COUPON_AND_MANUAL_DISCOUNT_CONFLICT' ||
        code === 'COUPON_AND_LOYALTY_CONFLICT' ||
        code === 'LOYALTY_AND_MANUAL_DISCOUNT_CONFLICT' ||
        code === 'COUPON_NOT_FOUND' ||
        code === 'COUPON_NOT_ELIGIBLE' ||
        code === 'COUPON_USAGE_LIMIT' ||
        code === 'INVALID_COUPON_CODE' ||
        code === 'COUPON_INACTIVE' ||
        code === 'COUPON_EXPIRED' ||
        code === 'COUPON_BELOW_MIN_ORDER'
      ) {
        setCouponError(code ? tErr(code) : tErr('generic'))
        return
      }
      if (code === 'OFFERS_EXCLUSIVE_DISCOUNT') {
        setAppliedCoupon(null)
        setDiscount('')
        setDiscountError(tErr('OFFERS_EXCLUSIVE_DISCOUNT'))
        void query.refetch()
        return
      }
      if (code === 'SESSION_ROUNDS_NOT_READY') {
        setTenderError('')
        toast.error(tErr('SESSION_ROUNDS_NOT_READY'))
        return
      }
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const lines = Array.isArray(query.data?.lines) ? query.data.lines : []
  const hasOfferLines = lines.some((line) => Boolean(line?.offerId))
  const offerSavingsInclVat = useMemo(() => {
    const raw = query.data?.billingEstimate?.offerSavingsInclVat
    if (raw == null || parseMoney(raw) <= 0) return null
    return String(raw)
  }, [query.data?.billingEstimate?.offerSavingsInclVat])
  const loyaltyRedeemActive = useMemo(() => {
    const pts = query.data?.session?.requestedRedeemPoints
    return pts != null && String(pts).trim() !== ''
  }, [query.data?.session?.requestedRedeemPoints])

  const settleUi = query.data?.settleUi ?? {}
  const keypadEnabled = settleUi.posOnScreenKeypad === true
  const hasAvailableCoupons = settleUi.hasAvailableCoupons === true
  const discountCapLimit = parseDiscountCap(settleUi.discountCap)

  const estimatedTotal = useMemo(() => {
    const fromApi = query.data?.billingEstimate?.dueInclVat
    if (fromApi != null && String(fromApi).trim() !== '') {
      return String(fromApi)
    }
    let sum = 0
    for (const line of lines) {
      sum += computeLineAmounts({
        quantity: Number(line.quantity) || 0,
        unitPrice: String(line.unitPrice ?? '0'),
        vatPreset: String(line.vatPreset ?? 'standard'),
      }).lineTotal
    }
    return decimalStringFromNumber(sum)
  }, [lines, query.data?.billingEstimate?.dueInclVat])

  const estimatedGrossTotal = useMemo(() => {
    const fromApi = query.data?.billingEstimate?.totalInclVat
    if (fromApi != null && String(fromApi).trim() !== '') {
      return String(fromApi)
    }
    return estimatedTotal
  }, [estimatedTotal, query.data?.billingEstimate?.totalInclVat])

  const loyaltyDiscountMoney = useMemo(() => {
    const fromApi = query.data?.billingEstimate?.loyaltyDiscountMoney
    if (fromApi == null || String(fromApi).trim() === '') return null
    if (parseMoney(fromApi) <= 0) return null
    return String(fromApi)
  }, [query.data?.billingEstimate?.loyaltyDiscountMoney])

  const settleDueTotal = useMemo(() => {
    if (loyaltyRedeemActive) return estimatedTotal
    // Billing estimate is already net of offers; no other discount applies.
    if (hasOfferLines) return estimatedGrossTotal
    const baseLines = lines.map((line) => ({
      quantity: Number(line.quantity) || 0,
      unitPrice: String(line.unitPrice ?? '0'),
      vatPreset: String(line.vatPreset ?? 'standard'),
      discount: '0.00',
    }))
    if (baseLines.length === 0) return estimatedGrossTotal
    if (appliedCoupon?.lineDiscounts?.length) {
      const priced = baseLines.map((line, i) => ({
        ...line,
        discount: appliedCoupon.lineDiscounts[i] ?? '0.00',
      }))
      return computeInvoiceTotals(priced).grandTotal
    }
    const disc = discount.trim()
    if (disc && isValidDiscountPercent(disc)) {
      const money = orderDiscountMoneyFromPercent(baseLines, disc)
      const lineDiscounts = allocateOrderDiscount(baseLines, money)
      const priced = baseLines.map((line, i) => ({
        ...line,
        discount: lineDiscounts[i] ?? '0.00',
      }))
      return computeInvoiceTotals(priced).grandTotal
    }
    return estimatedGrossTotal
  }, [
    loyaltyRedeemActive,
    hasOfferLines,
    estimatedTotal,
    estimatedGrossTotal,
    lines,
    appliedCoupon,
    discount,
  ])

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-hisabi-xxl">
        <AppLoader />
      </div>
    )
  }

  if (query.isError || !query.data) {
    const code =
      query.error instanceof AuthApiError ? query.error.code : undefined
    return (
      <div
        className={cn(
          'space-y-hisabi-md',
          !embedded && 'mx-auto w-full max-w-hisabi-container pb-hisabi-xxl',
        )}
      >
        {!embedded ? (
          <PageBackButton href="/pos?tab=tables" label={t('backToFloor')} />
        ) : null}
        <p className="type-body-md text-hisabi-error text-center">
          {code ? tErr(code) : tErr('generic')}
        </p>
      </div>
    )
  }

  const data = query.data
  const tableName = String(data.table?.name ?? '')
  const tableStatus = String(data.table?.status ?? 'available')
  const session = data.session ?? {}
  const waiterCall = data.waiterCall ?? {}
  const billRequested = Boolean(session.billRequested)
  const redeemPoints =
    session.requestedRedeemPoints != null &&
    String(session.requestedRedeemPoints).trim() !== ''
      ? String(session.requestedRedeemPoints)
      : null
  const waiterActive = Boolean(waiterCall.waiterCallActive)
  const tableId = String(data.table?.id ?? '')
  const rounds = Array.isArray(data.rounds) ? data.rounds : []
  const roundsReadyToSettle =
    rounds.length > 0 &&
    rounds.every((r) => {
      const s = String(r.status ?? '')
      return s === 'completed' || s === 'cancelled'
    }) &&
    rounds.some((r) => String(r.status ?? '') === 'completed')
  const canSettle =
    canUpdate && roundsReadyToSettle && lines.length > 0

  /**
   * @param {Record<string, unknown>} line
   */
  function lineDisplayName(line) {
    if (locale.startsWith('ar')) {
      return String(line.nameAr ?? line.nameEn ?? '')
    }
    return String(line.nameEn || line.nameAr || '')
  }

  /**
   * @param {Record<string, unknown>} line
   */
  function lineModifierText(line) {
    const snap =
      line.modifiersSnapshot && typeof line.modifiersSnapshot === 'object'
        ? /** @type {Record<string, unknown>} */ (line.modifiersSnapshot)
        : null
    const variantOptions = Array.isArray(snap?.variantOptions)
      ? snap.variantOptions
      : []
    const customs = Array.isArray(snap?.customizations)
      ? snap.customizations
      : []
    return [
      ...variantOptions.map((v) =>
        locale.startsWith('ar')
          ? String(v.optionNameAr ?? '')
          : String(v.optionNameEn || v.optionNameAr || ''),
      ),
      ...customs.map((c) =>
        locale.startsWith('ar')
          ? String(c.nameAr ?? '')
          : String(c.nameEn || c.nameAr || ''),
      ),
    ]
      .filter(Boolean)
      .join(' · ')
  }

  /**
   * VAT-inclusive line total before / after its locked offer discount.
   * @param {Record<string, unknown>} line
   */
  function lineInclAmounts(line) {
    const base = {
      quantity: Number(line.quantity) || 0,
      unitPrice: String(line.unitPrice ?? '0'),
      vatPreset: String(line.vatPreset ?? 'standard'),
    }
    return {
      gross: computeLineAmounts({ ...base, discount: '0' }).lineTotal,
      net: computeLineAmounts({
        ...base,
        discount: line.offerId ? String(line.offerDiscount ?? '0') : '0',
      }).lineTotal,
    }
  }

  /**
   * @param {number} gross
   * @param {number} net
   */
  function renderLinePrice(gross, net) {
    const discounted = net + 0.004 < gross
    return (
      <span className="type-body-sm inline-flex flex-wrap items-baseline justify-end gap-x-hisabi-xs">
        {discounted ? (
          <span className="text-hisabi-on-surface-variant line-through">
            {formatSarAmount(gross, locale)}
          </span>
        ) : null}
        <span
          className={cn(
            'font-semibold',
            discounted ? 'text-hisabi-primary' : 'text-hisabi-on-surface',
          )}
        >
          {formatSarAmount(net, locale)}
        </span>
      </span>
    )
  }

  /** Lines grouped for display: deal components under their deal. */
  const lineEntries = (() => {
    /** @type {Array<any>} */
    const entries = []
    /** @type {Map<string, any>} */
    const deals = new Map()
    for (const line of lines) {
      const key = line.offerGroupKey ? String(line.offerGroupKey) : ''
      if (!key) {
        entries.push({ type: 'line', line })
        continue
      }
      let deal = deals.get(key)
      if (!deal) {
        deal = { type: 'deal', key, offerId: String(line.offerId ?? ''), lines: [] }
        deals.set(key, deal)
        entries.push(deal)
      }
      deal.lines.push(line)
    }
    return entries
  })()

  /**
   * @param {string} status
   */
  function roundStatusLabel(status) {
    if (status === 'pending') return tKitchen('pending')
    if (status === 'preparing') return tKitchen('preparing')
    if (status === 'ready') return tKitchen('ready')
    if (status === 'completed') return t('statusCompleted')
    if (status === 'cancelled') return t('statusCancelled')
    return status
  }

  function openSettle() {
    setPaymentMethod('cash')
    setDiscount('')
    setDiscountError('')
    setCouponCodeInput('')
    setCouponError(null)
    setAppliedCoupon(null)
    setNumpadField(null)
    setTenderError('')
    setAmountTendered(settleDueTotal)
    setSettleOpen(true)
  }

  function openNumpad(/** @type {'discount' | 'tendered'} */ field) {
    if (!keypadEnabled) return
    setNumpadField(field)
  }

  function handleNumpadKey(/** @type {string} */ key) {
    if (numpadField === 'discount') {
      setDiscount((prev) => applyNumpadKey(prev, key))
      if (discountError) setDiscountError('')
      return
    }
    if (numpadField === 'tendered') {
      setAmountTendered((prev) => applyNumpadKey(prev, key))
      if (tenderError) setTenderError('')
    }
  }

  async function handleApplyCoupon() {
    const code = couponCodeInput.trim()
    if (!code) {
      setCouponError(tPos('couponCodeRequired'))
      return
    }
    if (hasOfferLines) {
      setCouponError(t('offers.discountsBlocked'))
      return
    }
    if (loyaltyRedeemActive || discount.trim()) {
      setCouponError(
        loyaltyRedeemActive
          ? tPos('couponDisabledByLoyaltyHint')
          : tPos('couponBlockedByDiscount'),
      )
      return
    }
    setCouponValidating(true)
    setCouponError(null)
    try {
      const data = await authPost('/pos/coupons/validate', {
        code,
        lines: lines.map((line) => ({
          menuItemId: String(line.menuItemId),
          quantity: Number(line.quantity) || 1,
          variantOptionIds: Array.isArray(line.variantOptionIds)
            ? line.variantOptionIds.map(String)
            : [],
          customizationIds: Array.isArray(line.customizationIds)
            ? line.customizationIds.map(String)
            : [],
        })),
      })
      const rows = Array.isArray(data.lineDiscounts) ? data.lineDiscounts : []
      const lineDiscounts = rows.map((row) =>
        row && typeof row === 'object' && 'discount' in row
          ? String(/** @type {{ discount: unknown }} */ (row).discount ?? '0.00')
          : '0.00',
      )
      const coupon =
        data.coupon && typeof data.coupon === 'object' ? data.coupon : {}
      setAppliedCoupon({
        code: String(
          /** @type {{ code?: unknown }} */ (coupon).code ?? code,
        ).toUpperCase(),
        discountAmount: String(data.discountAmount ?? '0.00'),
        lineDiscounts,
      })
      const previewLines = lines.map((line, i) => ({
        quantity: Number(line.quantity) || 0,
        unitPrice: String(line.unitPrice ?? '0'),
        vatPreset: String(line.vatPreset ?? 'standard'),
        discount: lineDiscounts[i] ?? '0.00',
      }))
      if (paymentMethod === 'cash' && previewLines.length > 0) {
        setAmountTendered(computeInvoiceTotals(previewLines).grandTotal)
      }
      if (numpadField === 'discount') setNumpadField(null)
      if (discountError) setDiscountError('')
    } catch (err) {
      setAppliedCoupon(null)
      const errCode = err instanceof AuthApiError ? err.code : undefined
      setCouponError(errCode ? tErr(errCode) : tErr('generic'))
    } finally {
      setCouponValidating(false)
    }
  }

  function confirmSettle() {
    setTenderError('')
    setDiscountError('')
    if (!loyaltyRedeemActive && !hasOfferLines && discount.trim()) {
      if (!isValidDiscountPercent(discount.trim())) {
        setDiscountError(tPos('validationDiscount'))
        return
      }
      if (!isDiscountWithinCap(discount.trim(), settleUi.discountCap)) {
        setDiscountError(tPos('validationDiscountCap'))
        return
      }
    }
    if (paymentMethod === 'cash') {
      const tendered = amountTendered.trim()
      const tenderedN = parseMoney(tendered)
      const dueN = parseMoney(settleDueTotal)
      if (!tendered || tenderedN <= 0) {
        setTenderError(t('settleTenderRequired'))
        return
      }
      if (tenderedN + 1e-9 < dueN) {
        setTenderError(tErr('INSUFFICIENT_TENDER'))
        return
      }
    }
    settleMutation.mutate()
  }

  const restaurantName =
    typeof receipt?.sellerName === 'string' ? String(receipt.sellerName) : ''

  const body = (
    <>
      {!embedded ? (
        <div>
          <PageBackButton href="/pos?tab=tables" label={t('backToFloor')} />
          <header className="flex flex-wrap items-start justify-between gap-hisabi-md">
            <div className="space-y-1">
              <h1 className="type-headline-xl text-hisabi-on-surface tracking-tight">
                {t('detailTitle', { name: tableName })}
              </h1>
              <p className="type-body-md text-hisabi-on-surface-variant">
                {t('detailSubtitle')}
              </p>
            </div>
            <span
              className={cn(
                'type-label-sm inline-flex rounded-full px-hisabi-sm py-0.5 font-medium',
                tableStatus === 'occupied'
                  ? 'bg-hisabi-error/10 text-hisabi-error'
                  : 'bg-hisabi-teal-container/30 text-hisabi-teal',
              )}
            >
              {tableStatus === 'occupied'
                ? t('statusOccupied')
                : t('statusAvailable')}
            </span>
          </header>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-hisabi-sm">
          <p className="type-body-sm text-hisabi-on-surface-variant">
            {t('detailSubtitle')}
          </p>
          <span
            className={cn(
              'type-label-sm inline-flex rounded-full px-hisabi-sm py-0.5 font-medium',
              tableStatus === 'occupied'
                ? 'bg-hisabi-error/10 text-hisabi-error'
                : 'bg-hisabi-teal-container/30 text-hisabi-teal',
            )}
          >
            {tableStatus === 'occupied'
              ? t('statusOccupied')
              : t('statusAvailable')}
          </span>
        </div>
      )}

      {(billRequested || waiterActive) && (
        <div className="flex flex-wrap gap-hisabi-sm rounded-hisabi-xl border border-hisabi-error/40 bg-hisabi-error/5 p-hisabi-md">
          {billRequested ? (
            <span className="type-label-sm inline-flex animate-pulse items-center gap-1 rounded-full border border-hisabi-error/40 bg-hisabi-error/10 px-hisabi-sm py-0.5 font-semibold text-hisabi-error">
              <Receipt className="size-3.5" aria-hidden />
              {t('badgeBillRequested')}
            </span>
          ) : null}
          {waiterActive ? (
            <span className="type-label-sm inline-flex animate-pulse items-center gap-1 rounded-full border border-hisabi-error/40 bg-hisabi-error/10 px-hisabi-sm py-0.5 font-semibold text-hisabi-error">
              <Bell className="size-3.5" aria-hidden />
              {t('badgeWaiterRequested')}
            </span>
          ) : null}
          {redeemPoints ? (
            <span className="type-label-sm text-hisabi-on-surface-variant">
              {t('redeemRequested', { points: redeemPoints })}
            </span>
          ) : null}
        </div>
      )}

      <section className="space-y-hisabi-sm">
        <h2 className="type-title-md text-hisabi-on-surface font-semibold">
          {t('roundsHeading')}
        </h2>
        {rounds.length === 0 ? (
          <p className="type-body-md text-hisabi-on-surface-variant">
            {t('roundsEmpty')}
          </p>
        ) : (
          <ul className="divide-y divide-hisabi-outline-variant/20 overflow-hidden rounded-hisabi-xl border border-hisabi-outline-variant/30">
            {rounds.map((round) => (
              <li
                key={String(round.id)}
                className="flex flex-wrap items-center justify-between gap-hisabi-sm bg-hisabi-surface-container-lowest px-hisabi-md py-hisabi-sm"
              >
                <div>
                  <p className="type-label-md text-hisabi-on-surface font-semibold">
                    {t('roundLabel', {
                      round: String(round.roundNumber ?? '—'),
                      order: String(round.orderNumber ?? ''),
                    })}
                  </p>
                </div>
                <span className="type-label-sm text-hisabi-on-surface-variant">
                  {roundStatusLabel(String(round.status ?? ''))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-hisabi-sm">
        <h2 className="type-title-md text-hisabi-on-surface font-semibold">
          {t('itemsHeading')}
        </h2>
        {lines.length === 0 ? (
          <p className="type-body-md text-hisabi-on-surface-variant">
            {t('itemsEmpty')}
          </p>
        ) : (
          <ul className="divide-y divide-hisabi-outline-variant/20 overflow-hidden rounded-hisabi-xl border border-hisabi-outline-variant/30">
            {lineEntries.map((entry) => {
              if (entry.type === 'deal') {
                const first = entry.lines[0]
                const offer =
                  first?.offerNameAr || first?.offerNameEn
                    ? { nameAr: first.offerNameAr, nameEn: first.offerNameEn }
                    : null
                let gross = 0
                let net = 0
                for (const l of entry.lines) {
                  const a = lineInclAmounts(l)
                  gross += a.gross
                  net += a.net
                }
                return (
                  <li
                    key={entry.key}
                    className="bg-hisabi-surface-container-lowest px-hisabi-md py-hisabi-sm"
                  >
                    <div className="flex items-start justify-between gap-hisabi-sm">
                      <p className="type-label-md text-hisabi-on-surface inline-flex min-w-0 flex-wrap items-center gap-hisabi-xs font-semibold">
                        <span className="type-label-sm bg-hisabi-primary/10 text-hisabi-primary inline-flex rounded-full px-hisabi-sm py-0.5 font-semibold">
                          {t('offers.dealBadge')}
                        </span>
                        <span className="min-w-0">
                          {offer
                            ? lineDisplayName(offer)
                            : t('offers.dealGeneric')}
                        </span>
                      </p>
                      {renderLinePrice(gross, net)}
                    </div>
                    <ul className="mt-hisabi-xs space-y-0.5 border-s-2 border-hisabi-outline-variant/40 ps-hisabi-sm">
                      {entry.lines.map((l) => {
                        const mods = lineModifierText(l)
                        return (
                          <li
                            key={String(l.id)}
                            className="flex items-start justify-between gap-hisabi-sm"
                          >
                            <span className="type-body-sm text-hisabi-on-surface min-w-0">
                              {lineDisplayName(l)}
                              {mods ? (
                                <span className="text-hisabi-on-surface-variant">
                                  {' · '}
                                  {mods}
                                </span>
                              ) : null}
                            </span>
                            <span className="type-label-sm text-hisabi-on-surface shrink-0 font-semibold">
                              ×{Number(l.quantity) || 0}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              }
              const line = entry.line
              const mods = lineModifierText(line)
              const amounts = lineInclAmounts(line)
              return (
                <li
                  key={String(line.id)}
                  className="bg-hisabi-surface-container-lowest px-hisabi-md py-hisabi-sm"
                >
                  <div className="flex items-start justify-between gap-hisabi-sm">
                    <div className="min-w-0 space-y-0.5">
                      <p className="type-label-md text-hisabi-on-surface font-semibold">
                        {lineDisplayName(line)}
                      </p>
                      {mods ? (
                        <p className="type-body-sm text-hisabi-on-surface-variant">
                          {mods}
                        </p>
                      ) : null}
                      {line.lineNote ? (
                        <p className="type-body-sm text-hisabi-on-surface-variant italic">
                          {String(line.lineNote)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="type-label-md text-hisabi-on-surface font-semibold">
                        ×{Number(line.quantity) || 0}
                      </span>
                      {line.offerId
                        ? renderLinePrice(amounts.gross, amounts.net)
                        : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="type-label-md text-hisabi-on-surface flex items-center justify-between font-semibold">
        <span>{t('settleEstimatedTotal')}</span>
        <span className="type-headline-sm text-hisabi-primary">
          {estimatedTotal}
        </span>
      </p>
      {offerSavingsInclVat ? (
        <p className="type-body-sm text-hisabi-primary -mt-hisabi-sm flex items-center justify-between font-medium">
          <span>{t('offers.offerSavings')}</span>
          <span>−{formatSarAmount(offerSavingsInclVat, locale)}</span>
        </p>
      ) : null}
      {loyaltyDiscountMoney && redeemPoints ? (
        <p className="type-body-sm text-hisabi-on-surface-variant -mt-hisabi-sm">
          {t('settleLoyaltyDiscountHint', {
            gross: estimatedGrossTotal,
            discount: loyaltyDiscountMoney,
            points: redeemPoints,
          })}
        </p>
      ) : null}

      {!roundsReadyToSettle && lines.length > 0 ? (
        <p className="type-body-sm text-hisabi-on-surface-variant rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container px-hisabi-md py-hisabi-sm">
          {t('settleRoundsNotReadyHint')}
        </p>
      ) : null}

      <section className="flex flex-col gap-hisabi-sm sm:flex-row sm:flex-wrap">
        {canUpdate && waiterActive && tableId ? (
          <button
            type="button"
            disabled={resolveMutation.isPending || settleMutation.isPending}
            onClick={() => resolveMutation.mutate(tableId)}
            className="type-label-md border-hisabi-outline-variant/40 text-hisabi-on-surface inline-flex min-h-[48px] items-center justify-center rounded-xl border px-hisabi-lg font-semibold transition hover:bg-hisabi-surface-container disabled:opacity-50"
          >
            {resolveMutation.isPending
              ? t('resolveWaiterPending')
              : t('resolveWaiter')}
          </button>
        ) : null}

        {canUpdate && billRequested ? (
          <button
            type="button"
            disabled={reopenMutation.isPending || settleMutation.isPending}
            onClick={() => reopenMutation.mutate()}
            className="type-label-md border-hisabi-outline-variant/40 text-hisabi-on-surface inline-flex min-h-[48px] items-center justify-center rounded-xl border px-hisabi-lg font-semibold transition hover:bg-hisabi-surface-container disabled:opacity-50"
          >
            {reopenMutation.isPending ? t('reopenPending') : t('reopenOrdering')}
          </button>
        ) : null}

        {canSettle ? (
          <AuthSubmitButton
            type="button"
            variant="muted"
            pending={settleMutation.isPending}
            onClick={openSettle}
            className="sm:w-auto"
          >
            {t('settleAction')}
          </AuthSubmitButton>
        ) : null}
      </section>

      <HisabiStatusModal
        open={settleOpen}
        onOpenChange={(open) => {
          if (!settleMutation.isPending) {
            setSettleOpen(open)
            if (!open) {
              setTenderError('')
              setDiscountError('')
              setNumpadField(null)
            }
          }
        }}
        variant="warning"
        title={t('settleTitle', { name: tableName })}
        description={
          <div className="space-y-hisabi-md text-start">
            <p className="type-body-md text-hisabi-on-surface-variant">
              {t('settleBody', { total: settleDueTotal })}
            </p>
            {redeemPoints && loyaltyDiscountMoney ? (
              <p className="type-body-sm text-hisabi-on-surface-variant">
                {t('settleRedeemNote', {
                  points: redeemPoints,
                  discount: loyaltyDiscountMoney,
                  gross: estimatedGrossTotal,
                })}
              </p>
            ) : redeemPoints ? (
              <p className="type-body-sm text-hisabi-on-surface-variant">
                {t('settleRedeemNotePending', { points: redeemPoints })}
              </p>
            ) : null}

            {!loyaltyRedeemActive && hasOfferLines ? (
              <p
                className="type-body-sm text-hisabi-on-surface-variant rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container px-hisabi-md py-hisabi-sm"
                role="note"
              >
                {t('offers.discountsBlocked')}
              </p>
            ) : null}
            {!loyaltyRedeemActive ? (
              <>
                {hasAvailableCoupons ? (
                  <div className="space-y-hisabi-xs">
                    <div className="flex items-center justify-between gap-hisabi-sm">
                      <label
                        htmlFor="settle-coupon-code"
                        className="type-label-md text-hisabi-on-surface font-semibold"
                      >
                        {tPos('couponCode')}
                      </label>
                      {appliedCoupon ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedCoupon(null)
                            setCouponCodeInput('')
                            setCouponError(null)
                          }}
                          className="type-label-sm text-hisabi-error hover:bg-hisabi-error/8 inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-0.5 font-bold transition-colors"
                        >
                          <X className="size-3.5 shrink-0" aria-hidden />
                          {tPos('couponRemove')}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex gap-hisabi-sm">
                      <input
                        id="settle-coupon-code"
                        type="text"
                        dir="ltr"
                        autoCapitalize="characters"
                        spellCheck={false}
                        disabled={
                          hasOfferLines ||
                          Boolean(discount.trim()) ||
                          couponValidating ||
                          settleMutation.isPending
                        }
                        value={couponCodeInput}
                        onChange={(e) => {
                          setCouponCodeInput(e.target.value.toUpperCase())
                          if (couponError) setCouponError(null)
                        }}
                        placeholder={tPos('couponCodePlaceholder')}
                        aria-invalid={couponError ? true : undefined}
                        className={cn(
                          'type-body-md text-hisabi-on-surface w-full min-w-0 rounded-xl border bg-hisabi-surface-container-lowest px-hisabi-md py-hisabi-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                          couponError
                            ? 'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'
                            : 'border-hisabi-outline-variant/40 focus:border-hisabi-primary focus:ring-hisabi-primary/25',
                        )}
                      />
                      <button
                        type="button"
                        disabled={
                          hasOfferLines ||
                          couponValidating ||
                          Boolean(discount.trim()) ||
                          appliedCoupon != null ||
                          !couponCodeInput.trim() ||
                          settleMutation.isPending
                        }
                        onClick={() => void handleApplyCoupon()}
                        className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-xs rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-md py-2 font-bold text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {couponValidating ? (
                          <AuthButtonSpinner />
                        ) : (
                          tPos('couponApply')
                        )}
                      </button>
                    </div>
                    {discount.trim() ? (
                      <p className="type-body-sm text-hisabi-on-surface-variant">
                        {tPos('couponDisabledHint')}
                      </p>
                    ) : null}
                    {couponError ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {couponError}
                      </p>
                    ) : null}
                    {appliedCoupon && !couponError ? (
                      <p
                        className="type-body-sm font-medium text-green-700"
                        role="status"
                      >
                        {tPos('couponApplied', {
                          amount: formatSarAmount(
                            appliedCoupon.discountAmount,
                            locale,
                          ),
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-hisabi-xs">
                  <label
                    htmlFor="settle-discount"
                    className="type-label-md text-hisabi-on-surface font-semibold"
                  >
                    {tPos('discount')}
                  </label>
                  <PosMoneyField
                    id="settle-discount"
                    keypadEnabled={keypadEnabled}
                    active={numpadField === 'discount'}
                    dir="ltr"
                    disabled={
                      hasOfferLines ||
                      appliedCoupon != null ||
                      settleMutation.isPending
                    }
                    value={discount}
                    onChange={(e) => {
                      if (keypadEnabled) return
                      if (appliedCoupon || hasOfferLines) return
                      setDiscount(e.target.value)
                      if (discountError) setDiscountError('')
                    }}
                    onClick={() => {
                      if (appliedCoupon || hasOfferLines) return
                      openNumpad('discount')
                    }}
                    onFocus={() => {
                      if (appliedCoupon || hasOfferLines) return
                      openNumpad('discount')
                    }}
                    placeholder={tPos('discountPlaceholder')}
                    className={cn(
                      'type-body-md text-hisabi-on-surface w-full rounded-xl border bg-hisabi-surface-container-lowest px-hisabi-md py-hisabi-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                      discountError
                        ? 'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'
                        : 'border-hisabi-outline-variant/40 focus:border-hisabi-primary focus:ring-hisabi-primary/25',
                    )}
                    aria-invalid={discountError ? true : undefined}
                  />
                  {discountError ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {discountError}
                    </p>
                  ) : null}
                  {appliedCoupon ? (
                    <p className="type-body-sm text-hisabi-on-surface-variant">
                      {tPos('discountDisabledHint')}
                    </p>
                  ) : null}
                  {discountCapLimit != null && !appliedCoupon && !hasOfferLines ? (
                    <p className="type-body-sm text-hisabi-on-surface-variant">
                      {tPos('discountCapHint', { percent: discountCapLimit })}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            <fieldset className="space-y-hisabi-sm">
              <legend className="type-label-md text-hisabi-on-surface font-semibold">
                {t('settlePaymentMethod')}
                <span className="text-hisabi-error" aria-hidden>
                  {' '}
                  *
                </span>
              </legend>
              <div className="flex flex-wrap gap-hisabi-sm">
                {/** @type {Array<'cash' | 'card'>} */ (['cash', 'card']).map(
                  (key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(key)
                        setTenderError('')
                        if (key !== 'cash' && numpadField === 'tendered') {
                          setNumpadField(null)
                        }
                      }}
                      className={cn(
                        'type-label-md inline-flex min-h-10 min-w-[5.5rem] items-center justify-center rounded-xl border px-hisabi-md font-semibold transition',
                        paymentMethod === key
                          ? 'border-hisabi-primary bg-hisabi-primary text-hisabi-on-primary'
                          : 'border-hisabi-outline-variant/40 text-hisabi-on-surface hover:bg-hisabi-surface-container',
                      )}
                    >
                      {key === 'cash' ? t('settleCash') : t('settleCard')}
                    </button>
                  ),
                )}
              </div>
            </fieldset>
            {paymentMethod === 'cash' ? (
              <label className="block space-y-1">
                <span className="type-label-md text-hisabi-on-surface font-semibold">
                  {t('settleAmountTendered')}
                  <span className="text-hisabi-error" aria-hidden>
                    {' '}
                    *
                  </span>
                </span>
                <PosMoneyField
                  id="settle-amount-tendered"
                  keypadEnabled={keypadEnabled}
                  active={numpadField === 'tendered'}
                  dir="ltr"
                  disabled={settleMutation.isPending}
                  value={amountTendered}
                  onChange={(e) => {
                    if (keypadEnabled) return
                    setAmountTendered(e.target.value)
                    if (tenderError) setTenderError('')
                  }}
                  onClick={() => openNumpad('tendered')}
                  onFocus={() => openNumpad('tendered')}
                  placeholder={t('settleAmountPlaceholder')}
                  aria-invalid={tenderError ? true : undefined}
                  className={cn(
                    'type-body-md w-full rounded-xl border bg-hisabi-surface-container-lowest px-hisabi-md py-hisabi-sm outline-none focus:ring-2',
                    tenderError
                      ? 'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'
                      : 'border-hisabi-outline-variant/40 focus:border-hisabi-primary focus:ring-hisabi-primary/25',
                  )}
                />
                {tenderError ? (
                  <p className="type-body-sm text-hisabi-error" role="alert">
                    {tenderError}
                  </p>
                ) : null}
              </label>
            ) : null}
          </div>
        }
        primaryLabel={t('settleConfirm')}
        primaryPending={settleMutation.isPending}
        primaryButtonVariant="muted"
        onPrimary={confirmSettle}
        secondaryLabel={t('cancel')}
        onSecondary={() => {
          setSettleOpen(false)
          setTenderError('')
          setDiscountError('')
          setNumpadField(null)
        }}
      />

      {keypadEnabled ? (
        <PosOnScreenNumpad
          className="z-[120]"
          open={settleOpen && numpadField != null}
          title={
            numpadField === 'tendered'
              ? t('settleAmountTendered')
              : tPos('discount')
          }
          value={numpadField === 'tendered' ? amountTendered : discount}
          onKey={handleNumpadKey}
          onClose={() => setNumpadField(null)}
          onDone={() => setNumpadField(null)}
        />
      ) : null}

      {!embedded && receipt ? (
        <TableSessionReceiptModal
          invoice={receipt}
          staffName={staffName}
          restaurantName={restaurantName}
          onClose={() => {
            setReceipt(null)
            router.push('/pos?tab=tables')
            router.refresh()
          }}
        />
      ) : null}
    </>
  )

  if (embedded) {
    return <div className="space-y-hisabi-lg">{body}</div>
  }

  return (
    <div className="mx-auto w-full max-w-hisabi-container space-y-hisabi-xl pb-hisabi-xxl">
      {body}
    </div>
  )
}
